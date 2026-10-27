# Roadmap

## Phase 0 — Working local-first product

- [x] Quick and deep capture, alternatives, assumptions, signals, kill criteria, commitments, and scenario estimates.
- [x] Reviews, outcomes, lessons, calibration/portfolio views, and urgency indicators.
- [x] JSON backup and Markdown/PDF reporting.
- [x] Service-worker app-shell caching.
- [x] IndexedDB persistence with legacy localStorage migration and fallback.
- [x] Extract shared domain types and risk/urgency calculations from the React component.
- [x] Establish source repository and CI baseline.

## Phase 1 — Domain correctness and normalization

- [ ] First-class Project records with UUIDs, descriptions, status, and timestamps.
- [ ] Explicit projectId, parentDecisionId, and foreign keys for all child entities.
- [ ] Pure, versioned adapters between the current aggregate payload and normalized workspace.
- [ ] First-class review history and AssumptionReview verdict records.
- [ ] Validation for foreign keys, enums, dates, scenario probabilities, required fields, and duplicate project names.
- [ ] Transactional migrations with rollback/recovery tests.
- [ ] Import/export round-trip and legacy migration tests.

## Phase 2 — UI and workflow hardening

- [ ] Split the large React component into capture, decision detail, review, portfolio, comparison, and export modules.
- [ ] Measure the fast-capture path against the 30–40 second target on mobile.
- [ ] Add loading, empty, error, and degraded-storage states.
- [ ] Add browser E2E tests for CRUD, review, export, restore, migration, and offline startup.
- [ ] Add accessibility and mobile regression checks.
- [ ] Test IndexedDB quota, blocked upgrades, malformed data, and unavailable storage.

## Phase 3 — Optional evolution

- [ ] Design privacy and conflict handling before adding sync or accounts.
- [ ] Consider SQLite/WASM only if measured dataset size or query costs justify it.
- [ ] Consider native packaging only after the PWA interaction and storage model are stable.
- [ ] Keep JSON export readable and document breaking schema migrations.

## Exit criteria

- No data loss during tested migrations.
- Domain calculations and validation have deterministic unit tests.
- Typecheck, tests, build, and browser acceptance tests pass.
- Fast capture is empirically at or below target on a representative mobile device.
- JSON restore is validated as well as export.
