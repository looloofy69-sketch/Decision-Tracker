import { describe, expect, it } from 'vitest';
import type { Store } from '../domain/types';
import { chooseRecoverySource } from './indexedDb';

function store(projects: string[], ids: string[]): Store {
  return {
    projects,
    decisions: ids.map(id => ({ id } as unknown as Store['decisions'][number])),
  };
}

describe('normalized storage recovery selection', () => {
  it('prefers a populated retained aggregate over a populated but potentially stale localStorage copy', () => {
    const aggregate = store(['Fresh project'], ['decision-current']);
    const local = store(['Old project'], ['decision-stale']);

    expect(chooseRecoverySource(aggregate, local)).toBe(aggregate);
    expect(chooseRecoverySource(aggregate, local).decisions[0].id).toBe('decision-current');
  });

  it('uses localStorage when the retained aggregate is missing or empty and local data exists', () => {
    const local = store(['Recovered project'], ['decision-local']);

    expect(chooseRecoverySource(null, local)).toBe(local);
    expect(chooseRecoverySource(store(['General'], []), local)).toBe(local);
  });

  it('prefers a valid empty aggregate over an empty fallback when neither contains user data', () => {
    const aggregate = store(['General'], []);
    const local = store(['General'], []);

    expect(chooseRecoverySource(aggregate, local)).toBe(aggregate);
  });
});
