// OCR de la lista de ingredientes en el propio móvil (Tesseract.js, español).
// La foto nunca sale del teléfono.
import { cleanOcrText, findSugars } from './analyzer.js';

let workerP = null;
let digitsP = null;
let progressCb = null;

async function createWorker(logger) {
  const { default: Tesseract } = await import('../vendor/tesseract/tesseract.esm.min.js');
  const base = new URL('../', import.meta.url);
  return Tesseract.createWorker('spa', 1, {
    workerPath: new URL('vendor/tesseract/worker.min.js', base).href,
    corePath: new URL('vendor/tesseract/', base).href,
    langPath: new URL('lang', base).href,
    gzip: false,
    workerBlobURL: false,
    cacheMethod: 'write',
    logger,
  });
}

async function getWorker() {
  if (!workerP) workerP = createWorker((m) => progressCb?.(m)).catch((e) => { workerP = null; throw e; });
  return workerP;
}

// Lector aparte para los números del código de barras: solo cifras, sin tocar el de los ingredientes
async function getDigitsWorker() {
  if (!digitsP) {
    digitsP = (async () => {
      const w = await createWorker();
      await w.setParameters({ tessedit_char_whitelist: '0123456789', tessedit_pageseg_mode: '6' });
      return w;
    })().catch((e) => { digitsP = null; throw e; });
  }
  return digitsP;
}

// Prepara la imagen: tamaño adecuado, escala de grises, invertir si el texto es claro sobre fondo oscuro,
// y estirar el contraste.
export async function preprocess(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const long = Math.max(bmp.width, bmp.height);
  const scale = long > 2400 ? 2400 / long : long < 1400 ? 1400 / long : 1;
  const w = Math.round(bmp.width * scale); const hgt = Math.round(bmp.height * scale);
  const c = document.createElement('canvas'); c.width = w; c.height = hgt;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, hgt);
  bmp.close?.();
  realzar(ctx, w, hgt);
  return c;
}

// Escala de grises, invertir si el texto es claro sobre fondo oscuro y estirar el contraste
function realzar(ctx, w, hgt) {
  const img = ctx.getImageData(0, 0, w, hgt); const d = img.data;
  const hist = new Uint32Array(256); let sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0;
    d[i] = g; hist[g]++; sum += g;
  }
  const n = d.length / 4; const mean = sum / n; const invert = mean < 110;
  let acc = 0; let lo = 0; let hi = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > n * 0.02) { lo = v; break; } }
  acc = 0; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > n * 0.02) { hi = v; break; } }
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    let g = Math.min(255, Math.max(0, ((d[i] - lo) * 255) / range));
    if (invert) g = 255 - g;
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(img, 0, 0);
}

// Lee las cifras de la franja central de un fotograma de la cámara (donde caen las barras y sus números)
export async function readDigits(video) {
  const vw = video.videoWidth; const vh = video.videoHeight;
  if (!vw || !vh) return '';
  const sx = vw * 0.1; const sy = vh * 0.28; const sw = vw * 0.8; const sh = vh * 0.44;
  const escala = Math.min(2, 1100 / sw);
  const c = document.createElement('canvas'); c.width = Math.round(sw * escala); c.height = Math.round(sh * escala);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
  realzar(ctx, c.width, c.height);
  const worker = await getDigitsWorker();
  const { data } = await worker.recognize(c);
  return data.text || '';
}

/**
 * @returns {Promise<{raw:string, ingredients:string, sugars:number|null, confidence:number}>}
 */
export async function readIngredients(file, onProgress) {
  progressCb = onProgress;
  onProgress?.({ status: 'preparando imagen', progress: 0 });
  const canvas = await preprocess(file);
  const worker = await getWorker();
  const { data } = await worker.recognize(canvas);
  progressCb = null;
  return {
    raw: data.text,
    ingredients: cleanOcrText(data.text),
    sugars: findSugars(data.text),
    confidence: Math.round(data.confidence || 0),
  };
}
