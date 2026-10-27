# Testing and verification

## Local commands

```bash
npm install
npm run typecheck
npm test
npm run build
```

- `npm run typecheck` checks TypeScript source using the repository compiler settings.
- `npm test` runs domain tests, including normalization and risk/urgency behavior.
- `npm run build` creates the production Vite bundle.
- `tests/tests.json` contains the platform acceptance scenarios for capture, signals, urgency, reviews, exports, normalization, navigation and mobile/offline behavior.

## Normalization coverage

The domain tests cover aggregate-to-normalized round-tripping, project ID stability across saves, preservation of review/join records, decision/assumption tombstones, historical signals to removed assumptions, structural foreign keys, self-referential legacy links, and scenario-weight warnings.

The pre-normalization aggregate is retained in a separate IndexedDB snapshot. Migration does not discard existing record IDs. Historical assumption verdicts that were never captured by the legacy format cannot be reconstructed; any backfilled verdicts must be treated as inferred.

## Current verification status

The live deployment reports a ready status and no frontend or network errors. Those checks are not the same as a successful Vitest run, browser migration test, keyboard accessibility session, or real-device usability study. Do not report those as passed until run evidence is available.

## Release gate

Do not tag a release until typecheck, unit tests, and production build pass. A storage migration additionally requires a legacy-fixture round-trip, an idempotent second open, a backup snapshot check, and malformed/blocked migration tests. Review mobile and offline behavior on a real device before claiming the full workflow has passed.
