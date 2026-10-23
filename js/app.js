import { h, append, clear, $, announce, toast, timeAgo, download } from './dom.js';
import { analyze, overall, highlightSpans, detect } from './analyzer.js';
import { PROFILES } from './rules.js';
import { store } from './store.js';
import { getProduct } from './off.js';
import { cleanCode, isValidEAN, isInStoreCode } from './ean.js';
import { searchFoods } from './foods.js';
import { parseBackup, mergeItem, buildBackup } from './backup.js';
import { ONBOARDING, HIGH_FRUCTOSE, HIGH_SORBITOL, LOW_FRUCTOSE, QUICK_TIPS, PROFILE_HELP } from './tips.js';
import { CONFIG } from './config.js';
import { icon } from './icons.js';
import { searchMeds, getMed, medAnalysisText, withoutPosition, isValidNr } from './meds.js';
import { suspects, MIN_RATED } from './insights.js';

const view = $('#view');
const state = { profile: 'malabsorcion', scanner: null, session: [], installPrompt: null };
const nowISO = () => new Date().toISOString();

const LEVEL = {
  green: { word: 'Bajo' },
  yellow: { word: 'Moderado' },
  red: { word: 'Alto' },
  unknown: { word: 'Sin datos' },
};
// Cómo se dice cada nivel en lenguaje normal (concordando en género)
const PHRASE = {
  fructose: { red: 'Mucha fructosa', yellow: 'Algo de fructosa', green: 'Poca fructosa', unknown: 'Fructosa sin datos' },
  polyols: { red: 'Lleva sorbitol', yellow: 'Algo de polioles', green: 'Sin sorbitol', unknown: 'Sorbitol sin datos' },
  fructans: { red: 'Muchos fructanos', yellow: 'Algunos fructanos', green: 'Sin fructanos', unknown: 'Fructanos sin datos' },
};
const joinEs = (arr) => (arr.length > 1 ? `${arr.slice(0, -1).join(', ')} y ${arr[arr.length - 1].toLowerCase()}` : arr[0] || '');
// Veredicto en palabras (lo que importa en el pasillo del súper)
function verdictFor(level, profile) {
  const ihf = profile === 'ihf';
  return {
    red: { word: ihf ? 'No apto' : 'Mejor evitar', mark: 'x-circle' },
    yellow: { word: 'Con moderación', mark: 'warning-circle' },
    green: { word: ihf ? 'Sin prohibidos' : 'Apto', mark: 'check-circle' },
    unknown: { word: 'Faltan datos', mark: 'question' },
  }[level];
}
const TOL = { bien: 'Bien', regular: 'Regular', mal: 'Mal' };
const TOL_ICON = { bien: 'smiley', regular: 'smiley-meh', mal: 'smiley-sad' };

// ---------------------------------------------------------------- datos personales
async function saveItem(it) {
  it.updatedAt = nowISO();
  await store.putItem(it);
  return it;
}

async function upsertFromProduct(p) {
  const ex = await store.getItem(p.ean);
  const now = nowISO();
  if (!ex) {
    return saveItem({ id: p.ean, ean: p.ean, name: p.name, brand: p.brand, image: p.image, ingredients: p.ingredients,
      sugars100g: p.sugars100g, fructose100g: p.fructose100g, servingG: p.servingG ?? null, source: 'off', firstSeen: now, lastSeen: now, times: 1,
      favorite: false, tolerance: null, note: '' });
  }
  const fromOff = ex.source === 'off' || !ex.ingredients;
  return saveItem({ ...ex,
    name: ex.name || p.name, brand: ex.brand || p.brand, image: p.image || ex.image,
    ingredients: fromOff && p.ingredients ? p.ingredients : ex.ingredients,
    source: fromOff && p.ingredients ? 'off' : ex.source,
    sugars100g: ex.sugars100g ?? p.sugars100g, fructose100g: p.fructose100g ?? ex.fructose100g, servingG: p.servingG ?? ex.servingG ?? null,
    lastSeen: now, times: (ex.times || 1) + 1 });
}

const analyzeItem = (it) => analyze({ ingredients: it.ingredients, sugars100g: it.sugars100g, fructose100g: it.fructose100g }, state.profile);

// ---------------------------------------------------------------- piezas de interfaz
function page(title, ...children) {
  const h1 = h('h1', { tabindex: '-1', class: 'page-title' }, title);
  clear(view); append(view, [h1, ...children]);
  document.title = `${title} · FructoScan`;
  return h1;
}
function badge(level, label) {
  return h('span', { class: `badge lv-${level}` }, `${label ? `${label}: ` : ''}${(LEVEL[level] || LEVEL.unknown).word}`);
}
function button(text, attrs = {}) { return h('button', { type: 'button', class: 'btn', ...attrs }, text); }
function linkBtn(text, href, cls = 'btn') { return h('a', { class: cls, href }, text); }
function empty(text, action) { return h('div', { class: 'empty' }, h('p', {}, text), action); }

function itemRow(it) {
  const res = analyzeItem(it); const lv = overall(res); const v = verdictFor(lv, state.profile);
  return h('li', {},
    h('a', { class: 'row', href: `#/r/${encodeURIComponent(it.id)}` },
      h('span', { class: `dot lv-${lv}`, 'aria-hidden': 'true' }),
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, it.name || 'Producto sin nombre'),
        h('span', { class: 'row-sub' }, h('span', { class: `row-verdict lv-${lv}` }, v.word), [it.brand, timeAgo(it.lastSeen)].filter(Boolean).map((x) => ` · ${x}`).join(''))),
      it.tolerance ? h('span', { class: 'row-tol', title: `Te sentó ${it.tolerance}`, role: 'img', 'aria-label': `Te sentó ${it.tolerance}` }, icon(TOL_ICON[it.tolerance])) : null,
      it.favorite ? h('span', { class: 'row-fav', role: 'img', 'aria-label': 'Favorito' }, icon('star')) : null));
}

function confirmDialog(text, okText = 'Continuar', cancelText = 'Cancelar') {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'dialog' },
      h('form', { method: 'dialog' },
        h('p', {}, text),
        h('div', { class: 'actions' },
          h('button', { class: 'btn', value: 'no', autofocus: true }, cancelText),
          h('button', { class: 'btn danger', value: 'yes' }, okText))));
    document.body.append(dlg);
    dlg.addEventListener('close', () => { resolve(dlg.returnValue === 'yes'); dlg.remove(); });
    dlg.showModal();
  });
}

// ---------------------------------------------------------------- pantallas
function valueList(short = false) {
  return h('ul', { class: 'values' }, ONBOARDING.map((o) => h('li', {},
    icon(o.icon), h('strong', {}, o.title), h('span', { class: 'hint' }, short ? o.short : o.text))));
}
// Muestra de lo que verás al escanear: los tres veredictos
const verdictDemo = () => h('p', { class: 'demo' },
  h('span', { class: 'visually-hidden' }, 'Ejemplos de veredicto: '),
  h('span', { class: 'badge lv-green' }, 'Apto'), ' ',
  h('span', { class: 'badge lv-yellow' }, 'Con moderación'), ' ',
  h('span', { class: 'badge lv-red' }, 'Mejor evitar'));

// Portada de la primera vez: se elige el perfil y a escanear. No hay cuentas: todo se guarda en el móvil
async function viewWelcome() {
  const form = h('form', { class: 'card stack', onsubmit: async (e) => {
    e.preventDefault();
    const p = new FormData(form).get('profile') || 'malabsorcion';
    state.profile = p; await store.set('profile', p); await store.set('onboarded', true);
    location.hash = '#/';
  } },
  profileFieldset(state.profile),
  h('p', { class: 'note' }, 'Los resultados son una estimación a partir de los ingredientes: no sustituyen el consejo de tu médico o dietista.'),
  h('button', { type: 'submit', class: 'btn primary block' }, 'Empezar a escanear'));
  const privacy = h('p', { class: 'note welcome-note' },
    'Gratis y sin registrarte. Lo que guardes se queda en este móvil: nadie más lo ve. Puedes hacer una copia desde Perfil.');
  page('Fructosa y sorbitol, de un vistazo',
    h('p', { class: 'lead' }, 'Escanea un producto del súper y sabrás al momento si te conviene, y por qué.'),
    verdictDemo(), valueList(true), h('h2', {}, '¿Cuál es tu caso?'), form, privacy,
    h('p', { class: 'note' }, h('a', { href: '#/privacidad' }, 'Privacidad'), ' · ', h('a', { href: '#/aviso' }, 'Aviso legal')));
  $('.page-title').classList.add('hero-title');
}

