// Tests del motor de análisis. Fijan el comportamiento de la versión 0.6.1 antes de cambiar nada.
// Ejecuta: npm test
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, overall, detect, normalize, splitTopLevel, lev, cleanOcrText, findSugars, highlightSpans } from '../js/analyzer.js';
import { searchFoods, foodLevel } from '../js/foods.js';
import { isValidEAN, cleanCode, isInStoreCode } from '../js/ean.js';

const NUTELLA = 'Azúcar, aceite vegetal (palma), avellanas 13%, leche desnatada en polvo 8,7%, cacao magro 7,4%, emulgente: lecitinas (soja), vainillina.';
const CHICLES = 'Edulcorantes (sorbitol, maltitol, E-420, aspartamo), goma base, aromas, jarabe de glucosa y fructosa, espesante (goma arábiga). Un consumo excesivo puede producir efectos laxantes.';
const veredicto = (ingredients, profile = 'malabsorcion', extra = {}) => overall(analyze({ ingredients, ...extra }, profile));

describe('normalización y troceo', () => {
  test('quita tildes, mayúsculas, guiones y énfasis de alérgenos', () => {
    assert.equal(normalize('Jarabe de Glucosa-Fructosa, _LECHE_'), 'jarabe de glucosa fructosa, leche');
  });
  test('separa por comas de primer nivel sin romper paréntesis ni decimales', () => {
    const partes = splitTopLevel('azucar, aceite (palma, girasol), avellanas 13,5%, cacao').map((p) => p.text);
    assert.deepEqual(partes, ['azucar', 'aceite (palma, girasol)', 'avellanas 13,5%', 'cacao']);
  });
  test('un paréntesis cerrado agrupa sus ingredientes', () => {
    const partes = splitTopLevel('edulcorantes (sorbitol, maltitol), harina, sal').map((p) => p.text);
    assert.deepEqual(partes, ['edulcorantes (sorbitol, maltitol)', 'harina', 'sal']);
  });
  test('distancia de edición acotada', () => {
    assert.equal(lev('sorbital', 'sorbitol', 2), 1);
    assert.equal(lev('fructosa', 'fructosa', 2), 0);
    assert.ok(lev('chocolate', 'fructosa', 2) > 2);
  });
});

describe('detección de ingredientes', () => {
  test('el jarabe de glucosa solo no cuenta como fructosa', () => {
    const { hits } = detect('jarabe de glucosa, almidón');
    assert.equal(hits.filter((h) => h.cat === 'fru').length, 0);
  });
  test('distingue fructosa-glucosa (alta) de glucosa-fructosa (media)', () => {
    assert.equal(detect('jarabe de fructosa-glucosa').hits[0].level, 'high');
    assert.equal(detect('jarabe de glucosa-fructosa').hits[0].level, 'med');
  });
  test('detecta números E de polioles con y sin guion', () => {
    for (const t of ['E420', 'e-420', 'E 420']) {
      assert.ok(detect(`edulcorante: ${t}`).hits.some((h) => h.key === 'e420'), t);
    }
  });
  test('tolera errores de OCR en palabras sueltas', () => {
    assert.ok(detect('agua, sorbital, sal').hits.some((h) => h.label === 'sorbitol'));
  });
  test('ignora "sin azúcares añadidos" y el aroma de fruta', () => {
    assert.equal(detect('yogur sin azúcares añadidos').hits.length, 0);
    assert.equal(detect('agua, aroma natural de manzana').hits.filter((h) => h.cat === 'fru').length, 0);
  });
  test('reconoce la frase legal de efectos laxantes', () => {
    assert.equal(detect(CHICLES).laxative, true);
  });
});

