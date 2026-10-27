import type { Store } from '../domain/types';

type StorageBackend = 'IndexedDB' | 'localStorage';
type LoadResult = { store: Store; backend: StorageBackend };
type SaveResult = { backend: StorageBackend };

const DATABASE_NAME = 'decision-ledger';
const DATABASE_VERSION = 1;
const OBJECT_STORE = 'workspace';
const CURRENT_RECORD_ID = 'current';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser context.'));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(OBJECT_STORE)) {
        database.createObjectStore(OBJECT_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local database.'));
    request.onblocked = () => reject(new Error('The local database upgrade is blocked by another tab.'));
  });
}

function readCurrentRecord(database: IDBDatabase): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(OBJECT_STORE, 'readonly');
    const request = transaction.objectStore(OBJECT_STORE).get(CURRENT_RECORD_ID);
    request.onsuccess = () => resolve(request.result?.data ?? null);
    request.onerror = () => reject(request.error || new Error('Could not read local workspace.'));
    transaction.onabort = () => reject(transaction.error || new Error('Reading local workspace was aborted.'));
  });
}

function writeCurrentRecord(database: IDBDatabase, store: Store): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(OBJECT_STORE, 'readwrite');
    transaction.objectStore(OBJECT_STORE).put({
      id: CURRENT_RECORD_ID,
      data: store,
      updatedAt: new Date().toISOString(),
    });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not save local workspace.'));
    transaction.onabort = () => reject(transaction.error || new Error('Saving local workspace was aborted.'));
  });
}

function isStore(value: unknown): value is Store {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Store>;
  return Array.isArray(candidate.decisions) && Array.isArray(candidate.projects);
}

function readLegacySafely(readLegacyStore: () => Store): Store {
  try {
    const store = readLegacyStore();
    return isStore(store) ? store : { decisions: [], projects: ['General'] };
  } catch {
    return { decisions: [], projects: ['General'] };
  }
}

function mirrorToLocalStorage(store: Store, legacyKey: string) {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(legacyKey, JSON.stringify(store));
    }
  } catch {
    // IndexedDB remains authoritative if the compatibility mirror is blocked or full.
  }
}

export async function loadWorkspaceStore(
  readLegacyStore: () => Store,
  legacyKey: string
): Promise<LoadResult> {
  const legacyStore = () => readLegacySafely(readLegacyStore);
  let database: IDBDatabase | null = null;
  try {
    database = await openDatabase();
    const current = await readCurrentRecord(database);
    if (isStore(current)) {
      mirrorToLocalStorage(current, legacyKey);
      return { store: current, backend: 'IndexedDB' };
    }
    const migrated = legacyStore();
    await writeCurrentRecord(database, migrated);
    mirrorToLocalStorage(migrated, legacyKey);
    return { store: migrated, backend: 'IndexedDB' };
  } catch {
    return { store: legacyStore(), backend: 'localStorage' };
  } finally {
    database?.close();
  }
}

export async function saveWorkspaceStore(store: Store, legacyKey: string): Promise<SaveResult> {
  let database: IDBDatabase | null = null;
  try {
    database = await openDatabase();
    await writeCurrentRecord(database, store);
    mirrorToLocalStorage(store, legacyKey);
    return { backend: 'IndexedDB' };
  } catch (indexedDbError) {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(legacyKey, JSON.stringify(store));
        return { backend: 'localStorage' };
      }
    } catch {
      // Both available local persistence methods failed.
    }
    throw indexedDbError instanceof Error
      ? indexedDbError
      : new Error('Could not save data to IndexedDB or localStorage.');
  } finally {
    database?.close();
  }
}
