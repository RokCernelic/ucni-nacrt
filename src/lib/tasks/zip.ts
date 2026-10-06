/** Najmanjši zapis .zip (brez stiskanja) — za paket .tex + slike. */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipFile { name: string; data: Uint8Array }

export function makeZip(files: ZipFile[]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (v: DataView, o: number, x: number) => v.setUint16(o, x, true);
  const u32 = (v: DataView, o: number, x: number) => v.setUint32(o, x, true);

  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 6, 0x0800); u16(lv, 8, 0);
    u16(lv, 10, dosTime); u16(lv, 12, dosDate); u32(lv, 14, crc);
    u32(lv, 18, f.data.length); u32(lv, 22, f.data.length); u16(lv, 26, name.length); u16(lv, 28, 0);
    local.set(name, 30);
    chunks.push(local, f.data);

    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    u32(cv, 0, 0x02014b50); u16(cv, 4, 20); u16(cv, 6, 20); u16(cv, 8, 0x0800); u16(cv, 10, 0);
    u16(cv, 12, dosTime); u16(cv, 14, dosDate); u32(cv, 16, crc);
    u32(cv, 20, f.data.length); u32(cv, 24, f.data.length); u16(cv, 28, name.length);
    u16(cv, 30, 0); u16(cv, 32, 0); u16(cv, 34, 0); u16(cv, 36, 0); u32(cv, 38, 0); u32(cv, 42, offset);
    cd.set(name, 46);
    central.push(cd);
    offset += local.length + f.data.length;
  }

  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  u32(ev, 0, 0x06054b50); u16(ev, 4, 0); u16(ev, 6, 0); u16(ev, 8, files.length); u16(ev, 10, files.length);
  u32(ev, 12, cdSize); u32(ev, 16, offset); u16(ev, 20, 0);

  const all = [...chunks, ...central, end];
  const out = new Uint8Array(new ArrayBuffer(all.reduce((s, c) => s + c.length, 0)));
  let p = 0;
  for (const c of all) { out.set(c, p); p += c.length; }
  return out;
}
