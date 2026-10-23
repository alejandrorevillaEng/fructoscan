// Tests de "Tus sospechosos".
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { suspects } from '../js/insights.js';

const p = (name, ingredients, tolerance) => ({ name, ingredients, tolerance });

describe('tus sospechosos', () => {
  test('pocos datos: todavía no hay conclusiones', () => {
    const r = suspects([p('A', 'sorbitol, cacao', 'mal'), p('B', 'arroz', 'bien')]);
    assert.equal(r.enough, false);
  });

  test('el ingrediente que se repite en lo que sienta mal sale el primero', () => {
    const r = suspects([
      p('Chicles', 'edulcorantes (sorbitol, E-420), goma base', 'mal'),
      p('Caramelos sin azúcar', 'isomalt, sorbitol', 'mal'),
      p('Galletas', 'harina de trigo, azúcar, sorbitol', 'mal'),
      p('Zumo', 'zumo de manzana', 'regular'),
      p('Arroz con leche', 'leche, arroz, azúcar', 'bien'),
      p('Yogur', 'leche, azúcar', 'bien'),
    ]);
    assert.equal(r.enough, true);
    assert.equal(r.suspects[0].key, 'sorbitol');
    assert.equal(r.suspects[0].mal, 3, 'sorbitol y E-420 en el mismo producto cuentan una vez');
    assert.equal(r.suspects[0].strong, true);
    assert.match(r.suspects[0].label, /E420/);
    assert.deepEqual(r.suspects[0].examples, ['Chicles', 'Caramelos sin azúcar', 'Galletas']);
  });

  test('lo que sienta bien más veces que mal no es sospechoso', () => {
    const r = suspects([
      p('Galletas', 'harina de trigo, azúcar, sorbitol', 'mal'),
      p('Arroz con leche', 'leche, arroz, azúcar', 'bien'),
      p('Yogur', 'leche, azúcar', 'bien'),
    ]);
    assert.ok(!r.suspects.some((s) => s.key === 'azucar'));
    assert.ok(r.tolerated.some((s) => s.key === 'azucar' ) === false, 'azúcar salió una vez mal: no va a "toleras bien"');
  });

  test('toleras bien: aparece al menos dos veces y nunca te sentó mal', () => {
    const r = suspects([
      p('A', 'sorbitol', 'mal'),
      p('Pan', 'harina, azúcar', 'bien'),
      p('Bizcocho', 'huevo, azúcar', 'bien'),
    ]);
    assert.deepEqual(r.tolerated.map((s) => s.key), ['azucar']);
  });

  test('el trigo solo es sospechoso en el perfil FODMAP', () => {
    const items = [p('Pan', 'harina de trigo, sal', 'mal'), p('Pasta', 'sémola de trigo', 'mal'), p('Arroz', 'arroz', 'bien')];
    assert.ok(!suspects(items, 'malabsorcion').suspects.some((s) => s.key === 'trigo'));
    assert.ok(suspects(items, 'fodmap').suspects.some((s) => /trigo/i.test(s.label)));
  });

  test('ignora productos sin valorar o sin ingredientes', () => {
    const r = suspects([p('A', 'sorbitol', null), p('B', '', 'mal'), null]);
    assert.equal(r.rated, 0);
  });
});
