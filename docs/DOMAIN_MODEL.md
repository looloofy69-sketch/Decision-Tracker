# Domain model and migration status

## Runtime boundary

The current React interface still consumes the compatible aggregate shape:

- `Store` contains `decisions: Decision[]` and active `projects: string[]`.
- The storage adapter maps that shape to normalized records before every IndexedDB write and hydrates it after a validated read.
- The UI can therefore be refactored separately from storage; this adapter is the compatibility seam.

The normalized storage implementation is introduced in IndexedDB schema version 2. It has dedicated object stores for projects, decisions, alternatives, assumptions, kill criteria, signals, commitments, decision relations, reviews, assumption-review verdicts, and decision versions.

## Normalized entities

| Entity | Stored relationship / fields |
|---|---|
| Project | UUID for new project records, name, description, active/archived status, timestamps and ordering |
| Decision | Project foreign key, optional parent decision, decision fields and ordering |
| Alternative | Decision foreign key, rank and ordering |
| Assumption | Decision foreign key, confidence, impact, evidence, owner and status |
| KillCriterion | Decision foreign key, trigger state and dates |
| Signal | Decision foreign key; optional assumption foreign key; raw target ID is retained when the target assumption has since been removed |
| Commitment | Decision foreign key, owner, due date and status |
| DecisionRelation | Source decision, optional target decision, relation type and ordering; multiple links remain supported |
| Review | First-class review record linked to a decision |
| AssumptionReview | Review/assumption join with a confirmed, violated or uncertain verdict |
| DecisionVersion | Decision foreign key and snapshot metadata |

Existing record IDs are retained exactly rather than rewritten during the migration. Newly created project, relation, review and join records use the UUID generator. This avoids breaking legacy references during a destructive-looking migration, but means a legacy record may retain a non-UUID ID until a separately designed identity migration is justified.

## Safe-migration behavior

1. The database upgrade creates the normalized object stores while retaining the prior `workspace` object store.
2. A single read/write transaction validates relationships, writes normalized entities, adds the migration marker, refreshes the compatibility aggregate, and stores the original aggregate in `legacySnapshots`.
3. Existing decisions, child records and project order are round-tripped through the adapter. The snapshot is not overwritten on routine saves.
4. Removed decisions become hidden tombstones when needed to preserve review or child-record references. Removed assumptions are retained as tombstones when review or signal history references them.
5. Historic signal targets that no longer resolve are retained as plain target IDs instead of fabricating a foreign key.
6. Structural foreign-key errors abort the transaction; the legacy aggregate remains available as the recovery source. Scenario-weight inconsistencies are warnings rather than migration blockers so old values are not discarded.

## Important limit of legacy review data

The old aggregate stored only the latest review fields and current assumption statuses. It did **not** contain a full history of every review or the assumption statuses at each past review. Migration can create a first-class record for the latest available review and backfill join verdicts from the statuses visible at migration time; it cannot reconstruct historical verdicts that were never stored. Treat those backfilled verdicts as approximations, not verified historical facts.

## Next work

- Show first-class Project metadata and review history in the UI without forcing every screen to consume normalized rows directly.
- Add an import/restore workflow that validates schema version, identifiers, and foreign keys before accepting a backup.
- Add a migration recovery screen for malformed legacy records rather than leaving users only with the generic browser-storage fallback state.
- Keep the normalized schema migration separate from subsequent UI/domain changes so data-loss regressions are diagnosable.