function profileFieldset(current) {
  return h('fieldset', { class: 'choices' },
    h('legend', {}, 'Tu perfil'),
    Object.values(PROFILES).map((p) => h('label', { class: 'choice' },
      h('input', { type: 'radio', name: 'profile', value: p.id, checked: p.id === current }),
      h('span', {}, h('strong', {}, p.name), h('span', { class: 'hint' }, PROFILE_HELP[p.id])))));
}

async function viewScan() {
  const video = h('video', { class: 'cam', playsinline: true, muted: true, 'aria-label': 'Vista de la cámara' });
  const status = h('p', { class: 'cam-status', role: 'status' }, 'Apunta la cámara al código de barras de cualquier producto.');
  const startBtn = button('Activar cámara', { class: 'btn primary', onclick: () => start() });
  const torchBtn = button([icon('flashlight'), 'Linterna'], { hidden: true, 'aria-pressed': 'false' });
  const box = h('div', { class: 'scanner' }, video, h('div', { class: 'frame', 'aria-hidden': 'true' }),
    status, h('div', { class: 'cam-actions' }, startBtn, torchBtn));

  async function start() {
    startBtn.hidden = true; status.textContent = 'Abriendo la cámara…';
    try {
      state.scanner = await startScanner(video, onCode);
      box.classList.add('on');
      status.textContent = 'Apunta al código de barras del producto';
      if (state.scanner.torchSupported) {
        torchBtn.hidden = false; let on = false;
        torchBtn.onclick = async () => { on = !on; await state.scanner.torch(on); torchBtn.setAttribute('aria-pressed', String(on)); };
      }
    } catch (e) {
      startBtn.hidden = false;
      status.textContent = e?.name === 'NotAllowedError'
        ? 'No hay permiso para usar la cámara. Actívalo en los ajustes del navegador o escribe el código a mano.'
        : 'No se puede abrir la cámara en este dispositivo. Escribe el código a mano o haz una foto a los ingredientes.';
    }
  }
  // Modo súper: el veredicto aparece sobre la cámara y se puede seguir escaneando sin cambiar de pantalla
  let peek = null; let inFlight = '';
  const showPeek = (el) => { peek?.remove(); peek = el; box.append(el); box.classList.add('has-peek'); };
  const peekCard = (href, lv, word, name) => h(href ? 'a' : 'div', { class: 'peek', href, role: href ? null : 'status' },
    h('span', { class: `dot lv-${lv}`, 'aria-hidden': 'true' }),
    h('span', { class: 'peek-main' }, h('span', { class: 'peek-word' }, word), h('span', { class: 'peek-name' }, name)),
    href ? icon('caret-right') : null);
  async function onCode(code) {
    if (inFlight === code) return;
    inFlight = code;
    navigator.vibrate?.(60);
    showPeek(peekCard(null, 'unknown', 'Buscando…', code));
    try {
      if (isInStoreCode(code)) { showPeek(peekCard(null, 'unknown', 'Producto al peso', 'Su código no está en ninguna base pública')); return; }
      const r = await getProduct(code);
      const it = r.product ? await upsertFromProduct(r.product) : await store.getItem(code);
      if (!it || !(it.ingredients || it.sugars100g != null || it.fructose100g != null)) {
        showPeek(peekCard(`#/p/${code}`, 'unknown', 'No está en la base', 'Toca para añadirlo con una foto'));
        announce('Producto no encontrado');
        return;
      }
      const lv = overall(analyzeItem(it)); const v = verdictFor(lv, state.profile);
      showPeek(peekCard(`#/r/${encodeURIComponent(it.id)}`, lv, v.word, it.name || 'Producto sin nombre'));
      announce(`${it.name || 'Producto'}: ${v.word}`);
      addToSession(it);
    } catch (e) {
      showPeek(peekCard(`#/p/${code}`, 'unknown', 'No se ha podido consultar', e.message));
    } finally { inFlight = ''; }
  }

  const sessionList = h('ul', { class: 'list' });
  const sessionSec = h('section', { class: 'session', hidden: true },
    h('h2', {}, 'En esta compra', h('span', { class: 'hint' }, 'toca uno para ver el detalle')), sessionList);
  async function renderSession() {
    const items = (await Promise.all(state.session.map((id) => store.getItem(id)))).filter(Boolean);
    clear(sessionList); append(sessionList, items.map(itemRow));
    sessionSec.hidden = !items.length;
  }
  function addToSession(it) {
    state.session = [it.id, ...state.session.filter((x) => x !== it.id)].slice(0, 30);
    renderSession();
  }

  const codeInput = h('input', { id: 'ean', name: 'ean', type: 'text', inputmode: 'numeric', autocomplete: 'off', enterkeyhint: 'search',
    required: true, pattern: '[0-9 ]{8,17}', maxlength: '17', 'aria-describedby': 'ean-help' });
  const codeForm = h('form', { class: 'inline-form', onsubmit: (e) => {
    e.preventDefault();
    const code = cleanCode(codeInput.value);
    if (!isValidEAN(code)) { codeInput.setCustomValidity('Ese código no es válido. Revisa los números.'); codeInput.reportValidity(); return; }
    location.hash = `#/p/${code}`;
  } },
  h('label', { for: 'ean' }, 'Código de barras'),
  h('div', { class: 'field-row' }, codeInput, h('button', { type: 'submit', class: 'btn primary' }, 'Consultar')),
  h('span', { id: 'ean-help', class: 'hint' }, 'Los números bajo las barras (8 o 13 cifras).'));
  codeInput.addEventListener('input', () => codeInput.setCustomValidity(''));

  const recent = state.session.length ? [] : await store.recent(3);
  page('Escanear',
    box,
    h('div', { class: 'grid-actions trio' },
      linkBtn([icon('camera'), 'Foto de ingredientes'], '#/ingredientes'),
      linkBtn([icon('magnifying-glass'), 'Fruta y verdura'], '#/buscar'),
      linkBtn([icon('pill'), 'Medicamentos'], '#/medicamentos')),
    h('details', { class: 'card' }, h('summary', {}, 'Escribir el código a mano'), codeForm),
    sessionSec,
    recent.length ? h('section', {}, h('h2', {}, 'Vistos últimamente'), h('ul', { class: 'list' }, recent.map(itemRow)), h('a', { href: '#/recientes' }, 'Ver todos')) : null);
  renderSession();
  if (!(await store.get('installHidden')) && (await store.allItems()).length >= 3) {
    const card = installCard();
    if (card) view.append(card);
  }

  // Arranca solo si ya hay permiso (no molesta con el aviso nada más entrar)
  try {
    const perm = await navigator.permissions?.query({ name: 'camera' });
    if (perm?.state === 'granted') start();
  } catch { /* navegador sin Permissions API */ }
}

