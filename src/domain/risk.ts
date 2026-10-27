import type { Assumption, Decision, UrgencyLevel } from './types';

const unresolvedAssumptionStatuses: Assumption['status'][] = ['Active', 'Weakened', 'Uncertain'];

function todayISO() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function confidenceWeight(level: Assumption['confidence']) {
  return level === 'High' ? 3 : level === 'Medium' ? 2 : 1;
}

function impactWeight(level: Assumption['impact']) {
  return level === 'High' ? 3 : level === 'Medium' ? 2 : 1;
}

export function riskScore(assumption: Pick<Assumption, 'impact' | 'confidence'>) {
  const raw = impactWeight(assumption.impact) * (1 - confidenceWeight(assumption.confidence) / 3);
  return Math.round((raw / 2) * 100);
}

export function isReviewDue(decision: Decision) {
  return Boolean(
    decision.reviewDate &&
    decision.reviewDate <= todayISO() &&
    (!decision.reviewedAt || decision.reviewDate > decision.reviewedAt.slice(0, 10))
  );
}

function dayDifference(from: string, to: string) {
  const start = new Date((from || todayISO()) + 'T12:00:00').getTime();
  const end = new Date((to || todayISO()) + 'T12:00:00').getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.round((end - start) / 86400000);
}

export function urgencyInfo(decision: Decision): {
  level: UrgencyLevel;
  reasons: string[];
  ageDays: number;
  staleHighRiskCount: number;
} {
  const today = todayISO();
  const ageDays = Math.max(0, dayDifference(decision.date, today));
  const daysToReview = decision.reviewDate ? dayDifference(today, decision.reviewDate) : null;
  const triggered = decision.killCriteria.some(item => item.triggered && !item.clearedAt);
  const unresolvedHighRisk = decision.assumptions.filter(item =>
    riskScore(item) >= 50 && unresolvedAssumptionStatuses.includes(item.status)
  );
  const stale = unresolvedHighRisk.filter(item => {
    const latestSignal = decision.signals
      .filter(signal => signal.targetType === 'Assumption' && signal.targetId === item.id)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    return dayDifference(latestSignal?.date || decision.date, today) >= 30;
  });
  const reasons: string[] = [];
  if (triggered) reasons.push('A kill criterion is triggered and has not been reviewed.');
  if (isReviewDue(decision)) reasons.push(decision.reviewDate < today ? 'The scheduled review is overdue.' : 'The scheduled review is due today.');
  else if (daysToReview !== null && daysToReview >= 0 && daysToReview <= 3) reasons.push('The review date is within three days.');
  if (stale.length) reasons.push(stale.length + ' unresolved high-risk assumption(s) have no signal in the last 30 days.');
  if (ageDays >= 90 && !decision.reviewedAt) reasons.push('This decision is at least 90 days old without a completed review.');
  let level: UrgencyLevel = 'Stable';
  if (triggered) level = 'Critical';
  else if (isReviewDue(decision) || (daysToReview !== null && daysToReview >= 0 && daysToReview <= 3) || stale.some(item => riskScore(item) >= 75)) level = 'Urgent';
  else if ((daysToReview !== null && daysToReview >= 0 && daysToReview <= 14) || stale.length) level = 'Watch';
  else if (ageDays >= 90 && !decision.reviewedAt) level = 'Aging';
  return { level, reasons, ageDays, staleHighRiskCount: stale.length };
}
