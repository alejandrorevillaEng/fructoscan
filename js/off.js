// Cliente de Open Food Facts con buenas prácticas:
// caché local -> API, con validación, límite de ritmo,
// tiempo máximo, reintento con espera, manejo de 429, deduplicación y uso de datos antiguos si falla.
import { store } from './store.js';
import { isValidEAN } from './ean.js';

const API = 'https://world.openfoodfacts.org/api/v2/product/';
const FIELDS = 'code,product_name,product_name_es,brands,image_front_small_url,nutriments,ingredients_text_es,ingredients_text,serving_quantity';
const TIMEOUT_MS = 5000;
const FRESH_DAYS = 30;
const MAX_PER_MIN = 12;           // por debajo del límite oficial (15/min por IP)

const inflight = new Map();
const calls = [];
let blockedUntil = 0;

export class ApiError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// ---------- validación / saneado de la respuesta ----------
const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max) : '');
const numIn = (v, lo, hi) => { const n = typeof v === 'string' ? parseFloat(v) : v; return typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 10) / 10 : null; };
const safeImg = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && /^(images|static)\.openfoodfacts\.org$/.test(x.hostname) ? x.href : ''; } catch { return ''; } };

export function sanitizeProduct(ean, p) {
  const n = (p && typeof p.nutriments === 'object' && p.nutriments) || {};
  return {
    ean,
    name: str(p.product_name_es, 200) || str(p.product_name, 200),
    brand: str(p.brands, 120),
    image: safeImg(p.image_front_small_url),
    ingredients: str(p.ingredients_text_es, 3000) || str(p.ingredients_text, 3000),
    sugars100g: numIn(n.sugars_100g, 0, 100),
    fructose100g: numIn(n.fructose_100g, 0, 100),
    servingG: numIn(p.serving_quantity, 1, 2000),
    source: 'off',
    fetchedAt: new Date().toISOString(),
  };
}

// ---------- utilidades ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isFresh = (p) => p && p.fetchedAt && (Date.now() - Date.parse(p.fetchedAt)) < FRESH_DAYS * 864e5;

function takeSlot() {
  const now = Date.now();
  if (now < blockedUntil) throw new ApiError('rate', 'Demasiadas consultas seguidas. Espera unos segundos.');
  while (calls.length && now - calls[0] > 60000) calls.shift();
  if (calls.length >= MAX_PER_MIN) throw new ApiError('rate', 'Has consultado muchos productos en poco tiempo. Espera un minuto.');
  calls.push(now);
}

async function fetchJSON(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, credentials: 'omit', referrerPolicy: 'strict-origin-when-cross-origin', headers: { Accept: 'application/json' } });
    if (res.status === 429) {
      const ra = parseInt(res.headers.get('Retry-After') || '60', 10);
      blockedUntil = Date.now() + Math.min(Math.max(ra, 10), 300) * 1000;
      throw new ApiError('rate', 'El servicio de productos pide esperar un poco.');
    }
    if (res.status === 404) return { status: 0 };
    if (!res.ok) throw new ApiError('http', `Error del servidor (${res.status})`);
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('json')) throw new ApiError('http', 'Respuesta no válida del servidor');
    return await res.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new ApiError('timeout', 'El servidor tarda demasiado en responder.');
    if (e instanceof ApiError) throw e;
    throw new ApiError('network', 'Sin conexión o servidor no disponible.');
  } finally { clearTimeout(timer); }
}

async function fetchOFF(ean) {
  const url = `${API}${ean}?fields=${FIELDS}&lc=es`;
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      takeSlot();
      const j = await fetchJSON(url);
      if (!j || j.status !== 1 || !j.product) return null;   // no existe
      return sanitizeProduct(ean, j.product);
    } catch (e) {
      lastErr = e;
      if (e.code === 'rate' || attempt === 1) break;
      await sleep(400 + Math.random() * 400);               // espera breve y reintenta una vez
    }
  }
  throw lastErr;
}

// Un producto "fantasma" (existe el código pero sin nombre, ingredientes ni azúcares) cuenta como no encontrado
export const isEmptyProduct = (p) => !p || (!p.name && !p.ingredients && p.sugars100g == null && p.fructose100g == null);

/**
 * Busca un producto: 1) caché del móvil, 2) Open Food Facts; si falla, la copia guardada aunque sea antigua.
 * Devuelve { product|null, from: 'local'|'off'|'stale', error? }
 */
export function getProduct(ean) {
  if (!isValidEAN(ean)) return Promise.reject(new ApiError('invalid', 'El código de barras no es válido. Revísalo.'));
  if (inflight.has(ean)) return inflight.get(ean);
  const p = (async () => {
    const cached = await store.getProduct(ean).catch(() => null);
    if (isFresh(cached) && !isEmptyProduct(cached)) return { product: cached, from: 'local' };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      if (cached && !isEmptyProduct(cached)) return { product: cached, from: 'stale' };
      throw new ApiError('network', 'Sin conexión. Puedes escribir o fotografiar los ingredientes.');
    }
    try {
      const prod = await fetchOFF(ean);
      if (prod && !isEmptyProduct(prod)) { await store.putProduct(prod).catch(() => {}); return { product: prod, from: 'off' }; }
      return { product: null, from: 'off', empty: Boolean(prod) };
    } catch (e) {
      if (cached && !isEmptyProduct(cached)) return { product: cached, from: 'stale', error: e };
      throw e;
    }
  })().finally(() => inflight.delete(ean));
  inflight.set(ean, p);
  return p;
}
