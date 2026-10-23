// Tests de la copia de seguridad: lo que llega de un fichero no puede romper la app ni colar datos raros.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseBackup, cleanItem, mergeItem, buildBackup, MAX_ITEMS } from '../js/backup.js';

const nutella = {
  id: '3017620422003', ean: '3017620422003', name: 'Nutella', brand: 'Ferrero',
  image: 'https://images.openfoodfacts.org/images/products/301/762/042/2003/front_es.jpg',
  ingredients: 'Azúcar, aceite de palma, avellanas', sugars100g: 56.3, fructose100g: null, servingG: 15,
  source: 'off', firstSeen: '2026-10-01T10:00:00.000Z', lastSeen: '2026-10-20T10:00:00.000Z',
  updatedAt: '2026-10-20T10:00:00.000Z', times: 3, favorite: true, tolerance: 'regular', note: 'en poca cantidad',
};

describe('leer una copia', () => {
  test('una copia exportada se vuelve a leer igual', () => {
    const texto = JSON.stringify(buildBackup('ihf', [{ ...nutella, dirty: true }], () => 'yellow'));
    const r = parseBackup(texto);
    assert.equal(r.profile, 'ihf');
    assert.equal(r.skipped, 0);
    assert.deepEqual(r.items[0], nutella);
  });
  test('rechaza archivos que no son copias', () => {
    assert.throws(() => parseBackup('no es json'), /no es una copia/);
    assert.throws(() => parseBackup('{"hola": 1}'), /no es una copia/);
    assert.throws(() => parseBackup('[1, 2, 3]'), /no es una copia/);
  });
  test('descarta productos sin identificador válido y cuenta los descartados', () => {
    const r = parseBackup(JSON.stringify({ productos: [nutella, { id: '../../etc' }, null, 'texto'] }));
    assert.equal(r.items.length, 1);
    assert.equal(r.skipped, 3);
  });
  test('un perfil desconocido no se aplica', () => {
    assert.equal(parseBackup(JSON.stringify({ perfil: 'admin', productos: [] })).profile, null);
  });
  test('no admite más de 5.000 productos', () => {
    const muchos = Array.from({ length: MAX_ITEMS + 10 }, (_, i) => ({ ...nutella, id: `m-${String(i).padStart(8, '0')}` }));
    assert.equal(parseBackup(JSON.stringify({ productos: muchos })).items.length, MAX_ITEMS);
  });
});

describe('limpiar cada producto', () => {
  test('solo acepta imágenes de Open Food Facts por https', () => {
    assert.equal(cleanItem({ ...nutella, ean: '301762042200399999' }).ean, null, 'un EAN demasiado largo no se recorta hasta parecer válido');
    assert.equal(cleanItem({ ...nutella, ean: ' 3017620422003' }).ean, '3017620422003', 'se guarda el EAN ya limpio');
    assert.equal(cleanItem({ ...nutella, image: 'javascript:alert(1)' }).image, '');
    assert.equal(cleanItem({ ...nutella, image: 'https://evil.example/?x=.openfoodfacts.org' }).image, '');
    assert.equal(cleanItem({ ...nutella, image: 'http://images.openfoodfacts.org/a.jpg' }).image, '');
  });
  test('recorta textos largos y quita caracteres de control', () => {
    const it = cleanItem({ ...nutella, name: `a\u0000b${'x'.repeat(500)}`, note: 'y'.repeat(900) });
    assert.equal(it.name.length, 200);
    assert.ok(!it.name.includes('\u0000'));
    assert.equal(it.note.length, 500);
  });
  test('valores fuera de rango o de otro tipo se ignoran', () => {
    const it = cleanItem({ ...nutella, sugars100g: 150, times: -3, favorite: 'sí', tolerance: 'fatal', source: 'hack' });
    assert.equal(it.sugars100g, null);
    assert.equal(it.times, 1);
    assert.equal(it.favorite, false);
    assert.equal(it.tolerance, null);
    assert.equal(it.source, 'usuario');
  });
  test('quita campos que no son de la app', () => {
    const it = cleanItem({ ...nutella, __proto__: { x: 1 }, admin: true, resultado: 'green' });
    assert.equal('admin' in it, false);
    assert.equal('resultado' in it, false);
  });
});

describe('unir con lo que ya hay en el móvil', () => {
  test('gana la versión más reciente, sin perder la primera vez ni las veces escaneado', () => {
    const local = { ...nutella, note: 'vieja', updatedAt: '2026-10-10T00:00:00.000Z', firstSeen: '2026-09-01T00:00:00.000Z', times: 7 };
    const r = mergeItem(local, { ...nutella, note: 'nueva', times: 3 });
    assert.equal(r.note, 'nueva');
    assert.equal(r.firstSeen, '2026-09-01T00:00:00.000Z');
    assert.equal(r.times, 7);
  });
  test('si lo del móvil es más nuevo, se queda', () => {
    const local = { ...nutella, note: 'del móvil', updatedAt: '2026-10-30T00:00:00.000Z' };
    assert.equal(mergeItem(local, { ...nutella, note: 'de la copia' }).note, 'del móvil');
  });
  test('un producto nuevo se añade tal cual', () => {
    assert.deepEqual(mergeItem(undefined, nutella), nutella);
  });
});
