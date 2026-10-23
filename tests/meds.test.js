// Tests de medicamentos con respuestas del CIMA grabadas (no necesitan conexión).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { htmlToText, knownExcipients, searchMeds, getMed, medAnalysisText, withoutPosition } from '../js/meds.js';
import { analyze, overall } from '../js/analyzer.js';

// Respuestas reales del CIMA para Dalsy 20 mg/ml suspensión oral (nregistro 59166), recortadas
const S2 = '<p>Cada mililitro de suspensi&oacute;n oral contiene:</p><p>Ibuprofeno &hellip;&hellip;&hellip; 20 mg</p><p><b>Excipientes con efecto conocido:</b></p><p>Sacarosa&hellip;&hellip;&hellip;&hellip;660 mg</p><p>Sorbitol (E 420)&hellip;&hellip;&hellip;100 mg</p><p>Para consultar la lista completa de excipientes, ver secci&oacute;n 6.1.</p>';
const S61 = '<p>Glicerol (E-422), sorbitol (E-420), agar-agar (E-406), esencia de naranja, &aacute;cido c&iacute;trico mono-hidrato, benzoato de sodio (E-211), sacarosa y agua purificada.</p>';

function fakeFetch(routes) {
  return async (url) => {
    const hit = Object.entries(routes).find(([k]) => url.includes(k));
    if (!hit) return { ok: false, status: 404, text: async () => '' };
    const [, body] = hit;
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
}

describe('texto de la ficha técnica', () => {
  test('quita etiquetas y decodifica entidades sin interpretar HTML', () => {
    assert.equal(htmlToText('<p>Sorbitol&nbsp;(E&#45;420)</p><script>alert(1)</script>'), 'Sorbitol (E-420)');
    assert.equal(htmlToText('Suspensi&oacute;n&hellip;'), 'Suspensión…');
    assert.equal(htmlToText('a&#99999999;b&#x110000;c'), 'a b c', 'una entidad fuera de rango no rompe la ficha');
  });
  test('extrae los excipientes con efecto conocido y sus cantidades', () => {
    const t = knownExcipients(S2);
    assert.match(t, /Sacarosa/);
    assert.match(t, /660 mg/);
    assert.match(t, /Sorbitol \(E 420\)/);
    assert.doesNotMatch(t, /Ibuprofeno/);
    assert.doesNotMatch(t, /lista completa/);
  });
  test('sin ese bloque devuelve vacío', () => {
    assert.equal(knownExcipients('<p>Cada comprimido contiene 1 g de paracetamol.</p>'), '');
  });
});

describe('búsqueda y ficha', () => {
  const fetchFn = fakeFetch({
    'medicamentos?nombre=dalsy': { totalFilas: 2, resultados: [
      { nregistro: '59166', nombre: 'DALSY 20 mg/ml SUSPENSION ORAL', labtitular: 'Mylan' },
      { nregistro: '../../etc', nombre: 'malo' }] },
    'medicamento?nregistro=59166': { nombre: 'DALSY 20 mg/ml SUSPENSION ORAL', labtitular: 'Mylan',
      docs: [{ tipo: 1, urlHtml: 'https://cima.aemps.es/cima/dochtml/ft/59166/FT_59166.html' }, { tipo: 2, url: 'javascript:alert(1)' }] },
    'seccion=2': [{ seccion: '2', contenido: S2 }],
    'seccion=6.1': [{ seccion: '6.1', contenido: S61 }],
  });

  test('la búsqueda descarta registros con formato raro y pide al menos 3 letras', async () => {
    const r = await searchMeds('dalsy', fetchFn);
    assert.deepEqual(r.map((x) => x.nregistro), ['59166']);
    assert.deepEqual(await searchMeds('da', fetchFn), []);
  });
  test('la ficha trae excipientes y solo enlaces del CIMA', async () => {
    const m = await getMed('59166', fetchFn);
    assert.match(m.excipients, /sorbitol \(E-420\)/);
    assert.equal(m.fichaUrl, 'https://cima.aemps.es/cima/dochtml/ft/59166/FT_59166.html');
    assert.equal(m.prospectoUrl, '');
  });
  test('rechaza números de registro inválidos sin llamar a la red', async () => {
    await assert.rejects(() => getMed('1; DROP', fetchFn), /no válido/);
  });
  test('Dalsy jarabe: mejor evitar en malabsorción y prohibido en IHF', async () => {
    const m = await getMed('59166', fetchFn);
    const texto = medAnalysisText(m);
    const mal = analyze({ ingredients: texto }, 'malabsorcion');
    assert.equal(mal.polyols.level, 'red');
    assert.equal(overall(mal), 'red');
    assert.equal(overall(analyze({ ingredients: texto }, 'ihf')), 'red');
  });
  test('se analiza la lista completa sin repetir lo de "efecto conocido", y sin posiciones', () => {
    assert.equal(medAnalysisText({ excipients: 'sorbitol, agua', known: 'Sorbitol 100 mg' }), 'sorbitol, agua');
    assert.equal(medAnalysisText({ excipients: '', known: 'Sacarosa 660 mg' }), 'Sacarosa 660 mg');
    assert.equal(withoutPosition('Contiene Sorbitol (E420) (dentro del 12.º ingrediente)'), 'Contiene Sorbitol (E420)');
    assert.equal(withoutPosition('Contiene Sacarosa (3.er ingrediente)'), 'Contiene Sacarosa');
  });
  test('un comprimido sin azúcares ni polioles sale apto', () => {
    const r = analyze({ ingredients: 'Celulosa microcristalina, almidón de maíz, estearato de magnesio, hipromelosa' }, 'malabsorcion');
    assert.equal(overall(r), 'green');
  });
  test('error de red con mensaje claro', async () => {
    const roto = async () => { throw new TypeError('Failed to fetch'); };
    await assert.rejects(() => searchMeds('dalsy', roto), /Sin conexión/);
  });
});
