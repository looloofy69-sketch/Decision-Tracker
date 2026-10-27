import { describe, expect, it } from 'vitest';
import type { Decision, Store } from './types';
import { hydrateStore, normalizeStore, validateNormalizedWorkspace } from './normalize';

const idFactory = (prefix: string) => {
  let count = 0;
  return () => prefix + '-' + (++count);
};

function makeDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    id: 'decision-a', title: 'Ship the product', context: 'Confirm demand before scaling.',
    choice: 'Run a paid pilot', date: '2026-10-20', project: 'Product',
    decisionType: 'Launch', confidence: 'Medium', reversibility: 'Costly to reverse',
    owner: 'Owner A', tags: ['launch'], links: ['https://example.com/brief'],
    alternatives: [{ id: 'alternative-a', text: 'Wait', reason: 'Costs time', almostChosen: false, rank: 1, secondBest: true, revived: false }],
    assumptions: [{ id: 'assumption-a', text: 'Customers will pay', confidence: 'Low', impact: 'High', evidence: 'Weak', signal: 'Qualified demand', status: 'Active', type: 'Market', owner: 'Owner B' }],
    commitments: [{ id: 'commitment-a', text: 'Interview customers', owner: 'Owner B', dueDate: '2026-11-01', status: 'Open', completedAt: '' }],
    signals: [{ id: 'signal-a', date: '2026-10-24', observation: 'Two customers requested a paid pilot.', stance: 'Supports', targetType: 'Assumption', targetId: 'assumption-a' }],
    scenarios: { unit: 'USD/month', best: { value: '12000', probability: '20' }, base: { value: '6000', probability: '60' }, worst: { value: '0', probability: '20' } },
    killCriteria: [{ id: 'kill-a', text: 'Stop if no paid pilot in 60 days.', triggered: false, triggeredAt: '', clearedAt: '' }],
    expectedUpside: 'Recurring revenue', expectedDownside: 'Pilot cost', horizon: '90 days',
    reviewDate: '2026-12-01', reviewOutcome: 'Early interest', grade: 'Acceptable',
    lessons: 'Small tests reveal demand.', relatedIds: [],
    versions: [{ id: 'version-a', savedAt: '2026-10-21T10:00:00.000Z', summary: 'Initial capture', snapshot: '{"id":"decision-a"}' }],
    createdAt: '2026-10-20T10:00:00.000Z', updatedAt: '2026-10-24T10:00:00.000Z',
    reviewedAt: '2026-10-24T10:00:00.000Z',
    ...overrides,
  };
}

function fixture(): Store {
  return {
    projects: ['Product', 'Research'],
    decisions: [
      makeDecision(),
      makeDecision({
        id: 'decision-b', title: 'Choose a research method', project: 'Research',
        choice: 'Customer interviews', relatedIds: ['decision-a'], alternatives: [],
        assumptions: [], commitments: [], signals: [{
          id: 'signal-orphan', date: '2026-10-25',
          observation: 'Historic note referring to a removed assumption.',
          stance: 'Neutral', targetType: 'Assumption', targetId: 'assumption-removed',
        }],
        killCriteria: [], versions: [], reviewedAt: '', reviewOutcome: '', lessons: '', grade: '',
      }),
    ],
  };
}

describe('aggregate-to-normalized adapter', () => {
  it('round-trips every current child record and project order', () => {
    const source = fixture();
    const normalized = normalizeStore(source, undefined, { now: '2026-10-27T12:00:00.000Z', idFactory: idFactory('entity') });
    expect(validateNormalizedWorkspace(normalized).errors).toEqual([]);
    expect(hydrateStore(normalized)).toEqual(source);
    expect(normalized.decisions.find(item => item.id === 'decision-b')?.parentDecisionId).toBe('decision-a');
  });

  it('preserves project IDs and the formal review plus assumption verdict history across saves', () => {
    const source = fixture();
    const factory = idFactory('preserve');
    const first = normalizeStore(source, undefined, { idFactory: factory, now: '2026-10-27T12:00:00.000Z' });
    const projectId = first.projects.find(project => project.name === 'Product')?.id;
    const reviewIds = first.reviews.map(review => review.id);
    const second = normalizeStore(source, first, { idFactory: factory, now: '2026-10-28T12:00:00.000Z' });
    expect(second.projects.find(project => project.name === 'Product')?.id).toBe(projectId);
    expect(second.reviews.map(review => review.id)).toEqual(reviewIds);
    expect(second.assumptionReviews).toEqual(first.assumptionReviews);
  });

  it('preserves removed decisions as hidden tombstones so old reviews and child records remain valid', () => {
    const first = normalizeStore(fixture(), undefined, { idFactory: idFactory('tombstone') });
    const remaining = fixture();
    remaining.projects = ['Research'];
    remaining.decisions = [makeDecision({
      id: 'decision-b', title: 'Choose a research method', project: 'Research',
      choice: 'Customer interviews', relatedIds: [], alternatives: [], assumptions: [],
      commitments: [], signals: [], killCriteria: [], versions: [],
      reviewedAt: '', reviewOutcome: '', lessons: '', grade: '',
    })];
    const next = normalizeStore(remaining, first, { idFactory: idFactory('next'), now: '2026-10-29T12:00:00.000Z' });
    expect(next.decisions.find(item => item.id === 'decision-a')?.deletedAt).toBeTruthy();
    expect(next.reviews.some(item => item.decisionId === 'decision-a')).toBe(true);
    expect(next.assumptions.some(item => item.id === 'assumption-a' && item.deletedAt)).toBe(true);
    expect(validateNormalizedWorkspace(next).errors).toEqual([]);
    expect(hydrateStore(next).decisions.map(item => item.id)).toEqual(['decision-b']);
    expect(hydrateStore(next).projects).toEqual(['Research']);
  });

  it('retains self-referential legacy links as unresolved references rather than failing migration', () => {
    const source = fixture();
    source.decisions[0].relatedIds = ['decision-a'];
    const normalized = normalizeStore(source, undefined, { idFactory: idFactory('self-link') });
    expect(validateNormalizedWorkspace(normalized).errors).toEqual([]);
    expect(normalized.relations.find(edge => edge.sourceDecisionId === 'decision-a')?.targetDecisionId).toBeNull();
    expect(hydrateStore(normalized).decisions[0].relatedIds).toEqual(['decision-a']);
  });

  it('retains historical signals to removed assumptions without inventing a foreign key', () => {
    const normalized = normalizeStore(fixture(), undefined, { idFactory: idFactory('signal') });
    const orphan = normalized.signals.find(item => item.id === 'signal-orphan');
    expect(orphan?.targetId).toBe('assumption-removed');
    expect(orphan?.assumptionId).toBeNull();
    expect(validateNormalizedWorkspace(normalized).errors).toEqual([]);
    expect(hydrateStore(normalized).decisions.find(item => item.id === 'decision-b')?.signals[0].targetId).toBe('assumption-removed');
  });

  it('rejects broken foreign keys and warns about inconsistent optional scenario weights', () => {
    const source = fixture();
    source.decisions[0].scenarios.best.probability = '25';
    const normalized = normalizeStore(source, undefined, { idFactory: idFactory('validation') });
    const report = validateNormalizedWorkspace(normalized);
    expect(report.errors).toEqual([]);
    expect(report.warnings.some(warning => warning.includes('do not sum to 100%'))).toBe(true);
    normalized.decisions[0].projectId = 'missing-project';
    expect(validateNormalizedWorkspace(normalized).errors.some(error => error.includes('missing project'))).toBe(true);
  });
});
