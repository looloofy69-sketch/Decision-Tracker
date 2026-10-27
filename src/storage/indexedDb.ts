import type { Store } from '../domain/types';
import {
  hydrateStore, normalizeStore, NORMALIZED_SCHEMA_VERSION, validateNormalizedWorkspace,
  type NormalizedWorkspace, type NormalizationReport,
} from '../domain/normalize';

type StorageBackend = 'IndexedDB' | 'localStorage';
type LoadResult = { store: Store; backend: StorageBackend; notice?: string };
type SaveResult = { backend: StorageBackend; warnings?: string[] };
const DATABASE_NAME = 'decision-ledger';
const DATABASE_VERSION = 2;
const LEGACY_STORE = 'workspace';
const CURRENT_RECORD_ID = 'current';
const META_STORE = 'workspaceMeta';
const MARKER_ID = 'normalized-workspace-v1';
const SNAPSHOT_STORE = 'legacySnapshots';
const SNAPSHOT_ID = 'aggregate-before-normalization-v1';
const ENTITY_STORES = [
  'projects', 'decisions', 'alternatives', 'assumptions', 'killCriteria',
  'signals', 'commitments', 'relations', 'reviews', 'assumptionReviews', 'decisionVersions',
] as const;
type EntityStoreName = typeof ENTITY_STORES[number];
type Row = { id: string; [key: string]: unknown };
type Meta = { id: string; schemaVersion: number; migratedAt: string; updatedAt: string; recordCounts: Record<string, number>; warningCount: number };
type Snapshot = { id: string; sourceSchemaVersion: number; createdAt: string; data: Store };

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB is unavailable.')); return; }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LEGACY_STORE)) db.createObjectStore(LEGACY_STORE, { keyPath: 'id' });
      for (const name of ENTITY_STORES) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open the local database.'));
    request.onblocked = () => reject(new Error('Database upgrade is blocked by another open tab.'));
  });
}
function isStore(value: unknown): value is Store {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Store>;
  return Array.isArray(candidate.decisions) && Array.isArray(candidate.projects);
}
function readLegacySafely(read: () => Store): Store {
  try { const store = read(); return isStore(store) ? store : { decisions: [], projects: ['General'] }; }
  catch { return { decisions: [], projects: ['General'] }; }
}
function hasUserData(store: Store): boolean {
  return store.decisions.length > 0 || store.projects.some(project => project !== 'General');
}

export function chooseRecoverySource(aggregate: unknown, local: Store): Store {
  if (isStore(aggregate) && hasUserData(aggregate)) return aggregate;
  if (hasUserData(local)) return local;
  if (isStore(aggregate)) return aggregate;
  return local;
}
function mirrorToLocalStorage(store: Store, key: string) {
  try { if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(store)); }
  catch { /* IndexedDB remains authoritative if the compatibility mirror is unavailable. */ }
}
function readCurrentRecord(db: IDBDatabase): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LEGACY_STORE, 'readonly');
    const request = tx.objectStore(LEGACY_STORE).get(CURRENT_RECORD_ID);
    request.onsuccess = () => resolve(request.result?.data ?? null);
    request.onerror = () => reject(request.error || new Error('Could not read legacy workspace copy.'));
    tx.onabort = () => reject(tx.error || new Error('Legacy workspace read was aborted.'));
  });
}

