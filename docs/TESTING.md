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

- **GitHub Actions:** passed TypeScript type-check, 14 unit tests across three files (risk, normalization, storage recovery), and production build for commit `cb0acaf0b282fa5bd919cc9932384dac2d11cdec` in [run 40447638514](https://github.com/looloofy69-sketch/Decision-Tracker/actions/runs/40447638514).
- **AppDeploy snapshot:** reported `ready` with no frontend or network errors for snapshot `1793073269994`.
- **Not yet verified:** browser-driven migration with legacy fixtures, migration rollback under malformed/blocked data, keyboard accessibility, real-device navigation, offline restoration, and Quick Capture time on an actual mobile device.
- **Dependency advisories:** the CI install output reported 6 npm audit vulnerabilities (3 moderate, 1 high, 2 critical). A detailed `npm audit` has not yet been run, so affected packages and exploitability have not been assessed.
- **Production hotfix limitation:** the AppDeploy usage limit prevented pushing follow-up source-only type/self-link and recovery-precedence hardening into the live snapshot. The repository contains the corrected source and latest CI passed for it; the live app remains at snapshot `1793073269994` until a deployment can be completed.

Do not interpret the successful CI build as proof of real-device usability or a successful on-device data migration.

## Release gate

Do not tag a release until typecheck, unit tests, and production build pass. A storage migration additionally requires a legacy-fixture round-trip, an idempotent second open, a backup snapshot check, and malformed/blocked migration tests. Review mobile and offline behavior on a real device before claiming the full workflow has passed.
