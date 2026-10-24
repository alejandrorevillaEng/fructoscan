// Lector de códigos de barras con la cámara.
// Usa el lector nativo del navegador si existe (Chrome Android) y si no, ZXing (Safari/iPhone, Firefox).
// Si las barras salen borrosas y no se leen, prueba también con los números de debajo (OCR en el móvil).
import { isValidEAN, findEAN } from './ean.js';

const ESPERA_NUMEROS = 2500;   // ms sin leer las barras antes de probar con los números
const CADA_NUMEROS = 1200;     // ms entre lecturas de números (el OCR es más pesado que el lector de barras)

export async function startScanner(video, onCode, { onDigitsMode } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('nocamera');
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await video.play();

  let stopped = false; let last = ''; let lastAt = 0; let controls = null; let raf = 0;
  const emit = (raw) => {
    const code = String(raw || '').replace(/\D/g, '');
    if (!isValidEAN(code)) return;
    const now = Date.now();
    if (code === last && now - lastAt < 3000) return;   // la cámara lee lo mismo varias veces por segundo
    last = code; lastAt = now;
    onCode(code);
  };

  // Números de debajo de las barras: solo cuando el lector de barras lleva un rato sin leer nada
  let numerosTimer = 0; let leyendo = false;
  const probarNumeros = async () => {
    if (stopped) return;
    if (!leyendo && Date.now() - lastAt > ESPERA_NUMEROS && video.readyState >= 2) {
      leyendo = true;
      try {
        const { readDigits } = await import('./ocr.js');
        const codigo = findEAN(await readDigits(video));
        if (codigo && !stopped) emit(codigo);
      } catch { /* sin OCR en este navegador: seguimos solo con las barras */ }
      leyendo = false;
    }
    if (!stopped) numerosTimer = setTimeout(probarNumeros, CADA_NUMEROS);
  };
  numerosTimer = setTimeout(() => { if (!stopped) { onDigitsMode?.(); probarNumeros(); } }, ESPERA_NUMEROS);

  let native = false;
  if ('BarcodeDetector' in window) {
    try {
      const fmts = await window.BarcodeDetector.getSupportedFormats();
      if (fmts.includes('ean_13')) {
        native = true;
        const det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'].filter((f) => fmts.includes(f)) });
        let busy = false; let t = 0;
        const loop = async (ts) => {
          if (stopped) return;
          if (!busy && ts - t > 180 && video.readyState >= 2) {
            busy = true; t = ts;
            try { const r = await det.detect(video); if (r[0]) emit(r[0].rawValue); } catch { /* frame no válido */ }
            busy = false;
          }
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      }
    } catch { native = false; }
  }
  if (!native) {
    const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } = await import('../vendor/zxing.js');
    const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]]]);
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
    controls = await reader.decodeFromVideoElement(video, (res) => { if (res && !stopped) emit(res.getText()); });
  }

  const track = stream.getVideoTracks()[0];
  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      clearTimeout(numerosTimer);
      try { controls?.stop(); } catch { /* ya parado */ }
      stream.getTracks().forEach((tr) => tr.stop());
      video.srcObject = null;
    },
    get torchSupported() { return Boolean(track?.getCapabilities?.().torch); },
    async torch(on) { try { await track.applyConstraints({ advanced: [{ torch: on }] }); return true; } catch { return false; } },
  };
}
