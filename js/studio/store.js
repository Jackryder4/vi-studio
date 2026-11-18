/* store.js — IndexedDB persistence (samples, projects, custom instruments) with in-memory fallback */
(function () {
  'use strict';
  const VMI = window.VMI;
  const S = (VMI.store = {});
  const mem = { samples: new Map(), projects: new Map(), instruments: new Map() };
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve) => {
      try {
        const r = indexedDB.open('vmi-studio', 1);
        r.onupgradeneeded = () => { ['samples', 'projects', 'instruments'].forEach((n) => r.result.createObjectStore(n, { keyPath: 'id' })); };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => resolve(null);
        r.onblocked = () => resolve(null);
      } catch (e) { resolve(null); }
    });
    return dbp;
  }
  function req(store, mode, fn) {
    return open().then((db) => new Promise((resolve) => {
      if (!db) return resolve(fn(null));
      try {
        const q = fn(db.transaction(store, mode).objectStore(store));
        if (!q || !('onsuccess' in q)) return resolve(q);
        q.onsuccess = () => resolve(q.result);
        q.onerror = () => resolve(undefined);
      } catch (e) { resolve(undefined); }
    }));
  }
  S.put = (store, obj) => req(store, 'readwrite', (s) => { if (!s) { mem[store].set(obj.id, obj); return; } return s.put(obj); });
  S.get = (store, id) => req(store, 'readonly', (s) => (s ? s.get(id) : mem[store].get(id)));
  S.all = (store) => req(store, 'readonly', (s) => (s ? s.getAll() : Array.from(mem[store].values()))).then((r) => r || []);
  S.del = (store, id) => req(store, 'readwrite', (s) => { if (!s) { mem[store].delete(id); return; } return s.delete(id); });
})();