async function viewProduct(ean) {
  const slow = h('p', { class: 'hint', role: 'status' }, 'Buscando en Open Food Facts…');
  page('Buscando…', h('div', { class: 'searching' },
    h('p', { class: 'code', 'aria-label': `Código ${ean}` }, ean),
    h('div', { class: 'skel big' }), h('div', { class: 'skel' }), h('div', { class: 'skel' }), slow));
  const timer = setTimeout(() => {
    slow.textContent = 'Está tardando más de lo normal. Puedes esperar o escribir tú los ingredientes.';
    slow.after(linkBtn('Escribir los ingredientes', `#/ingredientes?ean=${ean}&manual=1`, 'btn block'));
  }, 3000);
  try {
    if (isInStoreCode(ean)) return viewNotFound(ean, 'Es un código de producto al peso de la tienda. Esos códigos no están en ninguna base de datos pública.');
    const r = await getProduct(ean);
    if (!location.hash.includes(ean)) return;               // el usuario ya se fue a otra pantalla
    if (!r.product) {
      const ex = await store.getItem(ean);
      if (ex && ex.ingredients) { ex.lastSeen = nowISO(); ex.times = (ex.times || 1) + 1; await saveItem(ex); return showResult(ex); }
      return viewNotFound(ean, r.empty
        ? 'El código existe en Open Food Facts, pero nadie ha añadido todavía su nombre ni sus ingredientes.'
        : 'Todavía no está en Open Food Facts, la base de datos abierta que usa la app.');
    }
    const it = await upsertFromProduct(r.product);
    showResult(it, r.from === 'stale' ? 'Sin conexión: se muestran los datos guardados.' : null);
  } catch (e) {
    if (!location.hash.includes(ean)) return;
    if (e.code === 'invalid') return viewInvalidCode(ean);
    const ex = await store.getItem(ean);
    if (ex) return showResult(ex, e.message);
    viewNotFound(ean, e.message, true);
  } finally { clearTimeout(timer); }
}

// Código mal escrito o mal leído: se corrige aquí mismo, no tiene sentido ofrecer la foto de ingredientes
function viewInvalidCode(ean) {
  const input = h('input', { id: 'ean-fix', name: 'ean', type: 'text', inputmode: 'numeric', autocomplete: 'off', enterkeyhint: 'search',
    required: true, maxlength: '17', value: ean, 'aria-describedby': 'ean-fix-help' });
  input.addEventListener('input', () => input.setCustomValidity(''));
  const form = h('form', { class: 'stack', onsubmit: (e) => {
    e.preventDefault();
    const code = cleanCode(input.value);
    if (!isValidEAN(code)) { input.setCustomValidity('Sigue sin ser válido. Revisa cada número.'); input.reportValidity(); return; }
    location.hash = `#/p/${code}`;
  } },
  h('label', { for: 'ean-fix' }, 'Código de barras'),
  h('div', { class: 'field-row' }, input, h('button', { type: 'submit', class: 'btn primary' }, 'Consultar')),
  h('span', { id: 'ean-fix-help', class: 'hint' }, 'Son los números bajo las barras (8 o 13 cifras). El último es de control: si uno está mal, no cuadra.'));
  page('Ese código no es válido',
    h('p', { role: 'alert' }, 'Algún número no cuadra. Suele pasar al escribirlo a mano o si la cámara lo ha leído mal.'),
    form,
    linkBtn('Volver a escanear', '#/', 'btn link'));
}

function viewNotFound(ean, reason, retry) {
  page('No encontramos este producto',
    h('p', { class: 'notfound-mark', 'aria-hidden': 'true' }, ean),
    h('p', { role: 'alert' }, reason),
    h('p', {}, 'Haz una foto a la lista de ingredientes y la app te dirá si tiene fructosa o sorbitol. Se guardará en tu base para la próxima vez.'),
    h('div', { class: 'stack' },
      linkBtn('Hacer foto a los ingredientes', `#/ingredientes?ean=${ean}`, 'btn primary block'),
      linkBtn('Escribir los ingredientes', `#/ingredientes?ean=${ean}&manual=1`, 'btn block'),
      retry ? button('Volver a buscar', { class: 'btn block', onclick: () => viewProduct(ean) }) : null,
      linkBtn('Escanear otro producto', '#/', 'btn link')));
}

function meter(kind, ind) {
  return h('li', { class: 'meter' },
    h('span', { class: `dot lv-${ind.level}`, 'aria-hidden': 'true' }),
    h('strong', {}, PHRASE[kind][ind.level]));
}

function highlighted(text, hits) {
  const spans = highlightSpans(text, hits); const out = []; let i = 0;
  for (const s of spans) {
    if (s.start > i) out.push(text.slice(i, s.start));
    out.push(h('mark', { class: s.cat === 'fod' ? 'hl-fod' : `hl-${s.level}` }, text.slice(s.start, s.end)));
    i = s.end;
  }
  out.push(text.slice(i));
  return out;
}

async function showResult(it, notice) {
  history.replaceState(null, '', `#/r/${encodeURIComponent(it.id)}`);
  const res = analyzeItem(it);
  const tolField = h('fieldset', { class: 'tol', onchange: async (e) => {
    it.tolerance = e.target.value; await saveItem(it); toast('Guardado en tu base');
  } },
  h('legend', {}, '¿Qué tal te sentó?'),
  Object.entries(TOL).map(([v, t]) => h('label', { class: 'pill' }, h('input', { type: 'radio', name: 'tol', value: v, checked: it.tolerance === v }), h('span', {}, icon(TOL_ICON[v]), t))));

  const favLabel = () => [icon('star'), it.favorite ? 'En favoritos' : 'Añadir a favoritos'];
  const favBtn = button(favLabel(), { 'aria-pressed': String(!!it.favorite), onclick: async () => {
    it.favorite = !it.favorite; await saveItem(it);
    clear(favBtn); append(favBtn, favLabel());
    favBtn.setAttribute('aria-pressed', String(it.favorite)); announce(it.favorite ? 'Añadido a favoritos' : 'Quitado de favoritos');
  } });
  const note = h('textarea', { id: 'note', name: 'note', rows: '2', maxlength: '500', value: it.note || '' });
  note.addEventListener('change', async () => { it.note = note.value.slice(0, 500); await saveItem(it); toast('Nota guardada'); });

  const srcText = { off: 'Datos de Open Food Facts', usuario: 'Ingredientes escritos por ti', foto: 'Ingredientes leídos de tu foto' }[it.source] || '';
  const lv = overall(res); const v = verdictFor(lv, state.profile);
  const inds = [['fructose', res.fructose], ['polyols', res.polyols]];
  if (res.fructans) inds.push(['fructans', res.fructans]);
  const subline = joinEs(inds.map(([k, i]) => PHRASE[k][i.level]));
  const reasons = [
    ...res.fructose.reasons.map((r) => [res.fructose.level, r]),
    ...res.polyols.reasons.map((r) => [res.polyols.level, r]),
    ...(res.fructans ? res.fructans.reasons.map((r) => [res.fructans.level, r]) : []),
  ];
  page(it.name || 'Producto sin nombre',
    notice ? h('p', { class: 'warn-line', role: 'status' }, icon('info'), h('span', {}, notice)) : null,
    h('section', { class: `verdict lv-${lv}`, 'aria-label': `Veredicto: ${v.word}. ${subline}` },
      h('span', { class: 'stamp', 'aria-hidden': 'true' }, icon(v.mark)),
      h('p', { class: 'v-word' }, v.word)),
    h('ul', { class: 'meters', 'aria-label': 'Detalle por tipo' }, inds.map(([k, i]) => meter(k, i))),
    servingLine(it),
    res.warnings.map((w) => h('p', { class: 'warn-line', role: 'note' }, icon('warning'), h('span', {}, w))),
    h('div', { class: 'result-actions' },
      button([icon('share-network'), 'Compartir'], { onclick: () => shareResult(it, v.word) }),
      linkBtn([icon('barcode'), 'Escanear'], '#/')),
    !res.hasIngredients ? h('div', { class: 'card callout stack' },
      h('p', { class: 'm0' }, h('strong', {}, 'Faltan los ingredientes. '), 'Con una foto de la etiqueta sabremos si lleva fructosa o sorbitol.'),
      linkBtn('Hacer foto a los ingredientes', `#/ingredientes?id=${encodeURIComponent(it.id)}`, 'btn primary block')) : null,
    h('section', { class: 'why card' }, h('h2', {}, 'Por qué'),
      h('ul', {}, reasons.map(([l, r]) => h('li', { class: `lv-${l}` }, r))),
      h('p', { class: 'profile-chip' }, `Según tu perfil: ${PROFILES[state.profile].short}`)),
    res.hasIngredients ? h('details', { class: 'card', open: res.hits.length > 0 },
      h('summary', {}, 'Ingredientes'),
      h('p', { class: 'ingr' }, highlighted(it.ingredients, res.hits)),
      h('p', { class: 'hint' }, srcText),
      linkBtn('Corregir ingredientes', `#/ingredientes?id=${encodeURIComponent(it.id)}`, 'btn')) : null,
    h('section', { class: 'card stack' },
      h('h2', {}, 'Tu registro'),
      tolField, h('a', { href: '#/sospechosos', class: 'sus-link' }, icon('detective'), 'Ver qué se repite en lo que te sienta mal'), favBtn,
      h('label', { for: 'note' }, 'Nota personal'), note,
      h('p', { class: 'hint' }, `Escaneado ${it.times || 1} ${it.times > 1 ? 'veces' : 'vez'} · la primera ${timeAgo(it.firstSeen)}`),
      button('Quitar de mi base', { class: 'btn danger-outline', onclick: async () => {
        if (!(await confirmDialog('¿Quitar este producto de tu base?', 'Quitar producto', 'Conservar'))) return;
        await store.deleteItem(it.id);
        toast('Producto quitado'); location.hash = '#/mibase';
      } })),
    h('p', { class: 'disclaimer' }, 'Estimación a partir de los ingredientes. No sustituye el consejo médico.'));
  // cabecera del producto: imagen + nombre + marca, en lugar del título suelto
  const title = $('.page-title');
  const head = h('div', { class: 'prod' },
    it.image ? h('img', { class: 'prod-img', src: it.image, alt: '', width: '76', height: '76', loading: 'lazy', referrerpolicy: 'no-referrer' }) : null,
    h('div', {}, title, h('p', { class: 'sub' }, [it.brand, it.ean].filter(Boolean).join(' · '))));
  view.prepend(head);
}

