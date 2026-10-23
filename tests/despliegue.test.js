// Tests de la configuración que se publica: cabeceras de seguridad (_headers) y archivos del modo sin conexión (sw.js).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const raiz = new URL('../', import.meta.url);
const leer = (f) => readFileSync(new URL(f, raiz), 'utf8');

// Cabeceras que Cloudflare Pages aplica a todas las páginas (bloque "/*")
function cabecerasGlobales() {
  const bloque = leer('_headers').split(/\r?\n(?=\S)/).find((b) => b.startsWith('/*'));
  return Object.fromEntries(bloque.split(/\r?\n/).slice(1).filter((l) => l.trim())
    .map((l) => { const i = l.indexOf(':'); return [l.slice(0, i).trim().toLowerCase(), l.slice(i + 1).trim()]; }));
}
const csp = () => Object.fromEntries(cabecerasGlobales()['content-security-policy'].split(';')
  .map((d) => d.trim().split(/\s+/)).filter((d) => d[0]).map(([k, ...v]) => [k, v]));

describe('cabeceras de seguridad', () => {
  test('la CSP no permite scripts en línea ni eval', () => {
    const s = csp()['script-src'];
    assert.ok(!s.includes("'unsafe-inline'") && !s.includes("'unsafe-eval'"), s.join(' '));
    assert.deepEqual(csp()['object-src'], ["'none'"]);
    assert.deepEqual(csp()['frame-ancestors'], ["'none'"]);
    assert.deepEqual(csp()['base-uri'], ["'none'"]);
  });

  test('la app solo habla con Open Food Facts y el CIMA', () => {
    assert.deepEqual(csp()['connect-src'], ["'self'", 'https://world.openfoodfacts.org', 'https://cima.aemps.es']);
  });

  test('HSTS de al menos un año', () => {
    const m = /max-age=(\d+)/.exec(cabecerasGlobales()['strict-transport-security'] || '');
    assert.ok(m && Number(m[1]) >= 31536000, `max-age actual: ${m?.[1]}`);
  });

  test('sin acceso a micrófono ni ubicación; la cámara solo para la propia web', () => {
    const p = cabecerasGlobales()['permissions-policy'];
    assert.match(p, /camera=\(self\)/); assert.match(p, /microphone=\(\)/); assert.match(p, /geolocation=\(\)/);
  });
});

describe('modo sin conexión', () => {
  test('todos los archivos que guarda el service worker existen', () => {
    const shell = [...leer('sw.js').match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    assert.ok(shell.length > 10);
    for (const f of shell) assert.ok(f === './' || existsSync(new URL(f, raiz)), `falta ${f}`);
  });

  test('todos los módulos de js/ que carga la app están en la lista', () => {
    const shell = leer('sw.js');
    const imports = [...leer('js/app.js').matchAll(/from '\.\/([a-z]+\.js)'/g)].map((m) => m[1]);
    for (const f of imports) assert.ok(shell.includes(`./js/${f}`), `${f} no se guarda para usarla sin conexión`);
  });
});
