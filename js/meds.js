// Medicamentos: ¿lleva fructosa, sacarosa o sorbitol como excipiente?
// Datos oficiales del CIMA de la AEMPS (API pública, sin clave): https://cima.aemps.es/cima/publico/home.html
// Se usan dos secciones de la ficha técnica: la 2 (excipientes con efecto conocido, con cantidades)
// y la 6.1 (lista completa de excipientes). El análisis es el mismo que el de los alimentos.
// Las funciones de red reciben fetch como parámetro para poder probarlas sin conexión.

const API = 'https://cima.aemps.es/cima/rest';
const TIMEOUT_MS = 8000;
const NR_RE = /^[0-9A-Za-z/-]{3,20}$/;   // números de registro: "59166", "EU/1/20/1234/001"…
export const isValidNr = (nr) => NR_RE.test(String(nr || ''));

// Una entidad numérica fuera de rango (&#99999999;) haría fallar String.fromCodePoint
const char = (n) => (n > 0 && n <= 0x10FFFF ? String.fromCodePoint(n) : ' ');

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', middot: '·', deg: '°', micro: 'µ',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü', ordm: 'º', ordf: 'ª',
};

// HTML de la ficha técnica -> texto plano (nunca se inserta como HTML)
export function htmlToText(s) {
  return String(s || '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/li|\/tr|\/div)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => char(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => char(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n] ?? ENTITIES[n.toLowerCase()] ?? m)
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F�]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

// De la sección 2 solo interesa el bloque "Excipientes con efecto conocido" (trae las cantidades)
export function knownExcipients(section2) {
  const t = htmlToText(section2);
  const i = t.search(/excipientes? con efecto conocido/i);
  if (i < 0) return '';
  const rest = t.slice(i).replace(/^excipientes? con efecto conocido\s*:?\s*/i, '');
  const end = rest.search(/para consultar la lista completa|\n\s*\d+\.\s|forma farmac/i);
  return (end > 0 ? rest.slice(0, end) : rest).replace(/[.…]{3,}/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1500);
}

const sectionText = (json) => (Array.isArray(json) && json[0] ? String(json[0].contenido || '') : '');

async function getJSON(fetchFn, url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchFn(url, { signal: ctrl.signal, credentials: 'omit', headers: { Accept: 'application/json' } });
    if (res.status === 204 || res.status === 404) return null;
    if (!res.ok) throw new Error(`El servicio de medicamentos ha respondido con un error (${res.status}).`);
    const text = await res.text();
    return text.trim() ? JSON.parse(text) : null;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('El servicio de medicamentos tarda demasiado. Inténtalo de nuevo.');
    if (e instanceof SyntaxError) throw new Error('Respuesta no válida del servicio de medicamentos.');
    if (/error \(/.test(e.message)) throw e;
    throw new Error('Sin conexión o servicio de medicamentos no disponible.');
  } finally { clearTimeout(timer); }
}

// Busca por el nombre del medicamento (en los genéricos incluye el principio activo); solo los comercializados
export async function searchMeds(q, fetchFn = fetch) {
  const name = String(q || '').trim().slice(0, 60);
  if (name.length < 3) return [];
  const j = await getJSON(fetchFn, `${API}/medicamentos?nombre=${encodeURIComponent(name)}&comerc=1`);
  return (j?.resultados || []).slice(0, 25)
    .filter((r) => NR_RE.test(String(r.nregistro || '')))
    .map((r) => ({ nregistro: String(r.nregistro), name: String(r.nombre || '').slice(0, 200), lab: String(r.labtitular || '').slice(0, 120) }));
}

// Ficha de un medicamento con sus excipientes en texto plano
export async function getMed(nregistro, fetchFn = fetch) {
  const nr = String(nregistro || '');
  if (!NR_RE.test(nr)) throw new Error('Medicamento no válido.');
  const enc = encodeURIComponent(nr);
  const [info, s2, s61] = await Promise.all([
    getJSON(fetchFn, `${API}/medicamento?nregistro=${enc}`),
    getJSON(fetchFn, `${API}/docSegmentado/contenido/1?nregistro=${enc}&seccion=2`).catch(() => null),
    getJSON(fetchFn, `${API}/docSegmentado/contenido/1?nregistro=${enc}&seccion=6.1`).catch(() => null),
  ]);
  if (!info) return null;
  const docs = Array.isArray(info.docs) ? info.docs : [];
  const safeDoc = (tipo) => {
    const d = docs.find((x) => x.tipo === tipo);
    const u = d?.urlHtml || d?.url || '';
    return /^https:\/\/cima\.aemps\.es\//.test(u) ? u : '';
  };
  return {
    nregistro: nr,
    name: String(info.nombre || '').slice(0, 200),
    lab: String(info.labtitular || '').slice(0, 120),
    excipients: htmlToText(sectionText(s61)).slice(0, 3000),
    known: knownExcipients(sectionText(s2)),
    fichaUrl: safeDoc(1),
    prospectoUrl: safeDoc(2),
    fetchedAt: new Date().toISOString(),
  };
}

// Texto que se analiza: la lista completa; si la ficha no la trae, los excipientes con efecto conocido.
// Juntar las dos repetiría cada excipiente.
export const medAnalysisText = (med) => med.excipients || med.known || '';

// En un medicamento el orden de los excipientes no dice nada de la cantidad: fuera la posición de las frases
export const withoutPosition = (reason) => reason.replace(/ \((dentro del )?\d+\.(º|er) ingrediente\)/, '');
