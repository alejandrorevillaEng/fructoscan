// Motor de análisis: texto de ingredientes + azúcares -> semáforos de fructosa y polioles.
// Módulo puro (sin DOM ni red) para poder probarlo en Node.
import {
  INGREDIENTS, E_NUMBERS, LAXATIVE_RE, IGNORE_PHRASES, NEGLIGIBLE_BEFORE,
  SUGAR_T, FRUCTOSE_T, TOP_POSITIONS,
} from './rules.js';

export const LEVELS = ['green', 'yellow', 'red'];
const rank = (l) => LEVELS.indexOf(l);
const max = (a, b) => (rank(a) >= rank(b) ? a : b);

// ---------- Normalización ----------
export function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[_*]/g, ' ')              // énfasis de alérgenos de Open Food Facts (_leche_)
    .replace(/[‐‑‒–—-]/g, ' ')          // guiones -> espacio ("glucosa-fructosa")
    .replace(/[^\S\n]+/g, ' ')
    .trim();
}

// Separa por comas de primer nivel (no rompe paréntesis). Devuelve [{text, start}]
export function splitTopLevel(text) {
  // Si el OCR se ha comido algún ")" los paréntesis quedan desequilibrados: en ese caso
  // un ")" seguido de coma cierra todos los grupos abiertos, para no "meter" el resto dentro de uno.
  const unbalanced = (text.match(/[([]/g) || []).length > (text.match(/[)\]]/g) || []).length;
  const out = []; let depth = 0; let cur = ''; let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(' || ch === '[') depth++;
    if ((ch === ')' || ch === ']') && depth > 0) {
      depth--;
      if (unbalanced && /^\s*[,;]/.test(text.slice(i + 1, i + 4))) depth = 0;
    }
    const decimalComma = ch === ',' && /\d/.test(text[i - 1] || '') && /\d/.test(text[i + 1] || '');
    if (!decimalComma && (ch === ',' || ch === ';' || (ch === '.' && depth === 0 && /\s/.test(text[i + 1] || ' ') && !/\d/.test(text[i - 1] || ''))) && depth === 0) {
      if (cur.trim()) out.push({ text: cur.trim(), start });
      cur = ''; start = i + 1;
    } else cur += ch;
  }
  if (cur.trim()) out.push({ text: cur.trim(), start });
  return out;
}

// Distancia de edición (Levenshtein), acotada
export function lev(a, b, maxD = 2) {
  if (Math.abs(a.length - b.length) > maxD) return maxD + 1;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]; prev[0] = i; let rowMin = prev[0];
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp; rowMin = Math.min(rowMin, prev[j]);
    }
    if (rowMin > maxD) return maxD + 1;
  }
  return prev[b.length];
}

const SORTED = [...INGREDIENTS].sort((a, b) => b.p.length - a.p.length);
const FUZZY = INGREDIENTS.filter((r) => r.fuzzy && !r.p.includes(' '));
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERN_RE = new Map(SORTED.map((r) => [r.p, new RegExp(`(^|[^a-z0-9])(${escRe(r.p)})(?=$|[^a-z0-9])`, 'g')]));

function depthAt(text, idx) {
  let d = 0;
  for (let i = 0; i < idx; i++) { if (text[i] === '(' || text[i] === '[') d++; else if ((text[i] === ')' || text[i] === ']') && d > 0) d--; }
  return d;
}
function isNegligible(text, idx) {
  const before = text.slice(Math.max(0, idx - 30), idx).trim();
  return NEGLIGIBLE_BEFORE.some((w) => before.endsWith(`${w} de`) || before.endsWith(`${w} a`) || before.endsWith(w));
}

