# Domain model

## Current storage shape

The current deployed UI uses a readable aggregate payload:

- `Store` contains `decisions: Decision[]` and `projects: string[]`.
- Alternatives, assumptions, kill criteria, signals, commitments, and version snapshots are nested inside each decision.
- A decision references its project by name (`project`), not by a stable `projectId`.
- The current review UI stores the latest review fields on the decision. It does not yet persist first-class review history with join records for each assumption verdict.

This aggregate is retained during the first persistence migration to avoid losing existing browser data.

## Target normalized model

The next domain migration should make each entity first-class and use UUID primary keys plus explicit foreign keys:

| Entity | Key fields | Relationship |
|---|---|---|
| Project | id, name, description, status, createdAt, updatedAt | Parent for decisions |
| Decision | id, projectId, parentDecisionId, title, context, finalChoice, decisionDate, confidence, reversibility, timeHorizon, type, owner, status | Belongs to project; may depend on another decision |
| Alternative | id, decisionId, title, rejectionReason, rank, wasSecondBest | Belongs to one decision |
| Assumption | id, decisionId, statement, confidence, impactIfWrong, evidenceLevel, monitoringSignal, owner, status | Belongs to one decision |
| KillCriterion | id, decisionId, description, triggered, triggeredAt | Belongs to one decision |
| Signal | id, decisionId, assumptionId, date, observation, effect, createdAt | Belongs to a decision; optionally targets one assumption |
| Commitment | id, decisionId, description, owner, dueDate, status | Belongs to one decision |
| Review | id, decisionId, reviewDate, actualOutcome, decisionGrade, lessonsLearned, createdAt | One decision may have many reviews |
| AssumptionReview | reviewId, assumptionId, verdict | Join record linking a review to an assumption verdict |

Risk scores should remain derived values, not the authoritative source of truth. Risk/urgency calculations belong in `src/domain/risk.ts`, outside React components.

## Invariants

1. Every foreign key resolves to an entity of the expected type.
2. Each project and persisted record has a stable UUID; loading data must not regenerate IDs.
3. Scenario weights are optional. If any probability is supplied, all three must be supplied, each must be 0–100, and the sum must be 100.
4. Signal capture records evidence but never silently changes an assumption verdict.
5. An uncleared kill criterion has Critical urgency.
6. Migrations are idempotent, versioned, validated before commit, and preserve a recoverable copy of the old payload.

## Migration strategy

Do not replace the aggregate store in-place with a normalized model in one untested change. Implement a pure, tested adapter from the legacy aggregate to a normalized workspace, preserve existing IDs, assign stable IDs to project records, and validate foreign keys and record counts. Only then write the normalized schema in a transaction and retain the old payload until a later successful launch confirms migration.
