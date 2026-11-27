// Mince couche Promise au-dessus d'IndexedDB.

const DB_NAME = 'lifestyle';
const DB_VERSION = 1;
export const STORES = { days: 'date', exercises: 'id', templates: 'id', sessions: 'id' };

let dbPromise;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      for (const [name, keyPath] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Si une autre version de l'app ouvre la base, on libère la connexion.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Base de données bloquée par un autre onglet.'));
  });
  return dbPromise;
}

const asPromise = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const txDone = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction annulée'));
  });

export async function getAll(store) {
  const db = await openDB();
  return asPromise(db.transaction(store).objectStore(store).getAll());
}

export async function kvGet(key) {
  const db = await openDB();
  return asPromise(db.transaction('kv').objectStore('kv').get(key));
}

export async function kvSet(key, value) {
  const db = await openDB();
  const tx = db.transaction('kv', 'readwrite');
  tx.objectStore('kv').put(value, key);
  return txDone(tx);
}

export async function put(store, value) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  return txDone(tx);
}

export async function putMany(store, values) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  values.forEach((v) => os.put(v));
  return txDone(tx);
}

export async function del(store, key) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  return txDone(tx);
}

/** Remplace tout le contenu en une seule transaction (import). */
export async function replaceAll({ kv = {}, ...stores }) {
  const db = await openDB();
  const names = ['kv', ...Object.keys(STORES)];
  const tx = db.transaction(names, 'readwrite');
  for (const name of names) tx.objectStore(name).clear();
  for (const [k, v] of Object.entries(kv)) tx.objectStore('kv').put(v, k);
  for (const name of Object.keys(STORES)) {
    const os = tx.objectStore(name);
    (stores[name] || []).forEach((v) => os.put(v));
  }
  return txDone(tx);
}
