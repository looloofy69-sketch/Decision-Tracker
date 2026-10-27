# Decision Tracker

A privacy-first, local-first progressive web app for recording decisions, exposing assumptions, tracking evidence, reviewing outcomes, and learning from calibration over time.

## Product goals

- Capture an important decision in roughly 30–40 seconds using **Quick Capture**.
- Expand into **Deep Mode** only when alternatives, assumptions, scenario estimates, commitments, or kill criteria need detail.
- Keep the domain model independent from React and make risk/urgency calculations deterministic and testable.
- Work offline after the app shell is cached.
- Keep records on the user's device by default; no account, analytics, cloud sync, or remote database is required.
- Make data portable through readable JSON backups and Markdown/PDF reports.

## Current state

The deployed app is available at [Decision Ledger](https://decision-ledger-u2z1kx.v2.appdeploy.ai/).

This repository is being established from the deployed implementation. The live app currently persists the workspace in IndexedDB, migrates the previous `localStorage` payload when no IndexedDB record exists, and keeps a best-effort compatibility mirror in `localStorage`. When IndexedDB is unavailable, the app falls back to `localStorage`. This remains **local-only storage**, not multi-device sync.

## Architecture

- `src/domain/`: domain types and side-effect-free decision risk/urgency logic.
- `src/storage/`: browser persistence and legacy-store migration.
- `src/App.tsx`: React interface and user workflows. Further UI decomposition is planned.
- `public/sw.js`: cached app shell for offline launch.
- `tests/tests.json`: deployed workflow acceptance-test definitions.
- `docs/`: domain design, storage guarantees, testing, and roadmap.

## Run locally

Requires Node.js 20+ and npm.

```bash
npm install
npm run dev
```

Create a production build with:

```bash
npm run build
```

## Data protection

1. Export a JSON backup before clearing site data, changing browsers, or switching devices.
2. IndexedDB and localStorage are scoped to the browser profile and origin. They do not automatically follow the user to another device.
3. The localStorage mirror is a compatibility/fallback layer, not a substitute for exporting backups.
4. Do not add cloud sync, account identity, telemetry, or third-party analytics without an explicit product decision and a documented privacy model.

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) and the architectural decisions in [docs/adr](docs/adr/).

## License

License selection is an explicit project decision and has not yet been set.