// La cantidad importa en la malabsorción: azúcares (o fructosa declarada) en una ración, si el fabricante la indica
function servingLine(it) {
  const g = it.servingG;
  if (!g || !(g > 0 && g <= 2000)) return null;
  const per = (v) => String(Math.round((v * g) / 10) / 10).replace('.', ',');   // una decimal basta
  const [what, val] = it.fructose100g != null ? ['de fructosa', it.fructose100g] : it.sugars100g != null ? ['de azúcares', it.sugars100g] : [];
  if (val == null) return null;
  return h('p', { class: 'serving' }, h('strong', {}, `${per(val)} g`), h('span', {}, `${what} en una ración de ${String(g).replace('.', ',')} g`));
}

// Compartir el resultado con el sistema (WhatsApp, etc.) o copiar el enlace si el navegador no puede
async function shareResult(it, word) {
  const url = `${location.origin}${location.pathname}#/p/${it.ean || ''}`;
  const text = `${it.name || 'Este producto'}: ${word.toLowerCase()} según FructoScan (fructosa y sorbitol).`;
  try {
    if (navigator.share && it.ean) { await navigator.share({ title: 'FructoScan', text, url }); return; }
    await navigator.clipboard.writeText(it.ean ? `${text} ${url}` : text);
    toast('Copiado para compartir');
  } catch (e) {
    if (e?.name !== 'AbortError') toast('No se ha podido compartir');
  }
}

async function viewResultById(id) {
  const it = await store.getItem(id);
  if (!it) { page('No encontrado', empty('Este producto no está en tu base.', linkBtn('Volver a escanear', '#/', 'btn primary'))); return; }
  showResult(it);
}

async function viewIngredients(q) {
  const ex = q.id ? await store.getItem(q.id) : q.ean ? await store.getItem(q.ean) : null;
  const ean = ex?.ean || (q.ean && isValidEAN(q.ean) ? q.ean : null);
  let usedOcr = false;

  const nameIn = h('input', { id: 'pname', name: 'name', type: 'text', maxlength: '200', autocomplete: 'off', value: ex?.name || '', required: !ex?.name });
  const ingr = h('textarea', { id: 'ingr', name: 'ingredients', rows: '7', maxlength: '3000', required: true, 'aria-describedby': 'ingr-help', value: ex?.ingredients || '' });
  const sug = h('input', { id: 'sugars', name: 'sugars', type: 'text', inputmode: 'decimal', autocomplete: 'off', pattern: '\\d{1,2}([.,]\\d{1,2})?|100', value: ex?.sugars100g != null ? String(ex.sugars100g).replace('.', ',') : '' });
  const prog = h('progress', { max: '1', value: '0', hidden: true });
  const progText = h('p', { class: 'hint', role: 'status', 'aria-live': 'polite' });
  const ocrMsg = h('div');
  const preview = h('img', { class: 'photo-prev', alt: 'Foto de la etiqueta', hidden: true });

  async function onPhoto(e) {
    const file = e.target.files?.[0]; if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 25e6) { toast('Elige una imagen (máx. 25 MB)'); return; }
    preview.src = URL.createObjectURL(file); preview.hidden = false;
    prog.hidden = false; prog.removeAttribute('value'); progText.textContent = 'Preparando… (la primera vez tarda un poco más)';
    clear(ocrMsg);
    try {
      const { readIngredients } = await import('./ocr.js');
      const r = await readIngredients(file, (m) => {
        if (m.status === 'recognizing text') { prog.value = m.progress; progText.textContent = `Leyendo la etiqueta… ${Math.round(m.progress * 100)} %`; }
        else if (m.status?.includes('loading')) progText.textContent = 'Cargando el lector de texto…';
      });
      prog.hidden = true;
      if (!r.ingredients || r.ingredients.length < 10) {
        progText.textContent = '';
        append(ocrMsg, [h('p', { class: 'card warn', role: 'alert' }, 'No se ha podido leer texto en la foto. Prueba con más luz, sin reflejos y encuadrando solo la lista de ingredientes.')]);
        return;
      }
      ingr.value = r.ingredients; usedOcr = true;
      if (r.sugars != null && !sug.value) sug.value = String(r.sugars).replace('.', ',');
      progText.textContent = 'Texto leído. Revísalo antes de analizar.';
      append(ocrMsg, [h('p', { class: `card ${r.confidence < 70 ? 'warn' : 'info'}`, role: 'status' },
        r.confidence < 70 ? 'La foto se ha leído con dificultad. ' : 'Foto leída. ',
        'Comprueba que están todos los azúcares, jarabes y edulcorantes (E420, sorbitol…). Corrige lo que haga falta.')]);
      ingr.focus();
    } catch (err) {
      prog.hidden = true; progText.textContent = '';
      append(ocrMsg, [h('p', { class: 'card warn', role: 'alert' }, 'No se ha podido leer la foto en este dispositivo. Escribe los ingredientes a mano.')]);
      console.error(err);
    }
  }
  const cam = h('input', { id: 'photo', type: 'file', accept: 'image/*', capture: 'environment', class: 'visually-hidden', onchange: onPhoto });
  const gal = h('input', { id: 'gallery', type: 'file', accept: 'image/*', class: 'visually-hidden', onchange: onPhoto });

  const form = h('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault();
    const text = ingr.value.trim();
    if (text.length < 3) { ingr.setCustomValidity('Escribe los ingredientes'); ingr.reportValidity(); return; }
    const sv = sug.value.trim() ? parseFloat(sug.value.replace(',', '.')) : null;
    if (sv != null && !(sv >= 0 && sv <= 100)) { sug.setCustomValidity('Entre 0 y 100'); sug.reportValidity(); return; }
    const now = nowISO();
    const id = ex?.id || ean || `m-${crypto.randomUUID()}`;
    const it = { ...(ex || { id, ean, firstSeen: now, times: 1, favorite: false, tolerance: null, note: '', image: '', brand: '' }),
      name: nameIn.value.trim().slice(0, 200) || ex?.name || 'Producto sin nombre',
      ingredients: text.slice(0, 3000), sugars100g: sv ?? ex?.sugars100g ?? null,
      source: usedOcr ? 'foto' : (ex && ex.ingredients === text ? ex.source : 'usuario'), lastSeen: now };
    await saveItem(it);
    location.hash = `#/r/${encodeURIComponent(it.id)}`;
  } },
  h('label', { for: 'pname' }, 'Nombre del producto', !ex?.name ? h('span', { class: 'req' }, ' (obligatorio)') : null), nameIn,
  h('div', { class: 'photo-box card' },
    h('p', {}, h('strong', {}, 'Rellenar con una foto')),
    h('div', { class: 'grid-actions' },
      h('label', { for: 'photo', class: 'btn primary' }, 'Hacer foto'),
      h('label', { for: 'gallery', class: 'btn' }, 'Elegir de la galería')),
    cam, gal,
    h('ul', { class: 'hint tips' }, h('li', {}, 'Encuadra solo la lista de ingredientes'), h('li', {}, 'Buena luz y sin reflejos'), h('li', {}, 'Etiqueta lo más plana posible')),
    preview, prog, progText, ocrMsg),
  h('label', { for: 'ingr' }, 'Ingredientes ', h('span', { class: 'req' }, '(obligatorio)')), ingr,
  h('span', { id: 'ingr-help', class: 'hint' }, 'Copia la lista tal cual aparece, separada por comas.'),
  h('label', { for: 'sugars' }, 'Azúcares por 100 g (opcional)'), sug,
  h('button', { type: 'submit', class: 'btn primary block' }, 'Analizar y guardar'));
  [ingr, sug].forEach((el) => el.addEventListener('input', () => el.setCustomValidity('')));

  page(ex ? 'Corregir ingredientes' : 'Añadir ingredientes', ean ? h('p', { class: 'sub' }, `Código ${ean}`) : null, form);
  if (!q.manual && !ex?.ingredients) setTimeout(() => cam.focus(), 0);
}

