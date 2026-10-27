# Roadmap

## Phase 0 — Working local-first product

- [x] Quick and deep capture, alternatives, assumptions, signals, kill criteria, commitments, and scenario estimates.
- [x] Reviews, outcomes, lessons, calibration/portfolio views, and urgency indicators.
- [x] JSON backup and Markdown/PDF reporting.
- [x] Service-worker app-shell caching.
- [x] IndexedDB persistence with legacy localStorage migration and fallback.
- [x] Extract shared domain types and risk/urgency calculations from the React component.
- [x] Establish source repository and CI baseline.

## Phase 0.5 — UX stabilization and review gate (must precede domain normalization)

- [x] Group navigation into Workspace, Risk & Attention, and Analysis & Learning.
- [x] Replace the crowded small-screen horizontal navigation strip with an accessible, dismissible menu.
- [x] Add in-record jump navigation for long decision details.
- [x] Make project/record context clearer in the header.
- [x] Surface storage fallback/failure status with a direct backup action.
- [x] Correct the interaction where urgency-only filtering accidentally applied a time-horizon rule.
- [x] Add acceptance scenarios for mobile navigation, section jumps, and independent urgency/horizon filtering.
- [ ] Manually verify mobile navigation on a real device at 375px and 320px widths.
- [ ] Keyboard-test menu open/close, focus visibility, anchor navigation, forms, and dialogs.
- [ ] Measure Quick Capture from opening the form to save; meet the 30–40 second target without requiring Deep Mode.
- [ ] Run the acceptance suite and record any failures or regressions before approving the next phase.

**Gate:** Phase 1 stays paused until the UX checklist above is reviewed. The current deployment's clean frontend/network QA snapshot is useful, but it does not replace hands-on usability, accessibility, or end-to-end testing.

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
- [ ] Validate keyboard and mobile behavior using the UX gate.
- [ ] Add reproducible browser E2E tests for CRUD, review, export, restore, migration, and offline startup.
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
