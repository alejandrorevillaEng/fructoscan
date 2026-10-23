// Copia de seguridad de la base personal en un fichero JSON (exportar e importar).
// Sin cuentas, es la forma de no perder tus productos al cambiar de móvil.
// Módulo puro (sin DOM ni red) para poder probarlo en Node. Todo lo que llega de un fichero se valida.
import { PROFILES } from './rules.js';

export const MAX_ITEMS = 5000;
const ID_RE = /^([0-9]{8,14}|m-[a-z0-9-]{8,40})$/;
const EAN_RE = /^[0-9]{8,14}$/;
const SOURCES = new Set(['off', 'usuario', 'foto']);
const TOLERANCES = new Set(['bien', 'regular', 'mal']);

const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max) : '');
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const iso = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);
const offImage = (u) => {
  try { const x = new URL(u); return x.protocol === 'https:' && /^(images|static)\.openfoodfacts\.org$/.test(x.hostname) ? x.href : ''; } catch { return ''; }
};

// Deja solo campos conocidos y con valores válidos; null si el producto no se puede recuperar
export function cleanItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = str(raw.id, 60);
  if (!ID_RE.test(id)) return null;
  const now = new Date().toISOString();
  const rawEan = str(raw.ean, 20);
  const ean = EAN_RE.test(rawEan) ? rawEan : null;
  const firstSeen = iso(raw.firstSeen) || now;
  const lastSeen = iso(raw.lastSeen) || firstSeen;
  return {
    id, ean,
    name: str(raw.name, 200) || 'Producto sin nombre',
    brand: str(raw.brand, 120),
    image: offImage(raw.image),
    ingredients: str(raw.ingredients, 3000),
    sugars100g: num(raw.sugars100g, 0, 100),
    fructose100g: num(raw.fructose100g, 0, 100),
    servingG: num(raw.servingG, 1, 2000),
    source: SOURCES.has(raw.source) ? raw.source : 'usuario',
    firstSeen, lastSeen,
    updatedAt: iso(raw.updatedAt) || lastSeen,
    times: Number.isInteger(raw.times) && raw.times >= 1 && raw.times <= 100000 ? raw.times : 1,
    favorite: raw.favorite === true,
    tolerance: TOLERANCES.has(raw.tolerance) ? raw.tolerance : null,
    note: str(raw.note, 500),
  };
}

// Lee el texto de un fichero de copia. Lanza un Error con un mensaje para el usuario si no sirve.
export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('El archivo no es una copia de FructoScan.'); }
  if (!data || typeof data !== 'object' || !Array.isArray(data.productos)) throw new Error('El archivo no es una copia de FructoScan.');
  const raw = data.productos.slice(0, MAX_ITEMS);
  const items = raw.map(cleanItem).filter(Boolean);
  return {
    profile: PROFILES[data.perfil] ? data.perfil : null,
    items,
    skipped: data.productos.length - items.length,
  };
}

// Une un producto de la copia con el que ya hay en el móvil: gana la versión más reciente,
// pero no se pierde la primera vez que se vio ni las veces que se ha escaneado.
export function mergeItem(local, incoming) {
  if (!local) return incoming;
  const newer = Date.parse(incoming.updatedAt) > Date.parse(local.updatedAt || local.lastSeen) ? incoming : local;
  return {
    ...newer,
    firstSeen: [local.firstSeen, incoming.firstSeen].filter(Boolean).sort()[0],
    times: Math.max(local.times || 1, incoming.times || 1),
  };
}

export function buildBackup(profile, items, analyzeLevel) {
  return {
    app: 'FructoScan',
    formato: 1,
    exportadoEl: new Date().toISOString(),
    perfil: profile,
    productos: items.map(({ dirty, ...it }) => ({ ...it, ...(analyzeLevel ? { resultado: analyzeLevel(it) } : {}) })),
  };
}
