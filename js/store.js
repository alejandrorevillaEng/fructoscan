// Almacenamiento local en el móvil (IndexedDB). Es el único sitio donde se guardan tus datos.
// - products: caché de productos de Open Food Facts (clave: ean)
// - items:    la base personal del usuario (clave: id) -> "Vistos últimamente" + "Mi base"
// - kv:       ajustes (perfil, avisos vistos, etc.)
const DB = 'fructoscan';
const OLD_ACCOUNT_DB = /^fructoscan-u-[a-f0-9-]+$/i;   // bases de la época de las cuentas (hasta la 0.8)
const DB_VERSION = 1;
let dbp;

function openDb(name) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      d.createObjectStore('products', { keyPath: 'ean' });
      const items = d.createObjectStore('items', { keyPath: 'id' });
      items.createIndex('lastSeen', 'lastSeen');
      items.createIndex('ean', 'ean');
      d.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const db = () => (dbp ??= openDb(DB));

function tx(store, mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => resolve(out && 'result' in out ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}
const readAll = (d, name) => new Promise((res) => {
  const q = d.transaction(name).objectStore(name).getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]);
});
const readKey = (d, key) => new Promise((res) => {
  const q = d.transaction('kv').objectStore('kv').get(key); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined);
});

export const store = {
  getProduct: (ean) => tx('products', 'readonly', (s) => s.get(ean)),
  putProduct: (p) => tx('products', 'readwrite', (s) => s.put(p)),

  getItem: (id) => tx('items', 'readonly', (s) => s.get(id)),
  putItem: (it) => tx('items', 'readwrite', (s) => s.put(it)),
  deleteItem: (id) => tx('items', 'readwrite', (s) => s.delete(id)),
  allItems: () => tx('items', 'readonly', (s) => s.getAll()),
  async recent(limit = 20) {
    const all = await this.allItems();
    return all.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen)).slice(0, limit);
  },

  get: (k) => tx('kv', 'readonly', (s) => s.get(k)),
  set: (k, v) => tx('kv', 'readwrite', (s) => s.put(v, k)),

  async clearAll() {
    await tx('items', 'readwrite', (s) => s.clear());
    await tx('products', 'readwrite', (s) => s.clear());
    await tx('kv', 'readwrite', (s) => s.clear());
  },

  // Quien usó la app con cuenta tenía sus productos en otra base del móvil. Se pasan a la única base
  // (sin pisar lo que ya haya, gana lo más reciente) y se borra la antigua. Devuelve cuántos se recuperaron.
  async migrateOldAccounts(merge) {
    const dbs = (await indexedDB.databases?.().catch(() => [])) || [];
    let moved = 0;
    for (const { name } of dbs.filter((x) => OLD_ACCOUNT_DB.test(x.name || ''))) {
      const old = await openDb(name).catch(() => null);
      if (!old) continue;
      const items = await readAll(old, 'items');
      const profile = await readKey(old, 'profile');
      old.close();
      for (const it of items) {
        const { dirty, ...clean } = it;
        await this.putItem(merge(await this.getItem(it.id), clean));
        moved++;
      }
      if (profile && !(await this.get('profile'))) await this.set('profile', profile);
      if (items.length || profile) await this.set('onboarded', true);
      await new Promise((r) => { const q = indexedDB.deleteDatabase(name); q.onsuccess = q.onerror = q.onblocked = () => r(); });
    }
    // Sesión guardada por el cliente de Supabase: ya no se usa
    try { Object.keys(localStorage).filter((k) => k.startsWith('sb-')).forEach((k) => localStorage.removeItem(k)); } catch { /* sin acceso */ }
    return moved;
  },
};
