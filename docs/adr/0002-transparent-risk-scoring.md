# ADR 0002: Transparent derived risk and urgency

- Status: Accepted for the current product stage
- Date: 2026-10-27

## Context
Risk indicators must be understandable and repeatable. Opaque scoring would undermine trust in the tracker.

## Decision
Keep risk calculations in the pure domain module. The current formula weights impact and confidence on a 1–3 scale, then maps the inverse-confidence weighted result to a 0–100 score. Urgency derives from review dates, uncleared kill criteria, unresolved high-risk assumptions, signal recency, and age.

## Consequences
- A high-impact, low-confidence assumption scores 100; a high-impact, high-confidence assumption scores 0.
- Urgency can be tested without rendering React.
- Scores are prioritization heuristics, not failure probabilities. Changes require tests and documentation.
