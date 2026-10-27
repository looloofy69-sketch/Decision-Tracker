import { describe, expect, it } from 'vitest';
import type { Decision } from './types';
import { riskScore, urgencyInfo } from './risk';

function isoDate(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

function offsetDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

function decision(overrides: Partial<Decision> = {}): Decision {
  return {
    id: 'decision-1',
    title: 'Test decision',
    context: '',
    choice: 'Proceed',
    date: offsetDate(-5),
    project: 'General',
    decisionType: 'Strategy',
    confidence: 'Medium',
    reversibility: 'Costly to reverse',
    owner: '',
    tags: [],
    links: [],
    alternatives: [],
    assumptions: [],
    commitments: [],
    signals: [],
    scenarios: {
      unit: '',
      best: { value: '', probability: '' },
      base: { value: '', probability: '' },
      worst: { value: '', probability: '' },
    },
    killCriteria: [],
    expectedUpside: '',
    expectedDownside: '',
    horizon: '30 days',
    reviewDate: offsetDate(45),
    reviewOutcome: '',
    grade: '',
    lessons: '',
    relatedIds: [],
    versions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    reviewedAt: '',
    ...overrides,
  };
}

const highRiskAssumption = {
  id: 'assumption-1',
  text: 'Customer demand will be sufficient',
  confidence: 'Low' as const,
  impact: 'High' as const,
  evidence: 'Weak' as const,
  signal: 'Qualified weekly demand',
  status: 'Active' as const,
  type: 'Market',
  owner: '',
};

describe('risk score', () => {
  it('returns 100 for a high-impact, low-confidence assumption', () => {
    expect(riskScore({ impact: 'High', confidence: 'Low' })).toBe(100);
  });

  it('returns 0 for a high-impact, high-confidence assumption', () => {
    expect(riskScore({ impact: 'High', confidence: 'High' })).toBe(0);
  });
});

describe('urgency calculation', () => {
  it('prioritizes an uncleared kill criterion as Critical', () => {
    const result = urgencyInfo(decision({
      killCriteria: [{
        id: 'kill-1',
        text: 'Stop if cost exceeds the cap',
        triggered: true,
        triggeredAt: offsetDate(-1),
        clearedAt: '',
      }],
    }));

    expect(result.level).toBe('Critical');
    expect(result.reasons.some(reason => reason.includes('kill criterion'))).toBe(true);
  });

  it('flags stale unresolved high-risk assumptions as Urgent', () => {
    const result = urgencyInfo(decision({
      date: offsetDate(-40),
      assumptions: [highRiskAssumption],
    }));

    expect(result.level).toBe('Urgent');
    expect(result.staleHighRiskCount).toBe(1);
  });

  it('removes stale-evidence urgency after a recent assumption-specific signal', () => {
    const result = urgencyInfo(decision({
      date: offsetDate(-40),
      assumptions: [highRiskAssumption],
      signals: [{
        id: 'signal-1',
        date: offsetDate(-2),
        observation: 'Several qualified customers confirmed the need',
        stance: 'Supports',
        targetType: 'Assumption',
        targetId: 'assumption-1',
      }],
    }));

    expect(result.staleHighRiskCount).toBe(0);
    expect(result.level).toBe('Stable');
  });
});