async function viewRecent() {
  const items = await store.recent(20);
  page('Vistos últimamente', items.length ? h('ul', { class: 'list' }, items.map(itemRow))
    : empty('Aún no has escaneado nada. Prueba con algo de tu despensa.', linkBtn('Escanear', '#/', 'btn primary')));
}

async function viewMyBase() {
  const all = await store.allItems();
  const listEl = h('ul', { class: 'list' }); const count = h('p', { class: 'hint', role: 'status' });
  const search = h('input', { id: 'q', type: 'search', name: 'q', autocomplete: 'off', enterkeyhint: 'search' });
  const filters = [['all', 'Todos'], ['red', 'Mejor evitar'], ['yellow', 'Con moderación'], ['green', 'Apto'], ['mal', 'Me sentó mal'], ['fav', 'Favoritos']];
  const sortSel = h('select', { id: 'sort', name: 'sort' }, h('option', { value: 'recent' }, 'Más recientes'), h('option', { value: 'name' }, 'Nombre (A-Z)'), h('option', { value: 'times' }, 'Más escaneados'));
  const fs = h('fieldset', { class: 'chips' }, h('legend', { class: 'visually-hidden' }, 'Filtrar'),
    filters.map(([v, t], i) => h('label', { class: 'pill' }, h('input', { type: 'radio', name: 'f', value: v, checked: i === 0 }), h('span', {}, t))));
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  function render() {
    const q = norm(search.value); const f = fs.querySelector('input:checked').value;
    let arr = all.filter((it) => !q || norm(`${it.name} ${it.brand} ${it.ean || ''}`).includes(q));
    arr = arr.filter((it) => {
      if (f === 'all') return true; if (f === 'fav') return it.favorite; if (f === 'mal') return it.tolerance === 'mal';
      return overall(analyzeItem(it)) === f;
    });
    const s = sortSel.value;
    arr.sort((a, b) => (s === 'name' ? (a.name || '').localeCompare(b.name || '', 'es') : s === 'times' ? (b.times || 0) - (a.times || 0) : b.lastSeen.localeCompare(a.lastSeen)));
    clear(listEl); append(listEl, arr.map(itemRow));
    count.textContent = `${arr.length} de ${all.length} productos`;
  }
  search.addEventListener('input', render); fs.addEventListener('change', render); sortSel.addEventListener('change', render);
  if (!all.length) { page('Mi base', empty('Aquí se guardará todo lo que escanees, para no tener que repetirlo.', linkBtn('Escanear mi primer producto', '#/', 'btn primary'))); return; }
  const rated = all.filter((it) => it.tolerance).length;
  page('Mi base',
    rated ? linkBtn([icon('detective'), 'Tus sospechosos', h('span', { class: 'hint' }, `${rated} valorado${rated === 1 ? '' : 's'}`)], '#/sospechosos', 'btn block') : null,
    h('div', { class: 'stack' },
      h('label', { for: 'q' }, 'Buscar en mi base'), search, fs,
      h('div', { class: 'field-row' }, h('label', { for: 'sort' }, 'Ordenar'), sortSel)),
    count, listEl,
    h('div', { class: 'grid-actions' }, button('Exportar CSV', { onclick: () => exportData('csv') }), button('Exportar JSON', { onclick: () => exportData('json') })));
  render();
}

async function exportData(fmt) {
  const date = new Date().toISOString().slice(0, 10);
  if (fmt === 'json') {
    const backup = buildBackup(state.profile, await store.allItems(), (it) => overall(analyzeItem(it)));
    download(`fructoscan-copia-${date}.json`, JSON.stringify(backup, null, 2), 'application/json');
    await store.set('lastBackup', nowISO());
    return;
  }
  const items = (await store.allItems()).map((it) => ({ ...it, resultado: overall(analyzeItem(it)) }));
  const cols = ['name', 'brand', 'ean', 'resultado', 'tolerance', 'favorite', 'sugars100g', 'times', 'firstSeen', 'lastSeen', 'note', 'ingredients'];
  // Evita inyección de fórmulas en Excel (celdas que empiezan por = + - @)
  const cell = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
  const csv = [cols.join(';'), ...items.map((it) => cols.map((c) => cell(it[c])).join(';'))].join('\r\n');
  download(`fructoscan-${date}.csv`, `﻿${csv}`, 'text/csv');
}

function viewTips() {
  page('Consejos',
    h('section', { class: 'card' }, h('h2', {}, 'Consejos rápidos'),
      h('ul', { class: 'tips-list' }, QUICK_TIPS.map(([t, d]) => h('li', {}, h('strong', {}, t), h('span', {}, d))))),
    h('section', { class: 'card' }, h('h2', {}, 'Mucha fructosa'),
      h('table', { class: 'tbl' }, h('caption', { class: 'visually-hidden' }, 'Fructosa aproximada por 100 g'),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Alimento'), h('th', { scope: 'col' }, 'Fructosa / 100 g'))),
        h('tbody', {}, HIGH_FRUCTOSE.map(([a, b]) => h('tr', {}, h('th', { scope: 'row' }, a), h('td', {}, b)))))),
    h('section', { class: 'card' }, h('h2', {}, 'Llevan sorbitol'), h('ul', { class: 'cols' }, HIGH_SORBITOL.map((x) => h('li', {}, x)))),
    h('section', { class: 'card' }, h('h2', {}, 'Poca fructosa'), h('ul', { class: 'cols' }, LOW_FRUCTOSE.map((x) => h('li', {}, x)))),
    h('div', { class: 'grid-actions trio' },
      linkBtn([icon('magnifying-glass'), 'Fruta y verdura'], '#/buscar'),
      linkBtn([icon('pill'), 'Medicamentos'], '#/medicamentos'),
      linkBtn([icon('detective'), 'Tus sospechosos'], '#/sospechosos')),
    h('p', { class: 'disclaimer' }, 'Valores aproximados (USDA FoodData Central). Cada persona tiene su propio umbral: apúntalo con «¿Qué tal te sentó?».'));
}

