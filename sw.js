// Service worker: la app funciona sin conexión.
// - Interfaz: se guarda al instalar.
// - OCR (Tesseract + idioma): se guarda la primera vez que se usa.
// - Nunca se guardan aquí respuestas de Open Food Facts (eso lo gestiona la app en IndexedDB).
const VERSION = 'fructoscan-v0.11.0';
const SHELL = [
  './', './index.html', './css/app.css', './manifest.webmanifest',
  './js/app.js', './js/analyzer.js', './js/rules.js', './js/dom.js', './js/store.js', './js/off.js', './js/ean.js',
  './js/foods.js', './js/tips.js', './js/icons.js', './js/backup.js', './js/config.js', './js/meds.js', './js/insights.js', './js/scanner.js', './js/ocr.js',
  './vendor/zxing.js', './icons/logo.svg', './icons/icon-192.png', './icons/icon-512.png', './fonts/bricolage.woff2',
];
const LAZY = /\/(vendor\/tesseract\/|lang\/)/;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;   // APIs externas: directo a la red
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('./index.html')));
    return;
  }
  if (LAZY.test(url.pathname)) {
    // archivos grandes: primero caché, si no, red y se guarda
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    })));
    return;
  }
  // interfaz: red primero (para recibir actualizaciones), caché si no hay conexión
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request)));
});
