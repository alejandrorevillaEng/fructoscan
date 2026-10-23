// "Tus sospechosos": cruza lo que te sentó mal con sus ingredientes para encontrar tu umbral personal.
// Módulo puro (sin DOM ni red). Todo se calcula en el móvil con los datos de "¿Qué tal te sentó?".
import { detect } from './analyzer.js';

export const MIN_RATED = 3;   // con menos productos valorados las coincidencias son casualidad
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Un ingrediente cuenta una vez por producto aunque aparezca varias veces (sorbitol y E420, por ejemplo)
// Los fructanos (trigo, cebolla, ajo…) solo cuentan en el perfil FODMAP
function substancesOf(ingredients, profile) {
  const found = new Map();
  for (const h of detect(ingredients).hits) {
    if (h.cat === 'fod' && profile !== 'fodmap') continue;
    const k = h.sub || h.key;
    const prev = found.get(k);
    if (!prev || (/\(E\d/.test(h.label) && !/\(E\d/.test(prev.label))) found.set(k, { key: k, label: cap(h.label), cat: h.cat });
  }
  return [...found.values()];
}

export function suspects(items, profile = 'malabsorcion') {
  const rated = items.filter((it) => it && ['bien', 'regular', 'mal'].includes(it.tolerance) && String(it.ingredients || '').trim().length >= 3);
  const stats = new Map();
  for (const it of rated) {
    for (const s of substancesOf(it.ingredients, profile)) {
      const st = stats.get(s.key) || { ...s, mal: 0, regular: 0, bien: 0, examples: [] };
      st[it.tolerance]++;
      if (it.tolerance === 'mal' && st.examples.length < 3) st.examples.push(it.name || 'Producto sin nombre');
      if (/\(E\d/.test(s.label)) st.label = s.label;
      stats.set(s.key, st);
    }
  }
  const malTotal = rated.filter((it) => it.tolerance === 'mal').length;
  const all = [...stats.values()];
  const list = all
    .filter((s) => s.mal > 0 && s.mal >= s.bien)
    .map((s) => ({ ...s, strong: s.mal >= 2 && s.mal > s.bien }))
    .sort((a, b) => b.mal - a.mal || a.bien - b.bien || a.label.localeCompare(b.label, 'es'))
    .slice(0, 8);
  const tolerated = all
    .filter((s) => s.bien >= 2 && s.mal === 0)
    .sort((a, b) => b.bien - a.bien || a.label.localeCompare(b.label, 'es'))
    .slice(0, 8);
  return { rated: rated.length, mal: malTotal, enough: rated.length >= MIN_RATED && malTotal >= 1, suspects: list, tolerated };
}
