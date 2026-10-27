# Roadmap

## Phase 0 — Working local-first product

- [x] Quick/deep capture, alternatives, assumptions, signals, kill criteria, commitments and scenario estimates.
- [x] Reviews, outcomes, lessons, calibration/portfolio views and urgency indicators.
- [x] JSON backup and Markdown/PDF reports.
- [x] Service-worker app-shell caching.
- [x] IndexedDB primary persistence with localStorage migration/fallback.
- [x] Extract shared domain types and risk/urgency calculations.
- [x] Initialize the source repository and CI workflow.

## Phase 0.5 — UX stabilization and review gate

- [x] Group navigation into Workspace, Risk & Attention, and Analysis & Learning.
- [x] Replace the crowded mobile navigation strip with a dismissible grouped menu.
- [x] Add sticky section links for long decision details.
- [x] Surface degraded-storage warnings and backup action.
- [x] Make urgency and time-horizon filters independent.
- [ ] Manually verify navigation on 320px and 375px devices.
- [ ] Keyboard-test menu open/close, focus order, anchor navigation, forms and dialogs.
- [ ] Measure Quick Capture against the 30–40 second target on a real mobile device.
- [ ] Record actual acceptance-suite results before declaring the UX gate fully passed.

## Phase 1 — Normalized domain and migration

- [x] Add first-class Project records with stable IDs, description, status, timestamps and order.
- [x] Store decisions with project foreign keys and an optional parent decision.
- [x] Normalize alternatives, assumptions, kill criteria, signals and commitments with explicit decision foreign keys.
- [x] Preserve multi-decision links in a dedicated relation store.
- [x] Add first-class review and assumption-review records.
- [x] Add schema-versioned IndexedDB stores and a transactional migration from the aggregate model.
- [x] Retain a pre-normalization aggregate snapshot and keep a compatibility aggregate for the UI.
- [x] Add structural foreign-key validation, scenario-weight warnings, and tombstones for referenced deleted records.
- [x] Add unit tests for round-trip mapping, stable IDs, review joins, tombstones, unresolved signals and invalid links.
- [x] Verify type-check, 14 unit tests across three files, and production build in GitHub Actions (run [40447638514](https://github.com/looloofy69-sketch/Decision-Tracker/actions/runs/40447638514), commit `cb0acaf0b282fa5bd919cc9932384dac2d11cdec`).
- [ ] Run a real browser migration test against representative legacy fixtures, including blocked-upgrade and malformed-data recovery.
- [ ] Validate import/restore before treating the JSON backup path as a complete recovery workflow.

The current UI still consumes an aggregate adapter by design. Do not remove that boundary until migration, data round-trip, and review-history semantics are verified.

## Phase 2 — UI/domain follow-through

- [ ] Make Project identity and status visible in project management without breaking existing project-name references.
- [ ] Surface review history and distinguish inferred legacy verdicts from observed review snapshots.
- [ ] Split the large React component into capture, decision detail, review, portfolio, comparison, and export modules.
- [ ] Add browser E2E tests for CRUD, migration, backup restore, exports, and offline startup.
- [ ] Run keyboard accessibility and real-device mobile regression checks.
- [ ] Test IndexedDB quota, blocked upgrades, malformed data, and unavailable storage.

## Phase 3 — Optional evolution

- [ ] Design privacy, identity, and conflict handling before adding sync or accounts.
- [ ] Consider SQLite/WASM only if measured dataset size or query cost justifies it.
- [ ] Consider native packaging after the PWA interaction and storage model are stable.
- [ ] Keep the JSON export readable and document every breaking schema migration.

## Exit criteria

- No data loss in tested legacy/schema migrations.
- Domain calculations and validation have deterministic unit tests.
- Type-check, unit tests, build, and browser acceptance checks pass.
- Quick Capture is measured at or below its target on a representative mobile device.
- JSON restore is validated as well as export.
