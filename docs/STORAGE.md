# Local persistence and schema migration

## Current implementation

- IndexedDB database: `decision-ledger`, schema version 2.
- Legacy aggregate store: `workspace`, key `current`.
- Normalized stores: `projects`, `decisions`, `alternatives`, `assumptions`, `killCriteria`, `signals`, `commitments`, `relations`, `reviews`, `assumptionReviews`, and `decisionVersions`.
- Schema marker store: `workspaceMeta`; marker key `normalized-workspace-v1`.
- Pre-normalization snapshot store: `legacySnapshots`; first snapshot key `aggregate-before-normalization-v1`.
- localStorage compatibility key: `decision-assumption-tracker-v1`.

The interface continues using the legacy aggregate model. On a normalized read, the storage adapter validates records and hydrates the aggregate shape. On save, it maps the aggregate back into normalized entities in a single read/write transaction while preserving project IDs, relations, reviews and referenced tombstones.

## Migration guarantees

The first schema-v2 load creates normalized records and stores the original aggregate in the snapshot table within the same transaction that writes the normalized tables and migration marker. If relationship validation fails, the transaction aborts; it does not partially commit the normalized stores. The old aggregate and localStorage mirror remain available for recovery/fallback.

Routine saves update the normalized entities, migration marker, and aggregate compatibility copy atomically. The first pre-normalization snapshot is not replaced by routine saves. Review and assumption-review history that the old format never captured cannot be reconstructed; see [DOMAIN_MODEL.md](DOMAIN_MODEL.md).

## Recovery and fallback

- If IndexedDB is unavailable or blocked by another open tab, the app falls back to localStorage and shows a backup warning.
- If a normalized read reports structural relationship errors, the adapter attempts recovery from the retained aggregate copy and emits a notice. A populated retained aggregate is preferred over a potentially stale localStorage mirror; localStorage is used when the retained aggregate is absent or empty.
- If the normalized migration fails before data can be safely loaded, the adapter keeps the retained aggregate as the preferred recovery source and enters browser-storage fallback mode when possible.
- If both persistence methods fail, the UI shows a save error. Export a JSON backup before clearing browser data.
- Do not clear localStorage or the legacy aggregate as part of normalization.
- The deployment being ready does not mean that every device has migrated; the local migration runs on the next successful app open on that device.

## Scope and limits

This is browser-local persistence, not cloud sync. IndexedDB and localStorage are scoped to the browser profile and origin; they do not automatically transfer across devices. Export JSON before clearing site data, changing browsers, or switching devices.
