# Decision Tracker

A privacy-first, local-first progressive web app for recording decisions, exposing assumptions, tracking evidence, reviewing outcomes, and learning from calibration over time.

Live app: [Decision Ledger](https://decision-ledger-u2z1kx.v2.appdeploy.ai/).

This repository is being established from the deployed implementation. The current app uses IndexedDB as primary local persistence, migrates the previous localStorage payload when no IndexedDB record exists, and retains a best-effort compatibility mirror and fallback. This is local-only storage, not cloud sync.

## Architecture

- `src/domain/`: shared domain types, UUID generation, and side-effect-free risk/urgency calculations.
- `src/storage/`: browser persistence and legacy-store migration.
- `src/App.tsx`: current React interface; further feature-level decomposition and normalized entity storage remain roadmap items.
- `public/sw.js`: offline app-shell caching.
- `tests/tests.json`: deployed workflow acceptance scenarios.
- `docs/`: domain model, storage constraints, testing, and roadmap.
- `.github/workflows/ci.yml`: typecheck, unit tests, and production build.

## Local development

Requires Node.js 20+.

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

See [docs/ROADMAP.md](docs/ROADMAP.md) for the phased implementation plan and [docs/STORAGE.md](docs/STORAGE.md) for data protection guarantees.

## Important

Browser data does not automatically move to another device. Export JSON backups before clearing browser data or switching devices. License selection remains open; no license has been added.
