# Testing and verification

## Local commands

```bash
npm install
npm run typecheck
npm test
npm run build
```

- `npm run typecheck` checks the TypeScript source using the project compiler settings.
- `npm test` runs unit tests for domain calculations.
- `npm run build` creates the production Vite bundle.
- `tests/tests.json` holds acceptance scenarios for capture, signals, urgency, commitments, reviews, exports, migration, and mobile/offline behavior.

## Current coverage

Unit tests cover risk-score boundaries and urgency behavior for uncleared kill criteria, stale high-risk assumptions, and recent assumption-specific signals. This is a baseline, not comprehensive domain coverage.

Acceptance scenarios are defined in `tests/tests.json`; their presence does not prove that every interaction has been manually exercised. The latest deployed QA snapshot reported no frontend or network errors. Add reproducible browser E2E tests before treating migration, IndexedDB quota/error paths, or offline restoration as fully verified.

## Release gate

Do not tag a release until typecheck, unit tests, and production build pass. A storage migration additionally requires a verified backup/export and idempotent migration tests. Review mobile and offline behavior on a real device before claiming the full workflow has passed.
