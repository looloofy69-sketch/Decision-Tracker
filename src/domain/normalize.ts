import type {
  Alternative, Assumption, AssumptionStatus, Commitment, Decision, DecisionGrade,
  DecisionVersion, KillCriterion, SignalLog, Store,
} from './types';
import { createId } from './ids';

export const NORMALIZED_SCHEMA_VERSION = 1;
export type ProjectRecord = {
  id: string; name: string; description: string; status: 'active' | 'archived';
  createdAt: string; updatedAt: string; position: number;
};
export type DecisionRecord = Omit<
  Decision, 'project' | 'alternatives' | 'assumptions' | 'killCriteria' |
  'commitments' | 'signals' | 'versions' | 'relatedIds'
> & { projectId: string; parentDecisionId: string | null; position: number; deletedAt?: string };
export type AlternativeRecord = Alternative & { decisionId: string; position: number };
export type AssumptionRecord = Assumption & { decisionId: string; position: number; deletedAt?: string };
export type KillCriterionRecord = KillCriterion & { decisionId: string; position: number };
export type CommitmentRecord = Commitment & { decisionId: string; position: number };
export type DecisionVersionRecord = DecisionVersion & { decisionId: string; position: number };
export type SignalRecord = SignalLog & { decisionId: string; assumptionId: string | null; createdAt: string; position: number };
export type DecisionRelationRecord = {
  id: string; sourceDecisionId: string; targetDecisionId: string | null;
  unresolvedTargetId: string | null; relationType: 'depends_on'; position: number;
};
export type ReviewRecord = {
  id: string; decisionId: string; reviewDate: string; actualOutcome: string;
  decisionGrade: DecisionGrade; lessonsLearned: string; createdAt: string;
};
export type AssumptionReviewVerdict = 'confirmed' | 'violated' | 'uncertain';
export type AssumptionReviewRecord = {
  id: string; reviewId: string; assumptionId: string; verdict: AssumptionReviewVerdict;
};
export type NormalizedWorkspace = {
  schemaVersion: 1; projects: ProjectRecord[]; decisions: DecisionRecord[];
  alternatives: AlternativeRecord[]; assumptions: AssumptionRecord[];
  killCriteria: KillCriterionRecord[]; signals: SignalRecord[];
  commitments: CommitmentRecord[]; relations: DecisionRelationRecord[];
  reviews: ReviewRecord[]; assumptionReviews: AssumptionReviewRecord[];
  decisionVersions: DecisionVersionRecord[];
};
export type NormalizationReport = { errors: string[]; warnings: string[] };
type Options = { now?: string; idFactory?: () => string };
type Child = { decisionId: string; position: number };
const rows = <T,>(value: T[] | undefined): T[] => Array.isArray(value) ? value : [];
const verdict = (status: AssumptionStatus): AssumptionReviewVerdict =>
  status === 'Confirmed' ? 'confirmed' : status === 'Violated' ? 'violated' : 'uncertain';

/**
 * Losslessly adapts the original aggregate payload to normalized entities.
 * Existing IDs are never rewritten. Removed decisions/assumptions become
 * tombstones when needed to preserve review and evidence references.
 */