// ---------- Detección de ingredientes ----------
export function detect(ingredientsText) {
  let text = normalize(ingredientsText).replace(/\n+/g, ' ');
  const laxative = LAXATIVE_RE.test(text);
  for (const re of IGNORE_PHRASES) text = text.replace(re, ' ');
  const parts = splitTopLevel(text);
  const hits = [];

  parts.forEach((part, i) => {
    const t = part.text; const pos = i + 1;
    const used = new Array(t.length).fill(false);
    const push = (rule, idx, len, fuzzyWord) => {
      for (let k = idx; k < idx + len; k++) used[k] = true;
      if (rule.cat === 'ok') return;
      if (rule.cat === 'fru' && isNegligible(t, idx)) return;
      hits.push({
        key: rule.p || `e${rule.n}`, sub: rule.sub || rule.p, label: rule.label, cat: rule.cat, level: rule.level,
        hfi: !!rule.hfi, sorbitolFruit: !!rule.sorbitolFruit, pos,
        nested: depthAt(t, idx) > 0, part: part.text, fuzzy: fuzzyWord || null, match: t.slice(idx, idx + len),
      });
    };
    // 1) coincidencias exactas, de la más larga a la más corta
    for (const rule of SORTED) {
      const re = PATTERN_RE.get(rule.p); re.lastIndex = 0; let m;
      while ((m = re.exec(t))) {
        const idx = m.index + m[1].length;
        if (used.slice(idx, idx + rule.p.length).some(Boolean)) continue;
        push(rule, idx, rule.p.length);
      }
    }
    // 2) números E
    for (const e of E_NUMBERS) {
      const re = new RegExp(`(^|[^a-z0-9])e ?${e.n}(?![0-9])`, 'g'); let m;
      while ((m = re.exec(t))) { const idx = m.index + m[1].length; if (!used[idx]) push(e, idx, m[0].length - m[1].length); }
    }
    // 3) coincidencia aproximada (errores de OCR) en palabras libres
    const wordRe = /[a-z]{5,}/g; let w;
    while ((w = wordRe.exec(t))) {
      if (used[w.index]) continue;
      for (const rule of FUZZY) {
        if (w[0] === rule.p) continue;
        if (lev(w[0], rule.p, rule.fuzzy) <= rule.fuzzy) { push(rule, w.index, w[0].length, w[0]); break; }
      }
    }
  });

  // quitar duplicados exactos (misma etiqueta y posición)
  const seen = new Set();
  const unique = hits.filter((h) => { const k = `${h.label}|${h.pos}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return { parts: parts.map((p) => p.text), hits: unique, laxative };
}

// "sorbitol" y "E420" en el mismo ingrediente son la misma sustancia: un solo motivo, con la etiqueta del número E
function oncePerSubstance(hits) {
  const best = new Map();
  for (const h of hits) {
    const k = `${h.sub}|${h.pos}`;
    const prev = best.get(k);
    if (!prev || (/\(E\d/.test(h.label) && !/\(E\d/.test(prev.label))) best.set(k, h);
  }
  return hits.filter((h) => best.get(`${h.sub}|${h.pos}`) === h);
}

// ---------- Semáforos ----------
const es = (n) => String(n).replace('.', ',');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * @param {{ingredients?: string, sugars100g?: number|null, fructose100g?: number|null}} input
 * @param {'malabsorcion'|'ihf'|'fodmap'} profile
 */
export function analyze(input, profile = 'malabsorcion') {
  const ingredients = String(input.ingredients || '').trim();
  const sugars = num(input.sugars100g);
  const fructose = num(input.fructose100g);
  const hasIngr = ingredients.length >= 3;
  const d = hasIngr ? detect(ingredients) : { parts: [], hits: [], laxative: false };

  const fru = d.hits.filter((h) => h.cat === 'fru');
  const pol = oncePerSubstance(d.hits.filter((h) => h.cat === 'pol'));
  const fod = d.hits.filter((h) => h.cat === 'fod');
  const top = (h) => h.pos <= TOP_POSITIONS && !h.nested;

  const res = {
    profile,
    fructose: { level: 'unknown', reasons: [] },
    polyols: { level: 'unknown', reasons: [] },
    fructans: profile === 'fodmap' ? { level: 'unknown', reasons: [] } : null,
    warnings: [],
    hits: d.hits,
    parts: d.parts,
    hasIngredients: hasIngr,
    sugars100g: sugars,
  };
  // «1.er ingrediente», «2.º ingrediente»: abreviaturas de ordinal según la RAE
  const ordinal = (n) => (n === 1 || n === 3 ? `${n}.er` : `${n}.º`);
  const donde = (h) => `(${h.nested ? 'dentro del ' : ''}${ordinal(h.pos)} ingrediente)`;
  const y = (palabra) => (/^h?i(?![aeou])/i.test(palabra) ? 'e' : 'y');
  // Lo que comparte posición se dice en una sola frase: «Contiene maltitol e isomalt (dentro del 1.er ingrediente)»
  const contiene = (hits) => {
    const grupos = new Map();
    for (const h of hits) {
      const k = `${h.pos}|${h.nested ? 1 : 0}`;
      if (!grupos.has(k)) grupos.set(k, { h, nombres: [] });
      if (!grupos.get(k).nombres.includes(h.label)) grupos.get(k).nombres.push(h.label);
    }
    return [...grupos.values()].map(({ h, nombres }) => {
      const ultimo = nombres[nombres.length - 1];
      const lista = nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} ${y(ultimo)} ${ultimo}` : ultimo;
      return `Contiene ${lista} ${donde(h)}`;
    });
  };

  if (!hasIngr && sugars == null && fructose == null) {
    res.warnings.push('No hay ingredientes ni azúcares. Haz una foto a la lista de ingredientes.');
    return res;
  }

  // ---- Perfil IHF (estricto) ----
  if (profile === 'ihf') {
    const banned = d.hits.filter((h) => h.hfi);
    if (!hasIngr) {
      res.fructose = { level: 'unknown', reasons: ['Sin lista de ingredientes: en IHF no se puede valorar. Revisa la etiqueta.'] };
      res.polyols = { level: 'unknown', reasons: [] };
    } else {
      const bf = banned.filter((h) => h.cat === 'fru');
      const bp = banned.filter((h) => h.cat === 'pol');
      res.fructose = bf.length ? { level: 'red', reasons: contiene(bf) } : { level: 'green', reasons: ['No se ha detectado fructosa, sacarosa ni fruta'] };
      res.polyols = bp.length ? { level: 'red', reasons: contiene(bp) } : { level: 'green', reasons: ['No se ha detectado sorbitol'] };
      if (fructose != null && fructose > 0) res.fructose = { level: 'red', reasons: [`Fructosa declarada: ${es(fructose)} g por 100 g`, ...res.fructose.reasons] };
    }
    res.warnings.push('Perfil IHF: la app solo ayuda a leer la etiqueta. Ante cualquier duda, no lo consumas y consulta a tu especialista.');
    if (d.laxative) res.polyols = { level: 'red', reasons: ['La etiqueta avisa de efectos laxantes (más de un 10 % de polioles)', ...res.polyols.reasons] };
    return res;
  }

  // ---- Fructosa (malabsorción / FODMAP) ----
  const R = [];
  let lvl = 'green';
  if (fructose != null) {
    lvl = fructose < FRUCTOSE_T.low ? 'green' : fructose <= FRUCTOSE_T.high ? 'yellow' : 'red';
    R.push(`Fructosa declarada: ${es(fructose)} g por 100 g`);
  } else {
    const high = fru.filter((h) => h.level === 'high');
    const med = fru.filter((h) => h.level === 'med');
    const low = fru.filter((h) => h.level === 'low');
    const fruitLike = fru.some((h) => h.level !== 'low');
    if (high.some(top)) { lvl = 'red'; }
    if (sugars != null && sugars > SUGAR_T.high && (high.length || med.length)) lvl = 'red';
    if (lvl !== 'red' && (high.length || med.length)) lvl = 'yellow';
    if (lvl === 'green' && sugars != null && sugars >= SUGAR_T.low) lvl = 'yellow';
    if (sugars != null) R.push(`Azúcares: ${es(sugars)} g por 100 g`);
    R.push(...contiene(high), ...contiene(med));
    if (low.length && !fruitLike) R.push(`Lleva ${low.map((h) => h.label).filter((v, i, a) => a.indexOf(v) === i).join(', ')}: mitad glucosa y mitad fructosa, suele tolerarse mejor en poca cantidad`);
    if (!hasIngr) {
      if (sugars != null && sugars > SUGAR_T.high) { lvl = 'yellow'; R.push('Sin ingredientes y con muchos azúcares: probablemente alto. Añade los ingredientes para confirmarlo'); }
      else R.push('Sin lista de ingredientes: valoración solo por los azúcares');
    }
    if (hasIngr && !fru.length && (sugars == null || sugars < SUGAR_T.low)) R.push('No se han detectado azúcares ni fruta en los ingredientes');
  }
  res.fructose = { level: lvl, reasons: R };

  // ---- Sorbitol / polioles ----
  if (!hasIngr) {
    res.polyols = { level: 'unknown', reasons: ['Sin ingredientes no se puede saber si lleva sorbitol'] };
  } else {
    const PR = []; let pl = 'green';
    const sorb = pol.filter((h) => h.level === 'high');
    const others = pol.filter((h) => h.level === 'med');
    const ery = pol.filter((h) => h.level === 'low');
    const sFruit = fru.filter((h) => h.sorbitolFruit);
    if (sorb.length) { pl = 'red'; PR.push(...contiene(sorb)); }
    if (others.length) { pl = max(pl, 'yellow'); PR.push(...contiene(others)); }
    if (d.laxative) { pl = max(pl, 'yellow'); PR.push('La etiqueta avisa de efectos laxantes: más de un 10 % de polioles'); }
    if (sFruit.length) {
      pl = max(pl, sFruit.some(top) ? 'yellow' : pl);
      PR.push(`Fruta con sorbitol natural: ${[...new Set(sFruit.map((h) => h.label))].join(', ')}`);
    }
    if (ery.length) PR.push(`Lleva ${ery[0].label}`);
    if (!PR.length) PR.push('No se ha detectado sorbitol ni otros polioles');
    res.polyols = { level: pl, reasons: PR };
  }

  // ---- Combinación peligrosa ----
  if (rank(res.fructose.level) >= 1 && res.polyols.level === 'red') {
    res.warnings.push('Fructosa + sorbitol juntos: es la combinación que más síntomas suele dar.');
  }

  // ---- Fructanos (solo perfil FODMAP) ----
  if (profile === 'fodmap') {
    if (!hasIngr) res.fructans = { level: 'unknown', reasons: ['Sin ingredientes'] };
    else {
      let fl = 'green'; const FR = [];
      fod.forEach((h) => { if (h.level === 'med' || top(h)) fl = max(fl, top(h) || h.level === 'med' ? 'yellow' : 'green'); });
      FR.push(...contiene(fod));
      if (fod.some((h) => h.level === 'med' && top(h))) fl = 'red';
      if (!FR.length) FR.push('No se han detectado fructanos habituales');
      res.fructans = { level: fl, reasons: FR };
    }
  }
  return res;
}

