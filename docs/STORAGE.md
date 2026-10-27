# Local persistence and migration

## Current implementation

- IndexedDB database: `decision-ledger`, schema version 1.
- Object store: `workspace`.
- Current key: `current`.
- Payload: the aggregate `Store` object, including decisions and project name strings.
- Compatibility key in localStorage: `decision-assumption-tracker-v1`.

On startup, the app opens IndexedDB. If a valid workspace record exists, it is authoritative and a best-effort localStorage mirror is refreshed. If no valid IndexedDB record exists, the app reads and normalizes the previous localStorage payload, writes it to IndexedDB, and retains the mirror. If IndexedDB is unavailable or errors, reads and writes fall back to localStorage.

## Guarantees and limitations

- This is local persistence, not cloud sync.
- Browser storage is scoped to the browser profile and origin; it does not automatically transfer across devices or browsers.
- The localStorage mirror may fail independently while IndexedDB still succeeds.
- If both persistence mechanisms fail, the UI should show a storage error and the user should export a backup as soon as possible.
- Clearing site data, uninstalling a browser, or losing a device can remove both copies. Exported JSON is the portable recovery path.
- The current IndexedDB schema stores an aggregate workspace. Normalized per-entity object stores and project IDs remain planned work.

## Safe migration requirements

Use a new IndexedDB version and an explicit migration function for schema changes. Test empty storage, current aggregate localStorage data, already-migrated IndexedDB data, and malformed payloads. Validate record counts and foreign keys before committing a normalized workspace. Never clear the legacy key until the user has a successful backup/export path.
