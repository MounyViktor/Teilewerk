// Lokaler Speicher (IndexedDB). Beträge immer in Cent.
//
// Unveränderbarkeit: IndexedDB kennt keine Trigger. Deshalb geht jeder Schreibzugriff über die
// Funktionen in dieser Datei: `invoices` und `audit` können nur ergänzt, nie geändert oder gelöscht werden.
// Das schützt innerhalb der App, nicht gegen das Löschen der App oder ihrer Website-Daten.

const DB_NAME = "teilewerk";
const DB_VERSION = 3;

export type StoreName =
  | "settings" | "parts" | "photos" | "photo_data" | "sales" | "invoices" | "invoice_counter" | "audit" | "meta" | "attachments" | "expenses" | "contracts";

const APPEND_ONLY: ReadonlySet<StoreName> = new Set<StoreName>(["invoices", "audit"]);

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = (e) => {
      const db = r.result;
      // Vorhandene Daten bleiben erhalten: Jede Stufe ergänzt nur, was in der alten Version noch fehlt.
      if (e.oldVersion < 1) {
        db.createObjectStore("settings");
        db.createObjectStore("parts", { keyPath: "id", autoIncrement: true });
        db.createObjectStore("photos", { keyPath: "id", autoIncrement: true }).createIndex("part_id", "part_id");
        db.createObjectStore("photo_data", { keyPath: "id" });
        db.createObjectStore("sales", { keyPath: "id", autoIncrement: true });
        const inv = db.createObjectStore("invoices", { keyPath: "id", autoIncrement: true });
        inv.createIndex("number", "number", { unique: true });
        inv.createIndex("sale_id", "sale_id");
        db.createObjectStore("invoice_counter", { keyPath: "year" });
        db.createObjectStore("audit", { keyPath: "id", autoIncrement: true });
        db.createObjectStore("meta");
      }
      if (e.oldVersion < 2) {
        db.createObjectStore("attachments", { keyPath: "id", autoIncrement: true }).createIndex("owner", "owner");
      }
      if (e.oldVersion < 3) {
        db.createObjectStore("expenses", { keyPath: "id", autoIncrement: true });
        db.createObjectStore("contracts", { keyPath: "id", autoIncrement: true });
      }
    };
    r.onsuccess = () => {
      const db = r.result;
      // Eine neuere App-Version in einem anderen Fenster darf die Datenbank aktualisieren.
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    r.onerror = () => reject(r.error);
  });
  return dbPromise;
}

export function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** Schreib-Sicht auf eine Transaktion. Ändern und Löschen sind für die Archiv-Tabellen gesperrt. */
export class Tx {
  constructor(private t: IDBTransaction) {}
  get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> { return req(this.t.objectStore(store).get(key)); }
  all<T>(store: StoreName): Promise<T[]> { return req(this.t.objectStore(store).getAll()); }
  /** Neuer Datensatz. Ein vorhandener Schlüssel führt zum Fehler und damit zum Abbruch der Transaktion. */
  add<T extends object>(store: StoreName, value: T, key?: IDBValidKey): Promise<IDBValidKey> {
    return req(this.t.objectStore(store).add(value, key));
  }
  put<T extends object>(store: StoreName, value: T, key?: IDBValidKey): Promise<IDBValidKey> {
    if (APPEND_ONLY.has(store)) throw new Error(`GoBD: Ändern auf ${store} ist nicht erlaubt (unveränderbares Archiv)`);
    return req(this.t.objectStore(store).put(value, key));
  }
  delete(store: StoreName, key: IDBValidKey): Promise<undefined> {
    if (APPEND_ONLY.has(store)) throw new Error(`GoBD: Löschen auf ${store} ist nicht erlaubt (unveränderbares Archiv)`);
    return req(this.t.objectStore(store).delete(key));
  }
  byIndex<T>(store: StoreName, index: string, key: IDBValidKey): Promise<T[]> {
    return req(this.t.objectStore(store).index(index).getAll(key));
  }
  async audit(action: string, entity: string, entity_id: number | null, details: Record<string, unknown> = {}) {
    await this.add("audit", { at: new Date().toISOString(), action, entity, entity_id, details });
  }
}

/** Alles oder nichts: Wirft `fn` einen Fehler, wird die ganze Transaktion verworfen. */
export async function tx<T>(stores: StoreName[], mode: IDBTransactionMode, fn: (t: Tx) => Promise<T>): Promise<T> {
  const db = await openDb();
  const t = db.transaction(stores, mode);
  const done = new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onabort = () => reject(t.error ?? new Error("Speichern abgebrochen."));
    t.onerror = () => reject(t.error);
  });
  let result: T;
  try {
    result = await fn(new Tx(t));
  } catch (e) {
    try { t.abort(); } catch { /* bereits beendet */ }
    await done.catch(() => undefined);
    throw e;
  }
  await done;
  return result;
}

export const all = <T>(store: StoreName) => tx([store], "readonly", (t) => t.all<T>(store));
export const get = <T>(store: StoreName, key: IDBValidKey) => tx([store], "readonly", (t) => t.get<T>(store, key));
export const byIndex = <T>(store: StoreName, index: string, key: IDBValidKey) =>
  tx([store], "readonly", (t) => t.byIndex<T>(store, index, key));

/** Nur für Tests: Verbindung schließen und Datenbank verwerfen. */
export async function resetForTests() {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
  await new Promise<void>((resolve, reject) => {
    const r = indexedDB.deleteDatabase(DB_NAME);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}