type WorkspaceRead = { marker: Meta | null; workspace: NormalizedWorkspace | null; report: NormalizationReport | null };
function readNormalizedWorkspace(db: IDBDatabase): Promise<WorkspaceRead> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([...ENTITY_STORES, META_STORE], 'readonly');
    const found: Record<string, unknown[]> = {};
    let marker: Meta | null = null;
    let failure: Error | null = null;
    let reads = 0;
    const expected = ENTITY_STORES.length + 1;
    for (const name of ENTITY_STORES) {
      const request = tx.objectStore(name).getAll();
      request.onsuccess = () => { found[name] = request.result as unknown[]; reads += 1; };
      request.onerror = () => { failure = request.error || new Error('Could not read ' + name); try { tx.abort(); } catch { /* ignore */ } };
    }
    const markerRequest = tx.objectStore(META_STORE).get(MARKER_ID);
    markerRequest.onsuccess = () => { marker = markerRequest.result || null; reads += 1; };
    markerRequest.onerror = () => { failure = markerRequest.error || new Error('Could not read workspace marker'); try { tx.abort(); } catch { /* ignore */ } };
    tx.oncomplete = () => {
      if (failure) { reject(failure); return; }
      if (reads !== expected || !marker) { resolve({ marker, workspace: null, report: null }); return; }
      const workspace = {
        schemaVersion: marker.schemaVersion as 1,
        projects: (found.projects || []) as NormalizedWorkspace['projects'],
        decisions: (found.decisions || []) as NormalizedWorkspace['decisions'],
        alternatives: (found.alternatives || []) as NormalizedWorkspace['alternatives'],
        assumptions: (found.assumptions || []) as NormalizedWorkspace['assumptions'],
        killCriteria: (found.killCriteria || []) as NormalizedWorkspace['killCriteria'],
        signals: (found.signals || []) as NormalizedWorkspace['signals'],
        commitments: (found.commitments || []) as NormalizedWorkspace['commitments'],
        relations: (found.relations || []) as NormalizedWorkspace['relations'],
        reviews: (found.reviews || []) as NormalizedWorkspace['reviews'],
        assumptionReviews: (found.assumptionReviews || []) as NormalizedWorkspace['assumptionReviews'],
        decisionVersions: (found.decisionVersions || []) as NormalizedWorkspace['decisionVersions'],
      } satisfies NormalizedWorkspace;
      resolve({ marker, workspace, report: validateNormalizedWorkspace(workspace) });
    };
    tx.onerror = () => reject(failure || tx.error || new Error('Could not read normalized workspace.'));
    tx.onabort = () => reject(failure || tx.error || new Error('Normalized workspace read was aborted.'));
  });
}
function entityRows(workspace: NormalizedWorkspace): Record<EntityStoreName, Row[]> {
  return {
    projects: workspace.projects as unknown as Row[],
    decisions: workspace.decisions as unknown as Row[],
    alternatives: workspace.alternatives as unknown as Row[],
    assumptions: workspace.assumptions as unknown as Row[],
    killCriteria: workspace.killCriteria as unknown as Row[],
    signals: workspace.signals as unknown as Row[],
    commitments: workspace.commitments as unknown as Row[],
    relations: workspace.relations as unknown as Row[],
    reviews: workspace.reviews as unknown as Row[],
    assumptionReviews: workspace.assumptionReviews as unknown as Row[],
    decisionVersions: workspace.decisionVersions as unknown as Row[],
  };
}
function priorFromRows(rows: Record<string, unknown[]>, marker: Meta | null): NormalizedWorkspace | undefined {
  if (!marker || marker.schemaVersion !== NORMALIZED_SCHEMA_VERSION) return undefined;
  return {
    schemaVersion: NORMALIZED_SCHEMA_VERSION,
    projects: (rows.projects || []) as NormalizedWorkspace['projects'],
    decisions: (rows.decisions || []) as NormalizedWorkspace['decisions'],
    alternatives: (rows.alternatives || []) as NormalizedWorkspace['alternatives'],
    assumptions: (rows.assumptions || []) as NormalizedWorkspace['assumptions'],
    killCriteria: (rows.killCriteria || []) as NormalizedWorkspace['killCriteria'],
    signals: (rows.signals || []) as NormalizedWorkspace['signals'],
    commitments: (rows.commitments || []) as NormalizedWorkspace['commitments'],
    relations: (rows.relations || []) as NormalizedWorkspace['relations'],
    reviews: (rows.reviews || []) as NormalizedWorkspace['reviews'],
    assumptionReviews: (rows.assumptionReviews || []) as NormalizedWorkspace['assumptionReviews'],
    decisionVersions: (rows.decisionVersions || []) as NormalizedWorkspace['decisionVersions'],
  };
}
function persistNormalizedStore(db: IDBDatabase, store: Store): Promise<NormalizationReport> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([...ENTITY_STORES, META_STORE, LEGACY_STORE, SNAPSHOT_STORE], 'readwrite');
    const found: Record<string, unknown[]> = {};
    let marker: Meta | null = null;
    let oldAggregate: { id: string; data?: unknown } | null = null;
    let oldSnapshot: Snapshot | null = null;
    let reads = 0;
    const expected = ENTITY_STORES.length + 3;
    let failure: Error | null = null;
    let report: NormalizationReport | null = null;
    let wrote = false;

    const afterRead = () => {
      reads += 1;
      if (reads !== expected || wrote || failure) return;
      wrote = true;
      const prior = priorFromRows(found, marker);
      const priorReport = prior ? validateNormalizedWorkspace(prior) : null;
      const usablePrior = prior && priorReport?.errors.length === 0 ? prior : undefined;
      const now = new Date().toISOString();
      const next = normalizeStore(store, usablePrior, { now });
      report = validateNormalizedWorkspace(next);
      if (report.errors.length) {
        failure = new Error('Normalized workspace validation failed: ' + report.errors.join(' '));
        try { tx.abort(); } catch { /* onabort rejects */ }
        return;
      }
      if (!oldSnapshot) {
        const snapshot: Snapshot = {
          id: SNAPSHOT_ID,
          sourceSchemaVersion: 1,
          createdAt: now,
          data: isStore(oldAggregate?.data) ? oldAggregate.data : store,
        };
        tx.objectStore(SNAPSHOT_STORE).put(snapshot);
      }
      const rowsByTable = entityRows(next);
      for (const name of ENTITY_STORES) {
        const table = tx.objectStore(name);
        table.clear();
        rowsByTable[name].forEach(row => table.put(row));
      }
      tx.objectStore(META_STORE).put({
        id: MARKER_ID, schemaVersion: NORMALIZED_SCHEMA_VERSION,
        migratedAt: marker?.migratedAt || now, updatedAt: now,
        recordCounts: Object.fromEntries(ENTITY_STORES.map(name => [name, rowsByTable[name].length])),
        warningCount: report.warnings.length,
      } satisfies Meta);
      tx.objectStore(LEGACY_STORE).put({ id: CURRENT_RECORD_ID, data: store, updatedAt: now, format: 'aggregate-compatibility-mirror' });
    };

    const read = <T,>(request: IDBRequest<T>, key: string, kind: 'rows' | 'marker' | 'aggregate' | 'snapshot') => {
      request.onsuccess = () => {
        if (kind === 'rows') found[key] = request.result as unknown[];
        if (kind === 'marker') marker = (request.result as Meta | undefined) || null;
        if (kind === 'aggregate') oldAggregate = (request.result as typeof oldAggregate) || null;
        if (kind === 'snapshot') oldSnapshot = (request.result as Snapshot | undefined) || null;
        afterRead();
      };
      request.onerror = () => { failure = request.error || new Error('Could not prepare normalized migration.'); try { tx.abort(); } catch { /* ignore */ } };
    };
    for (const name of ENTITY_STORES) read(tx.objectStore(name).getAll(), name, 'rows');
    read(tx.objectStore(META_STORE).get(MARKER_ID), 'marker', 'marker');
    read(tx.objectStore(LEGACY_STORE).get(CURRENT_RECORD_ID), 'aggregate', 'aggregate');
    read(tx.objectStore(SNAPSHOT_STORE).get(SNAPSHOT_ID), 'snapshot', 'snapshot');
    tx.oncomplete = () => report ? resolve(report) : reject(new Error('Normalized transaction completed without a validation report.'));
    tx.onerror = () => reject(failure || tx.error || new Error('Could not commit normalized workspace.'));
    tx.onabort = () => reject(failure || tx.error || new Error('Normalized transaction aborted.'));
  });
}