function viewSearch() {
  const input = h('input', { id: 'food', type: 'search', autocomplete: 'off', enterkeyhint: 'search', placeholder: 'manzana, plátano, miel…' });
  const out = h('ul', { class: 'list foods', 'aria-live': 'polite' });
  input.addEventListener('input', () => {
    const r = searchFoods(input.value); clear(out);
    if (input.value.trim().length >= 2 && !r.length) out.append(h('li', { class: 'hint' }, 'No está en la tabla. Prueba con otro nombre.'));
    append(out, r.map((f) => h('li', { class: 'food card' },
      h('h2', {}, f.name),
      h('p', { class: 'badges' }, h('span', { class: `badge lv-${f.fru}` }, PHRASE.fructose[f.fru]), h('span', { class: `badge lv-${f.pol}` }, PHRASE.polyols[f.pol])),
      h('p', { class: 'hint' }, `Fructosa ${String(f.fructose).replace('.', ',')} g · glucosa ${String(f.glucose).replace('.', ',')} g por 100 g`,
        f.excess > 0.5 ? ` · ${String(f.excess).replace('.', ',')} g más de fructosa que de glucosa` : ''))));
  });
  page('Alimento fresco', h('label', { for: 'food' }, 'Busca una fruta, verdura u otro alimento'), input, out,
    h('p', { class: 'disclaimer' }, 'Valores medios aproximados por 100 g (USDA). Varían con la madurez y la variedad; el sorbitol es orientativo.'));
  input.focus();
}

// ---------------------------------------------------------------- medicamentos (CIMA, AEMPS)
const MED_RECENT = 10;
async function rememberMed(med) {
  await store.set(`med:${med.nregistro}`, med);
  const recent = (await store.get('medsRecent')) || [];
  await store.set('medsRecent', [med.nregistro, ...recent.filter((x) => x !== med.nregistro)].slice(0, MED_RECENT));
}
const medRow = (m, sub) => h('li', {},
  h('a', { class: 'row', href: `#/med/${encodeURIComponent(m.nregistro)}` },
    h('span', { class: 'row-icon', 'aria-hidden': 'true' }, icon('pill')),
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, m.name || 'Medicamento'), h('span', { class: 'row-sub' }, sub ?? m.lab)),
    icon('caret-right')));

async function viewMeds() {
  const input = h('input', { id: 'med', type: 'search', autocomplete: 'off', enterkeyhint: 'search', maxlength: '60', placeholder: 'dalsy, ibuprofeno, omeprazol…' });
  const status = h('p', { class: 'hint', role: 'status', 'aria-live': 'polite' });
  const out = h('ul', { class: 'list' });
  let seq = 0; let timer;
  async function search() {
    const q = input.value.trim(); const n = ++seq;
    if (q.length < 3) { clear(out); status.textContent = ''; return; }
    status.textContent = 'Buscando en el CIMA…';
    try {
      const r = await searchMeds(q);
      if (n !== seq) return;                       // ya se ha escrito otra cosa
      clear(out); append(out, r.map((m) => medRow(m)));
      status.textContent = !r.length ? 'No hay medicamentos comercializados con ese nombre.'
        : r.length === 25 ? 'Los 25 primeros resultados. Escribe más para afinar.' : `${r.length} resultado${r.length === 1 ? '' : 's'}`;
    } catch (e) {
      if (n === seq) status.textContent = e.message;
    }
  }
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 350); });
  const recentIds = (await store.get('medsRecent')) || [];
  const recent = (await Promise.all(recentIds.map((id) => store.get(`med:${id}`)))).filter(Boolean);
  page('Medicamentos',
    h('p', { class: 'lead' }, 'Muchos jarabes, sobres y comprimidos llevan sacarosa, fructosa o sorbitol como excipiente. Búscalo antes de tomarlo.'),
    h('label', { for: 'med' }, 'Nombre del medicamento'), input, status, out,
    recent.length ? h('section', {}, h('h2', {}, 'Consultados'), h('ul', { class: 'list' }, recent.map((m) => medRow(m)))) : null,
    h('p', { class: 'disclaimer' }, 'Medicamentos autorizados en España. Datos de la ficha técnica oficial (CIMA, Agencia Española de Medicamentos y Productos Sanitarios).'));
  input.focus();
}

async function viewMed(nr) {
  if (!isValidNr(nr)) { page('No encontrado', empty('Ese enlace no corresponde a ningún medicamento.', linkBtn('Buscar un medicamento', '#/medicamentos', 'btn primary'))); return; }
  const here = location.hash;
  page('Buscando…', h('div', { class: 'searching' }, h('div', { class: 'skel big' }), h('div', { class: 'skel' }), h('div', { class: 'skel' })));
  let med; let notice = null;
  try {
    med = await getMed(nr);
    if (med) await rememberMed(med);
  } catch (e) {
    med = await store.get(`med:${nr}`);
    if (location.hash !== here) return;          // el usuario ya se fue a otra pantalla
    if (!med) {
      page('No se ha podido consultar', h('p', { role: 'alert' }, e.message),
        button('Volver a intentarlo', { class: 'btn primary', onclick: () => viewMed(nr) }), linkBtn('Buscar otro', '#/medicamentos', 'btn link'));
      return;
    }
    notice = 'Sin conexión: se muestran los datos guardados.';
  }
  if (location.hash !== here) return;
  if (!med) { page('No encontrado', empty('Ese medicamento no está en el CIMA.', linkBtn('Buscar otro', '#/medicamentos', 'btn primary'))); return; }

  const text = medAnalysisText(med);
  const res = analyze({ ingredients: text }, state.profile);
  const lv = text ? overall(res) : 'unknown'; const v = verdictFor(lv, state.profile);
  const inds = [['fructose', res.fructose], ['polyols', res.polyols]];
  const subline = text ? joinEs(inds.map(([k, i]) => PHRASE[k][i.level])) : 'La ficha no detalla los excipientes';
  const seen = new Set();
  const reasons = (text ? [...res.fructose.reasons.map((r) => [res.fructose.level, r]), ...res.polyols.reasons.map((r) => [res.polyols.level, r])] : [])
    .map(([l, r]) => [l, withoutPosition(r)]).filter(([, r]) => !seen.has(r) && seen.add(r));
  const docLink = (label, url) => (url ? h('a', { class: 'btn', href: url, target: '_blank', rel: 'noopener noreferrer' }, label, icon('arrow-square-out')) : null);
  page(med.name || 'Medicamento',
    h('p', { class: 'sub' }, med.lab),
    notice ? h('p', { class: 'warn-line', role: 'status' }, icon('info'), h('span', {}, notice)) : null,
    h('section', { class: `verdict lv-${lv}`, 'aria-label': `Veredicto: ${v.word}. ${subline}` },
      h('span', { class: 'stamp', 'aria-hidden': 'true' }, icon(v.mark)),
      h('p', { class: 'v-word' }, v.word)),
    text ? h('ul', { class: 'meters', 'aria-label': 'Detalle por tipo' }, inds.map(([k, i]) => meter(k, i)))
      : h('p', { class: 'warn-line', role: 'note' }, icon('info'), h('span', {}, 'La ficha técnica no detalla los excipientes. Consulta el prospecto o pregunta en la farmacia.')),
    reasons.length ? h('section', { class: 'why card' }, h('h2', {}, 'Por qué'),
      h('ul', {}, reasons.map(([l, r]) => h('li', { class: `lv-${l}` }, r))),
      h('p', { class: 'profile-chip' }, `Según tu perfil: ${PROFILES[state.profile].short}`)) : null,
    med.known ? h('section', { class: 'card' }, h('h2', {}, 'Excipientes con efecto conocido'),
      h('p', { class: 'ingr' }, highlighted(med.known, detect(med.known).hits)),
      h('p', { class: 'hint' }, 'Cantidad por unidad (comprimido, sobre, mililitro…) según la ficha técnica.')) : null,
    med.excipients ? h('details', { class: 'card', open: !med.known },
      h('summary', {}, 'Lista completa de excipientes'),
      h('p', { class: 'ingr' }, highlighted(med.excipients, detect(med.excipients).hits))) : null,
    h('div', { class: 'grid-actions' }, docLink('Ficha técnica', med.fichaUrl), docLink('Prospecto', med.prospectoUrl)),
    h('p', { class: 'warn-line', role: 'note' }, icon('warning'),
      h('span', {}, 'No dejes un tratamiento por tu cuenta. Consulta con tu médico o farmacéutico: a veces la cantidad es pequeña o hay otra presentación sin ese excipiente.')),
    h('p', { class: 'disclaimer' }, `Datos de la ficha técnica (CIMA, AEMPS), consultados ${timeAgo(med.fetchedAt)}.`));
}