// Peor de los indicadores (para listas y filtros)
export function overall(res) {
  const ls = [res.fructose.level, res.polyols.level, res.fructans?.level].filter((l) => l && l !== 'unknown');
  if (!ls.length) return 'unknown';
  return ls.reduce(max);
}

// Normaliza carácter a carácter SIN cambiar la longitud (para resaltar en el texto original)
export function normalizeKeepLength(s) {
  return Array.from(String(s || ''), (ch) => {
    const n = ch.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (n.length !== ch.length) return ch.length === 1 ? (n[0] || ' ') : ch;
    return n.replace(/[_*‐‑‒–—-]/g, ' ');
  }).join('');
}

// Devuelve tramos [{start,end,cat,level}] del texto original que corresponden a los ingredientes detectados
export function highlightSpans(original, hits) {
  const norm = normalizeKeepLength(original);
  const spans = [];
  for (const h of hits) {
    if (!h.match) continue;
    const re = new RegExp(`(^|[^a-z0-9])(${h.match.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')})(?=$|[^a-z0-9])`, 'g');
    let m;
    while ((m = re.exec(norm))) {
      const start = m.index + m[1].length; const end = start + m[2].length;
      if (!spans.some((s) => start < s.end && end > s.start)) spans.push({ start, end, cat: h.cat, level: h.level });
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

// ---------- Limpieza del texto del OCR ----------
const START_RE = /ingredientes?\s*[:.]?/i;
const STOP_RE = /(informaci[oó]n nutricional|valores? (nutricionales|medios)|valor energ[eé]tico|conservar|cons[eé]rvese|consumir preferentemente|fecha de caducidad|fabricado (por|para)|elaborado (por|para)|distribuido por|peso neto|contenido neto|modo de empleo|lote)/i;
// Palabras que solo existen en portugués (etiquetas bilingües ES/PT de Mercadona, Día…)
const PT_RE = /\b(leite|a[çc][úu]car|xarope|manteiga|gordura|am[êe]ndoa|glicose|frutose|vest[íi]gios|baunilha|castanha|tamb[ée]m|n[ãa]o|cont[ée]m|reconstituído|conserva[çc][ãa]o)\b/i;

export function cleanOcrText(raw) {
  let t = String(raw || '').replace(/\r/g, '');
  const s = t.search(START_RE);
  if (s >= 0) t = t.slice(s).replace(START_RE, '');
  const e = t.search(STOP_RE);
  if (e > 20) t = t.slice(0, e);
  // Etiquetas bilingües ES/PT: cortar en la frase donde empieza el portugués
  const pt = t.search(PT_RE);
  if (pt > 20) {
    const before = t.slice(0, pt);
    const cutAt = Math.max(before.lastIndexOf('.'), before.lastIndexOf('\n'));
    t = cutAt > 20 ? before.slice(0, cutAt + 1) : before;
  }
  return t
    .replace(/-\n(?=[a-záéíóúñ])/g, '')   // palabras partidas con guion al final de línea
    .replace(/\n+/g, ' ')
    .replace(/[|¦]/g, 'l')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:)])/g, '$1')
    .trim()
    .slice(0, 3000);
}

// Busca "Azúcares ... 12,5 g" en el texto del OCR (primer valor = por 100 g)
export function findSugars(raw) {
  const t = normalize(raw);
  const m = t.match(/azucares?[^0-9\n]{0,25}?(\d{1,2}(?:[.,]\d{1,2})?)\s*g/);
  if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.'));
  return v >= 0 && v <= 100 ? v : null;
}
