'use client';

import { buildTex, type TexOptions, type TexImage } from './latex';
import { makeZip, type ZipFile } from './zip';
import { safeFilename } from '@/lib/quiz/csv';
import type { Task } from './types';

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Slika (URL ali data URL) → bajti v obliki, ki jo xelatex bere (png/jpg); ostalo pretvori v png. */
async function fetchImage(img: TexImage): Promise<Uint8Array | null> {
  try {
    const blob = await (await fetch(img.url)).blob();
    if (/\.(png|jpg)$/.test(img.name) && /^image\/(png|jpeg)$/.test(blob.type)) return new Uint8Array(await blob.arrayBuffer());
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0);
    const out = await new Promise<Blob | null>(r => c.toBlob(r, img.name.endsWith('.jpg') ? 'image/jpeg' : 'image/png', 0.92));
    return out ? new Uint8Array(await out.arrayBuffer()) : null;
  } catch { return null; }
}

/**
 * Prenese izbrane naloge kot .tex (brez slik) ali kot .zip (.tex + mapa img/).
 * Vrne število nalog in število slik, ki jih ni bilo mogoče prenesti.
 */
export async function exportTasksTex(tasks: Task[], opts: TexOptions): Promise<{ count: number; images: number; missing: number; zipped: boolean }> {
  const base = safeFilename(opts.title) || 'naloge';
  const { tex, images, count } = buildTex(tasks, opts, base);
  if (!images.length) {
    download(`${base}.tex`, tex, 'application/x-tex;charset=utf-8');
    return { count, images: 0, missing: 0, zipped: false };
  }
  const files: ZipFile[] = [{ name: `${base}.tex`, data: new TextEncoder().encode(tex) }];
  let missing = 0;
  await Promise.all(images.map(async img => {
    const data = await fetchImage(img);
    if (data) files.push({ name: img.name, data }); else missing++;
  }));
  download(`${base}.zip`, makeZip(files), 'application/zip');
  return { count, images: images.length, missing, zipped: true };
}