// ---------------------------------------------------------------- tus sospechosos
async function viewSuspects() {
  const r = suspects(await store.allItems(), state.profile);
  if (!r.enough) {
    page('Tus sospechosos',
      h('p', { class: 'lead' }, 'Cruza lo que te sentó mal con sus ingredientes para ver qué se repite.'),
      empty(r.rated >= MIN_RATED
        ? `Llevas ${r.rated} productos valorados y ninguno te sentó mal, así que no hay nada que se repita. ¡Buena señal!`
        : `Hacen falta al menos ${MIN_RATED} productos valorados con «¿Qué tal te sentó?» y alguno que te sentara mal. Llevas ${r.rated}.`,
        linkBtn('Ir a mi base', '#/mibase', 'btn primary')));
    return;
  }
  const veces = (n) => `${n} ${n === 1 ? 'vez' : 'veces'}`;
  page('Tus sospechosos',
    h('p', { class: 'lead' }, `Entre los ${r.rated} productos que has valorado, ${r.mal} te ${r.mal === 1 ? 'sentó' : 'sentaron'} mal. Esto es lo que se repite en ellos.`),
    r.suspects.length ? h('ol', { class: 'suspects' }, r.suspects.map((s) => h('li', { class: 'card' },
      h('p', { class: 'sus-head' }, h('strong', {}, s.label), s.strong ? h('span', { class: 'badge lv-red' }, 'Se repite') : null),
      h('p', { class: 'm0' }, `En ${s.mal} de los ${r.mal} que te sentaron mal`, s.bien ? ` · bien ${veces(s.bien)}` : '', s.regular ? ` · regular ${veces(s.regular)}` : ''),
      h('p', { class: 'hint' }, `Por ejemplo: ${s.examples.join(', ')}`))))
      : empty('Lo que te sentó mal no tiene ningún ingrediente con fructosa o sorbitol en común. Quizá sea la cantidad, u otra cosa: coméntalo con tu dietista.'),
    r.tolerated.length ? h('section', { class: 'card' }, h('h2', {}, 'Parece que toleras'),
      h('ul', { class: 'tips-list' }, r.tolerated.map((s) => h('li', {}, h('strong', {}, s.label), h('span', {}, `Bien ${veces(s.bien)} y nunca mal`))))) : null,
    h('p', { class: 'disclaimer' }, 'Son coincidencias, no un diagnóstico: también influyen la cantidad y lo que comas a la vez. Un dietista puede confirmarlo con una reintroducción guiada.'));
}

async function viewProfile() {
  const pf = profileFieldset(state.profile);
  pf.addEventListener('change', async (e) => {
    state.profile = e.target.value; await store.set('profile', state.profile);
    toast(`Perfil cambiado a ${PROFILES[state.profile].short}`);
  });
  const lastBackup = await store.get('lastBackup');
  const fileIn = h('input', { id: 'backup-file', type: 'file', accept: 'application/json,.json', class: 'visually-hidden',
    onchange: (e) => { const f = e.target.files?.[0]; if (f) importBackup(f); e.target.value = ''; } });
  page('Perfil',
    h('form', { class: 'card', onsubmit: (e) => e.preventDefault() }, pf),
    installCard(true),
    h('section', { class: 'card stack' }, h('h2', {}, 'Tus datos'),
      h('p', { class: 'm0' }, 'Todo se guarda solo en este móvil. Haz una copia de vez en cuando para no perderlo si cambias de móvil o borras los datos del navegador.'),
      h('p', { class: 'hint' }, lastBackup ? `Última copia ${timeAgo(lastBackup)}` : 'Aún no has hecho ninguna copia'),
      h('div', { class: 'grid-actions' },
        button('Guardar copia', { class: 'btn primary', onclick: () => exportData('json') }),
        h('label', { for: 'backup-file', class: 'btn' }, 'Recuperar copia'), fileIn),
      button('Exportar a Excel (CSV)', { class: 'btn link', onclick: () => exportData('csv') }),
      button('Borrar los datos de este móvil', { class: 'btn danger-outline', onclick: async () => {
        if (!(await confirmDialog('¿Borrar todo lo guardado en este móvil? No se puede deshacer. Si quieres conservarlo, guarda antes una copia.', 'Borrar datos', 'Conservar'))) return;
        await store.clearAll(); state.profile = 'malabsorcion'; state.session = []; toast('Datos borrados'); location.hash = '#/bienvenida';
      } })),
    h('section', { class: 'card' }, h('h2', {}, 'Privacidad'),
      h('p', {}, 'No hay cuentas ni servidor: tus productos, notas y tu perfil se quedan en este móvil. Las fotos de las etiquetas se leen dentro del móvil y no se envían.'),
      h('p', { class: 'hint' }, 'Datos de productos: Open Food Facts (licencia ODbL). Alimentos frescos: USDA FoodData Central. Medicamentos: CIMA (AEMPS).'),
      h('p', { class: 'm0' }, h('a', { href: '#/privacidad' }, 'Política de privacidad'), ' · ', h('a', { href: '#/aviso' }, 'Aviso legal'))),
    h('p', { class: 'disclaimer' }, `FructoScan ${CONFIG.APP_VERSION} · Estimación orientativa, no sustituye el consejo médico.`));
}

// Recupera una copia (de este u otro móvil) sin pisar lo que ya hay: de cada producto gana la versión más reciente
async function importBackup(file) {
  if (file.size > 20e6) { toast('El archivo es demasiado grande para ser una copia'); return; }
  try {
    const { profile, items, skipped } = parseBackup(await file.text());
    for (const it of items) await store.putItem(mergeItem(await store.getItem(it.id), it));
    if (profile) { state.profile = profile; await store.set('profile', profile); }
    await store.set('onboarded', true);
    const n = items.length;
    toast(`${n} producto${n === 1 ? '' : 's'} recuperado${n === 1 ? '' : 's'}${skipped ? ` (${skipped} no se ${skipped === 1 ? 'pudo' : 'pudieron'} leer)` : ''}`);
    viewProfile();
  } catch (e) {
    toast(e.message || 'No se ha podido leer la copia');
  }
}

// Instalarla en la pantalla de inicio: se abre como una app y, en iPhone, Safari no borra sus datos por no usarla
const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function installCard(always = false) {
  if (isInstalled() || (!state.installPrompt && !isIOS())) return null;
  const card = h('section', { class: 'card stack install' }, h('h2', {}, 'Tenla a mano en el súper'));
  if (state.installPrompt) {
    append(card, [h('p', { class: 'm0' }, 'Instálala en tu pantalla de inicio: se abre al momento, funciona sin conexión y no ocupa casi nada.'),
      button('Instalar FructoScan', { class: 'btn primary', onclick: async () => {
        const ev = state.installPrompt; state.installPrompt = null;
        ev.prompt(); const { outcome } = await ev.userChoice.catch(() => ({}));
        if (outcome === 'accepted') card.remove();
      } })]);
  } else {
    append(card, [h('p', { class: 'm0' }, 'En Safari, pulsa Compartir y luego «Añadir a pantalla de inicio». Así se abre como una app y el iPhone no borra tus productos si pasas unos días sin usarla.')]);
  }
  if (!always) append(card, [button('Ahora no', { class: 'btn link', onclick: async () => { await store.set('installHidden', true); card.remove(); } })]);
  return card;
}