export async function loadWorkspaceStore(readLocalStore: () => Store, legacyKey: string): Promise<LoadResult> {
  const localCopy = () => readLegacySafely(readLocalStore);
  let db: IDBDatabase | null = null;
  let lastAggregate: unknown = null;
  try {
    db = await openDatabase();
    const aggregate = await readCurrentRecord(db);
    lastAggregate = aggregate;
    const normalized = await readNormalizedWorkspace(db);
    if (normalized.marker && normalized.workspace && normalized.report?.errors.length === 0) {
      const store = hydrateStore(normalized.workspace);
      mirrorToLocalStorage(store, legacyKey);
      const notice = normalized.report.warnings.length
        ? 'Older values were preserved but need review: ' + normalized.report.warnings.slice(0, 3).join(' ')
        : undefined;
      return { store, backend: 'IndexedDB', notice };
    }
    if (normalized.marker && normalized.report?.errors.length) {
      const local = localCopy();
      const source = chooseRecoverySource(aggregate, local);
      const report = await persistNormalizedStore(db, source);
      mirrorToLocalStorage(source, legacyKey);
      return {
        store: source, backend: 'IndexedDB',
        notice: 'The normalized workspace was repaired from the retained aggregate copy. ' +
          (report.warnings.length ? report.warnings.slice(0, 3).join(' ') : 'Export a JSON backup before clearing site data.'),
      };
    }
    const source = isStore(aggregate) ? aggregate : localCopy();
    const report = await persistNormalizedStore(db, source);
    mirrorToLocalStorage(source, legacyKey);
    const notice = report.warnings.length
      ? 'Existing records were migrated with a recoverable snapshot. Review: ' + report.warnings.slice(0, 3).join(' ')
      : undefined;
    return { store: source, backend: 'IndexedDB', notice };
  } catch {
    const local = localCopy();
    const aggregateIsUsable = isStore(lastAggregate) && hasUserData(lastAggregate);
    return {
      store: chooseRecoverySource(lastAggregate, local),
      backend: 'localStorage',
      notice: aggregateIsUsable
        ? 'The normalized migration could not finish. Your retained aggregate copy is loaded in browser-storage fallback mode; export a JSON backup before continuing.'
        : 'IndexedDB could not be read. The browser-storage copy is loaded as a fallback; export a JSON backup before clearing site data.',
    };
  } finally {
    db?.close();
  }
}
export async function saveWorkspaceStore(store: Store, legacyKey: string): Promise<SaveResult> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDatabase();
    const report = await persistNormalizedStore(db, store);
    mirrorToLocalStorage(store, legacyKey);
    return { backend: 'IndexedDB', warnings: report.warnings };
  } catch (error) {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(legacyKey, JSON.stringify(store));
        return { backend: 'localStorage' };
      }
    } catch { /* Both local persistence paths failed. */ }
    throw error instanceof Error ? error : new Error('Could not save to IndexedDB or localStorage.');
  } finally {
    db?.close();
  }
}