describe('veredictos por perfil', () => {
  test('los polioles que van juntos en un ingrediente salen en una sola frase, con el ordinal bien escrito', () => {
    const r = analyze({ ingredients: 'Edulcorantes (sorbitol, isomalt, maltitol), goma base, aromas' }, 'malabsorcion');
    assert.ok(r.polyols.reasons.some((x) => /^Contiene (maltitol e isomalt|isomalt y maltitol) \(dentro del 1\.er ingrediente\)$/i.test(x)), r.polyols.reasons.join(' | '));
    assert.ok(!r.polyols.reasons.some((x) => /\dº/.test(x)), 'nada de «1º»: se escribe 1.er / 2.º');
    const s = analyze({ ingredients: 'Agua, azúcar, zumo de manzana' }, 'malabsorcion');
    assert.ok(s.fructose.reasons.some((x) => /\(3\.er ingrediente\)/.test(x)), s.fructose.reasons.join(' | '));
  });

  test('Nutella: con moderación en malabsorción (azúcar = sacarosa)', () => {
    assert.equal(veredicto(NUTELLA, 'malabsorcion', { sugars100g: 56.3 }), 'yellow');
  });
  test('Nutella: prohibida en IHF', () => {
    assert.equal(veredicto(NUTELLA, 'ihf'), 'red');
  });
  test('chicles con sorbitol: mejor evitar y aviso de fructosa + sorbitol', () => {
    const res = analyze({ ingredients: CHICLES, sugars100g: 0.5 }, 'malabsorcion');
    assert.equal(overall(res), 'red');
    assert.equal(res.polyols.level, 'red');
    assert.ok(res.warnings.some((w) => /fructosa \+ sorbitol/i.test(w)));
  });
  test('sorbitol y E420 en el mismo ingrediente salen como un solo motivo', () => {
    const res = analyze({ ingredients: CHICLES, sugars100g: 0.5 }, 'malabsorcion');
    const sorbitol = res.polyols.reasons.filter((r) => /sorbitol/i.test(r) && !/fruta/i.test(r));
    assert.equal(sorbitol.length, 1, sorbitol.join(' | '));
    assert.match(sorbitol[0], /E420/);
    assert.ok(res.polyols.reasons.some((r) => /maltitol/.test(r)), 'el maltitol sigue apareciendo');
  });
  test('el mismo poliol en ingredientes distintos sí cuenta dos veces', () => {
    const res = analyze({ ingredients: 'sorbitol, harina, relleno (sorbitol, cacao)' }, 'malabsorcion');
    assert.equal(res.polyols.reasons.filter((r) => /sorbitol/.test(r)).length, 2);
  });
  test('miel como primer ingrediente: mejor evitar', () => {
    assert.equal(veredicto('miel, polen'), 'red');
  });
  test('arroz y sal: apto', () => {
    assert.equal(veredicto('arroz, sal'), 'green');
  });
  test('la fructosa declarada manda sobre los ingredientes', () => {
    assert.equal(veredicto('agua', 'malabsorcion', { fructose100g: 0.5 }), 'green');
    assert.equal(veredicto('agua', 'malabsorcion', { fructose100g: 2 }), 'yellow');
    assert.equal(veredicto('agua', 'malabsorcion', { fructose100g: 4 }), 'red');
  });
  test('sin ingredientes ni azúcares: faltan datos', () => {
    assert.equal(veredicto(''), 'unknown');
  });
  test('sin ingredientes pero con muchos azúcares: con moderación', () => {
    assert.equal(veredicto('', 'malabsorcion', { sugars100g: 30 }), 'yellow');
  });
  test('FODMAP añade fructanos (cebolla en primer lugar)', () => {
    const res = analyze({ ingredients: 'cebolla, aceite, sal' }, 'fodmap');
    assert.equal(res.fructans.level, 'red');
    assert.equal(analyze({ ingredients: 'cebolla, aceite, sal' }, 'malabsorcion').fructans, null);
  });
  test('el eritritol suele tolerarse: no pone rojo', () => {
    assert.equal(analyze({ ingredients: 'eritritol, cacao' }).polyols.level, 'green');
  });
});

describe('resaltado de ingredientes', () => {
  test('marca los tramos detectados sobre el texto original con tildes', () => {
    const texto = 'Azúcar, jarabe de glucosa-fructosa, sal';
    const spans = highlightSpans(texto, detect(texto).hits);
    const marcados = spans.map((s) => texto.slice(s.start, s.end));
    assert.ok(marcados.includes('Azúcar'));
    assert.ok(marcados.includes('jarabe de glucosa-fructosa'));
  });
});

describe('limpieza del OCR', () => {
  test('recorta desde "Ingredientes" hasta la información nutricional', () => {
    const t = cleanOcrText('MARCA X\nIngredientes: azúcar, harina de tri-\ngo, sal. Información nutricional por 100 g');
    assert.equal(t, 'azúcar, harina de trigo, sal.');
  });
  test('encuentra los azúcares por 100 g', () => {
    assert.equal(findSugars('Hidratos 60 g de los cuales azúcares 12,5 g'), 12.5);
    assert.equal(findSugars('sin datos'), null);
  });
});

describe('alimentos frescos', () => {
  test('la miel tiene mucha fructosa y la naranja poca', () => {
    assert.equal(searchFoods('miel')[0].fru, 'red');
    assert.equal(searchFoods('naranja')[0].fru, 'green');
  });
  test('busca sin tildes y por alias', () => {
    assert.equal(searchFoods('platano')[0].name, 'Plátano');
    assert.equal(searchFoods('banana')[0].name, 'Plátano');
  });
  test('exceso de fructosa sobre glucosa', () => {
    // manzana: 3,5 g más de fructosa que de glucosa y más de 3 g de fructosa → mucha
    assert.deepEqual(foodLevel(5.9, 2.4, 1), { fru: 'red', pol: 'yellow', excess: 3.5 });
  });
});

describe('códigos de barras', () => {
  test('valida el dígito de control', () => {
    assert.equal(isValidEAN('3017620422003'), true);
    assert.equal(isValidEAN('3017620422004'), false);
    assert.equal(isValidEAN('8480000000001'), false);
  });
  test('limpia espacios y detecta códigos al peso', () => {
    assert.equal(cleanCode('3 017620 422003'), '3017620422003');
    assert.equal(isInStoreCode('2000000000008'), true);
  });
});