// ---------------------------------------------------------------- textos legales (uso público)
const contactLine = () => (CONFIG.CONTACT_EMAIL
  ? h('a', { href: `mailto:${CONFIG.CONTACT_EMAIL}` }, CONFIG.CONTACT_EMAIL)
  : h('strong', {}, 'pendiente de completar'));

function viewPrivacy() {
  const sec = (title, ...body) => h('section', {}, h('h2', {}, title), ...body);
  const ul = (...items) => h('ul', {}, items.map((t) => h('li', {}, t)));
  page('Privacidad',
    h('div', { class: 'prose' },
      h('p', { class: 'lead' }, 'Lo corto: FructoScan no tiene cuentas ni servidor propio. Lo que guardas se queda en tu móvil. Solo sale de él lo que consultas: el código de barras de un producto o el nombre de un medicamento.'),
      sec('Quién es el responsable',
        h('p', {}, `${CONFIG.OWNER || 'Titular pendiente de completar'}. Contacto: `, contactLine(), '.')),
      sec('Qué se guarda y dónde',
        ul('Tu perfil, los productos que escaneas, tus notas y si te sentaron bien se guardan solo en el almacenamiento de este navegador.',
          'Nadie más puede verlos, tampoco el responsable de la app: no se envían a ningún servidor.',
          'Las fotos de las etiquetas se leen dentro del móvil. No se envían ni se guardan.',
          'Si borras los datos del navegador o desinstalas la app, se borran. Puedes guardar una copia en un archivo desde Perfil.')),
      sec('Qué sale de tu móvil',
        ul('Para buscar un producto, la app envía su código de barras a Open Food Facts, una base de datos abierta y sin ánimo de lucro (Francia). No se envía nada que te identifique.',
          'Si buscas un medicamento, lo que escribes se envía al CIMA de la Agencia Española de Medicamentos y Productos Sanitarios (AEMPS), el registro oficial. Tampoco va nada que te identifique.',
          'La web se sirve desde Cloudflare Pages, que, como cualquier alojamiento, registra datos técnicos de las visitas (dirección IP, navegador) para funcionar y protegerse.')),
      sec('Lo que no hacemos',
        ul('No hay registro, ni publicidad, ni analítica, ni cookies.',
          'No recogemos, vendemos ni cedemos datos personales.')),
      sec('Tus derechos',
        h('p', {}, 'Como tus datos solo están en tu dispositivo, tú los controlas: puedes exportarlos y borrarlos desde Perfil cuando quieras. Para cualquier duda escribe a ', contactLine(), '.')),
      h('p', { class: 'disclaimer' }, 'FructoScan no es un producto sanitario. Los resultados son una estimación y no sustituyen el consejo de tu médico o dietista.')));
}

function viewLegal() {
  page('Aviso legal',
    h('div', { class: 'prose' },
      h('p', {}, `FructoScan es un proyecto personal y gratuito de ${CONFIG.OWNER || 'titular pendiente de completar'}. Contacto: `, contactLine(), '.'),
      h('h2', {}, 'Para qué sirve y para qué no'),
      h('p', {}, 'Ayuda a leer etiquetas a personas con malabsorción de fructosa, intolerancia hereditaria a la fructosa o dieta baja en FODMAP. Estima el riesgo a partir de los ingredientes y los azúcares declarados. No es un producto sanitario, no diagnostica y no sustituye a un profesional. Las etiquetas cambian y las bases de datos pueden tener errores: ante la duda, lee la etiqueta del envase.'),
      h('h2', {}, 'Datos de terceros'),
      h('ul', {},
        h('li', {}, 'Productos: Open Food Facts, bajo licencia Open Database License (ODbL).'),
        h('li', {}, 'Fruta y verdura: valores aproximados de USDA FoodData Central (dominio público).'),
        h('li', {}, 'Medicamentos: fichas técnicas del CIMA de la AEMPS, consultadas en el momento.'),
        h('li', {}, 'Iconos: Phosphor Icons (licencia MIT). Tipografía: Bricolage Grotesque (SIL Open Font License).')),
      h('h2', {}, 'Responsabilidad'),
      h('p', {}, 'La app se ofrece tal cual, sin garantías. El titular no se hace responsable de decisiones tomadas solo a partir de sus resultados.'),
      h('p', {}, h('a', { href: '#/privacidad' }, 'Política de privacidad'))));
}

// ---------------------------------------------------------------- escáner (carga diferida)
let startScanner;
async function loadScanner() { if (!startScanner) ({ startScanner } = await import('./scanner.js')); }

// ---------------------------------------------------------------- router
function parse() {
  const [path, qs] = (location.hash.slice(1) || '/').split('?');
  return { parts: path.split('/').filter(Boolean), q: Object.fromEntries(new URLSearchParams(qs || '')) };
}
async function route() {
  if (state.scanner) { state.scanner.stop(); state.scanner = null; }
  const { parts, q } = parse();
  const [a, b] = parts;
  // La portada es la única pantalla sin barra de navegación
  document.body.classList.toggle('no-nav', a === 'bienvenida');
  document.querySelectorAll('.nav a').forEach((l) => {
    const target = l.getAttribute('href').slice(2) || '';
    if ((a || '') === target) l.setAttribute('aria-current', 'page'); else l.removeAttribute('aria-current');
  });
  try {
    if (!a) { await loadScanner(); await viewScan(); }
    else if (a === 'p' && b) await viewProduct(cleanCode(b));
    else if (a === 'r' && b) await viewResultById(decodeURIComponent(b));
    else if (a === 'ingredientes') await viewIngredients(q);
    else if (a === 'recientes') await viewRecent();
    else if (a === 'mibase') await viewMyBase();
    else if (a === 'consejos') viewTips();
    else if (a === 'buscar') viewSearch();
    else if (a === 'medicamentos') await viewMeds();
    else if (a === 'med' && b) await viewMed(decodeURIComponent(b));
    else if (a === 'sospechosos') await viewSuspects();
    else if (a === 'perfil') await viewProfile();
    else if (a === 'bienvenida') await viewWelcome();
    else if (a === 'privacidad') viewPrivacy();
    else if (a === 'aviso') viewLegal();
    else page('Página no encontrada', linkBtn('Ir al inicio', '#/', 'btn primary'));
  } catch (e) {
    console.error(e);
    page('Algo ha fallado', h('p', {}, 'Ha ocurrido un error inesperado.'), linkBtn('Volver al inicio', '#/', 'btn primary'));
  }
  const title = $('.page-title');
  if (title && !['buscar', 'ingredientes', 'medicamentos'].includes(a)) title.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------- arranque
async function init() {
  document.querySelectorAll('.nav a[data-icon]').forEach((a) => a.prepend(icon(a.dataset.icon)));
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.installPrompt = e; });
  const recovered = await store.migrateOldAccounts(mergeItem).catch(() => 0);
  state.profile = (await store.get('profile')) || 'malabsorcion';
  const net = $('#offline');
  const setNet = () => { net.hidden = navigator.onLine; };
  addEventListener('online', setNet); addEventListener('offline', setNet); setNet();
  addEventListener('hashchange', route);
  const onboarded = await store.get('onboarded');
  // La primera vez se pasa por la portada para elegir perfil; los enlaces directos (#/p/…) se respetan
  if (!onboarded && !parse().parts.length) location.hash = '#/bienvenida';
  else route();
  if (recovered) {
    const msg = recovered === 1 ? 'tu producto sigue' : `tus ${recovered} productos siguen`;
    setTimeout(() => toast(`Las cuentas ya no existen: ${msg} en este móvil`), 400);
  }
  // Pide al navegador que no borre los datos de la app por falta de espacio
  navigator.storage?.persist?.().catch(() => {});
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}
init();