export function normalizeStore(source: Store, prior?: NormalizedWorkspace, options: Options = {}): NormalizedWorkspace {
  const now = options.now || new Date().toISOString();
  const newId = options.idFactory || createId;
  const input = rows(source?.decisions);
  const activeDecisionIds = new Set(input.map(item => item.id));
  const allKnownDecisionIds = new Set([...activeDecisionIds, ...(prior?.decisions || []).map(item => item.id)]);
  const namesInput = [...rows(source?.projects), ...input.map(item => item.project || 'General')];
  if (!namesInput.length) namesInput.push('General');
  const names = [...new Set(namesInput.map(name => String(name || 'General')))];
  const priorProjects = new Map((prior?.projects || []).map(project => [project.name, project]));
  const projects: ProjectRecord[] = names.map((name, position) => {
    const previous = priorProjects.get(name);
    return previous
      ? { ...previous, status: 'active', position }
      : { id: newId(), name, description: '', status: 'active', createdAt: now, updatedAt: now, position };
  });
  for (const oldProject of prior?.projects || []) {
    if (!names.includes(oldProject.name)) {
      projects.push({ ...oldProject, status: 'archived', position: projects.length });
    }
  }
  const projectIdByName = new Map(projects.map(project => [project.name, project.id]));
  const priorRelations = new Map((prior?.relations || []).map(relation => [
    [relation.sourceDecisionId, relation.targetDecisionId ?? relation.unresolvedTargetId ?? '', relation.position].join('|'),
    relation,
  ]));

  const decisions: DecisionRecord[] = [];
  const alternatives: AlternativeRecord[] = [];
  const assumptions: AssumptionRecord[] = [];
  const killCriteria: KillCriterionRecord[] = [];
  const signals: SignalRecord[] = [];
  const commitments: CommitmentRecord[] = [];
  const relations: DecisionRelationRecord[] = [];
  const decisionVersions: DecisionVersionRecord[] = [];
  const currentAssumptionIds = new Set<string>();

  input.forEach((item, position) => {
    const projectId = projectIdByName.get(item.project || 'General') || projectIdByName.values().next().value as string;
    const {
      project: _project, alternatives: itemAlternatives, assumptions: itemAssumptions,
      killCriteria: itemKillCriteria, commitments: itemCommitments, signals: itemSignals,
      versions: itemVersions, relatedIds, ...core
    } = item;
    void _project;
    const edges = (relatedIds || []).map((targetId, edgePosition): DecisionRelationRecord => {
      const old = priorRelations.get([item.id, targetId, edgePosition].join('|'));
      const resolved = allKnownDecisionIds.has(targetId) && targetId !== item.id;
      return {
        id: old?.id || newId(),
        sourceDecisionId: item.id,
        targetDecisionId: resolved ? targetId : null,
        unresolvedTargetId: resolved ? null : targetId,
        relationType: 'depends_on',
        position: edgePosition,
      };
    });
    relations.push(...edges);
    decisions.push({
      ...core, projectId,
      parentDecisionId: edges.find(edge => edge.targetDecisionId)?.targetDecisionId || null,
      position,
    });
    rows(itemAlternatives).forEach((child, index) => alternatives.push({ ...child, decisionId: item.id, position: index }));
    rows(itemAssumptions).forEach((child, index) => {
      currentAssumptionIds.add(child.id);
      assumptions.push({ ...child, decisionId: item.id, position: index });
    });
    rows(itemKillCriteria).forEach((child, index) => killCriteria.push({ ...child, decisionId: item.id, position: index }));
    rows(itemCommitments).forEach((child, index) => commitments.push({ ...child, decisionId: item.id, position: index }));
    rows(itemSignals).forEach((child, index) => {
      const liveTarget = child.targetType === 'Assumption' && rows(itemAssumptions).some(assumption => assumption.id === child.targetId);
      signals.push({
        ...child, decisionId: item.id, assumptionId: liveTarget ? child.targetId : null,
        createdAt: child.date ? new Date(child.date + 'T12:00:00').toISOString() : now,
        position: index,
      });
    });
    rows(itemVersions).forEach((child, index) => decisionVersions.push({ ...child, decisionId: item.id, position: index }));
  });

  const deletedDecisionIds = new Set<string>();
  for (const old of prior?.decisions || []) {
    if (activeDecisionIds.has(old.id)) continue;
    deletedDecisionIds.add(old.id);
    decisions.push({ ...old, deletedAt: old.deletedAt || now, position: old.position });
  }

  // Retain complete child records for deleted decisions so historical reviews,
  // signals, alternatives, and version snapshots never point at missing parents.
  const appendOldChildren = <T extends Child & { id: string }>(current: T[], old: T[] | undefined): T[] => {
    const ids = new Set(current.map(item => item.id));
    return [...current, ...(old || []).filter(item => deletedDecisionIds.has(item.decisionId) && !ids.has(item.id)).map(item => ({ ...item }))];
  };
  const priorAssumptions = prior?.assumptions || [];
  const referencedAssumptions = new Set([
    ...(prior?.assumptionReviews || []).map(item => item.assumptionId),
    ...(prior?.signals || []).map(item => item.assumptionId).filter((id): id is string => Boolean(id)),
    ...input.flatMap(decision => rows(decision.signals).filter(signal => signal.targetType === 'Assumption').map(signal => signal.targetId)),
  ]);
  for (const old of priorAssumptions) {
    if (currentAssumptionIds.has(old.id)) continue;
    const mustRetain = deletedDecisionIds.has(old.decisionId) || old.deletedAt || referencedAssumptions.has(old.id);
    if (mustRetain && !assumptions.some(item => item.id === old.id)) {
      assumptions.push({ ...old, deletedAt: old.deletedAt || now });
    }
  }
  const oldRelationsForDeletedDecisions = (prior?.relations || []).filter(item => deletedDecisionIds.has(item.sourceDecisionId));
  for (const relation of oldRelationsForDeletedDecisions) {
    if (!relations.some(item => item.id === relation.id)) relations.push({ ...relation });
  }
  const completeAlternatives = appendOldChildren(alternatives, prior?.alternatives);
  const completeKillCriteria = appendOldChildren(killCriteria, prior?.killCriteria);
  const completeSignals = appendOldChildren(signals, prior?.signals);
  const completeCommitments = appendOldChildren(commitments, prior?.commitments);
  const completeVersions = appendOldChildren(decisionVersions, prior?.decisionVersions);

  const reviews = rows(prior?.reviews).map(item => ({ ...item }));
  const assumptionReviews = rows(prior?.assumptionReviews).map(item => ({ ...item }));
  for (const decision of input) {
    if (!decision.reviewedAt) continue;
    let review = reviews.find(item => item.decisionId === decision.id && item.createdAt === decision.reviewedAt);
    if (!review) {
      review = {
        id: newId(), decisionId: decision.id, reviewDate: decision.reviewedAt.slice(0, 10),
        actualOutcome: decision.reviewOutcome || '', decisionGrade: decision.grade || '',
        lessonsLearned: decision.lessons || '', createdAt: decision.reviewedAt,
      };
      reviews.push(review);
    } else {
      review.reviewDate = decision.reviewedAt.slice(0, 10);
      review.actualOutcome = decision.reviewOutcome || '';
      review.decisionGrade = decision.grade || '';
      review.lessonsLearned = decision.lessons || '';
    }
    for (const assumption of rows(decision.assumptions)) {
      if (!assumptionReviews.some(item => item.reviewId === review!.id && item.assumptionId === assumption.id)) {
        assumptionReviews.push({ id: newId(), reviewId: review.id, assumptionId: assumption.id, verdict: verdict(assumption.status) });
      }
    }
  }

  return {
    schemaVersion: NORMALIZED_SCHEMA_VERSION, projects, decisions,
    alternatives: completeAlternatives, assumptions, killCriteria: completeKillCriteria,
    signals: completeSignals, commitments: completeCommitments, relations, reviews,
    assumptionReviews, decisionVersions: completeVersions,