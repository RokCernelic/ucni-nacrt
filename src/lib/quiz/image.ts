/**
 * Pomanjša sliko vprašanja (najdaljša stranica ≤ maxSize) in jo vrne kot JPEG data URL.
 * Slike se zaenkrat shranjujejo skupaj s kvizom (brskalnik ima ~5 MB), zato jih držimo
 * majhne (~40–90 KB). Prosojno ozadje (PNG) se zapolni z belo, da so diagrami berljivi.
 */
export async function downscaleImage(file: File, maxSize = 800, quality = 0.75): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Slike ni bilo mogoče prebrati'));
      el.src = url;
    });
    const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}
