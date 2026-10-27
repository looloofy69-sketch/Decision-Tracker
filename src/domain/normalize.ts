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
  };
}

export function hydrateStore(workspace: NormalizedWorkspace): Store {
  const projectsById = new Map(workspace.projects.map(project => [project.id, project]));
  const sortPosition = <T extends { position: number }>(list: T[]) => list.slice().sort((a, b) => a.position - b.position);
  const group = <T extends Child>(list: T[]) => {
    const grouped = new Map<string, T[]>();
    for (const row of list) grouped.set(row.decisionId, [...(grouped.get(row.decisionId) || []), row]);
    for (const [key, value] of grouped) grouped.set(key, sortPosition(value));
    return grouped;
  };
  const liveDecisions = workspace.decisions.filter(item => !item.deletedAt);
  const liveIds = new Set(liveDecisions.map(item => item.id));
  const alternatives = group(workspace.alternatives);
  const assumptions = group(workspace.assumptions.filter(item => !item.deletedAt));
  const killCriteria = group(workspace.killCriteria);
  const signals = group(workspace.signals);
  const commitments = group(workspace.commitments);
  const versions = group(workspace.decisionVersions);
  const linked = new Map<string, DecisionRelationRecord[]>();
  for (const relation of workspace.relations) linked.set(relation.sourceDecisionId, [...(linked.get(relation.sourceDecisionId) || []), relation]);
  for (const [key, value] of linked) linked.set(key, sortPosition(value));
  const strip = <T extends Record<string, unknown>>(list: T[] | undefined, keys: string[]) => (list || []).map(row => {
    const result = { ...row };
    keys.forEach(key => { delete result[key]; });
    return result;
  });

  const decisions: Decision[] = sortPosition(liveDecisions).map(record => {
    const { projectId, parentDecisionId, position, deletedAt, ...core } = record;
    void parentDecisionId; void position; void deletedAt;
    return {
      ...core,
      project: projectsById.get(projectId)?.name || 'General',
      alternatives: strip(alternatives.get(record.id) as unknown as Array<Alternative & Record<string, unknown>>, ['decisionId', 'position']) as unknown as Alternative[],
      assumptions: strip(assumptions.get(record.id) as unknown as Array<AssumptionRecord & Record<string, unknown>>, ['decisionId', 'position', 'deletedAt']) as unknown as Assumption[],
      killCriteria: strip(killCriteria.get(record.id) as unknown as Array<KillCriterion & Record<string, unknown>>, ['decisionId', 'position']) as unknown as KillCriterion[],
      commitments: strip(commitments.get(record.id) as unknown as Array<Commitment & Record<string, unknown>>, ['decisionId', 'position']) as unknown as Commitment[],
      signals: strip(signals.get(record.id) as unknown as Array<SignalRecord & Record<string, unknown>>, ['decisionId', 'assumptionId', 'createdAt', 'position']) as unknown as SignalLog[],
      versions: strip(versions.get(record.id) as unknown as Array<DecisionVersionRecord & Record<string, unknown>>, ['decisionId', 'position']) as unknown as DecisionVersion[],
      relatedIds: (linked.get(record.id) || []).map(item => item.targetDecisionId || item.unresolvedTargetId || ''),
    };
  });
  const activeProjectNames = sortPosition(workspace.projects.filter(item => item.status === 'active')).map(item => item.name);
  for (const decision of decisions) if (!activeProjectNames.includes(decision.project)) activeProjectNames.push(decision.project);
  return { decisions, projects: activeProjectNames.length ? activeProjectNames : ['General'] };
}

export function validateNormalizedWorkspace(workspace: NormalizedWorkspace): NormalizationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (workspace.schemaVersion !== NORMALIZED_SCHEMA_VERSION) errors.push('Unsupported normalized schema version.');
  const ids = new Set<string>();
  const checkIds = (records: Array<{ id: string }>, label: string) => records.forEach(record => {
    if (!record.id?.trim()) errors.push(label + ' contains a blank ID.');
    else if (ids.has(record.id)) errors.push('Duplicate record ID: ' + record.id);
    else ids.add(record.id);
  });
  checkIds(workspace.projects, 'Projects');
  checkIds(workspace.decisions, 'Decisions');
  checkIds(workspace.alternatives, 'Alternatives');
  checkIds(workspace.assumptions, 'Assumptions');
  checkIds(workspace.killCriteria, 'Kill criteria');
  checkIds(workspace.signals, 'Signals');
  checkIds(workspace.commitments, 'Commitments');
  checkIds(workspace.relations, 'Relations');
  checkIds(workspace.reviews, 'Reviews');
  checkIds(workspace.assumptionReviews, 'Assumption reviews');
  checkIds(workspace.decisionVersions, 'Decision versions');

  const projectIds = new Set(workspace.projects.map(item => item.id));
  const decisionIds = new Set(workspace.decisions.map(item => item.id));
  const assumptionsById = new Map(workspace.assumptions.map(item => [item.id, item]));
  const assumptionIds = new Set(workspace.assumptions.map(item => item.id));
  const reviewById = new Map(workspace.reviews.map(item => [item.id, item]));
  const projectNames = new Set<string>();
  for (const project of workspace.projects) {
    if (!project.name.trim()) errors.push('Project ' + project.id + ' has a blank name.');
    if (projectNames.has(project.name)) errors.push('Duplicate project name: ' + project.name);
    projectNames.add(project.name);
  }
  for (const decision of workspace.decisions) {
    if (!projectIds.has(decision.projectId)) errors.push('Decision ' + decision.id + ' references a missing project.');
    if (decision.parentDecisionId && !decisionIds.has(decision.parentDecisionId)) errors.push('Decision ' + decision.id + ' references a missing parent decision.');
    if (decision.parentDecisionId === decision.id) errors.push('A decision cannot depend on itself.');
    if (!decision.title.trim()) warnings.push('Decision ' + decision.id + ' has a blank title.');
    const weights = [decision.scenarios.best.probability, decision.scenarios.base.probability, decision.scenarios.worst.probability].map(value => String(value || '').trim());
    if (weights.some(Boolean)) {
      if (weights.some(value => !value)) warnings.push('Decision ' + decision.id + ' has incomplete scenario weights.');
      else if (weights.some(value => !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100)) warnings.push('Decision ' + decision.id + ' has a scenario weight outside 0–100.');
      else if (weights.reduce((sum, value) => sum + Number(value), 0) !== 100) warnings.push('Decision ' + decision.id + ' scenario weights do not sum to 100%.');
    }
  }
  for (const child of [...workspace.alternatives, ...workspace.assumptions, ...workspace.killCriteria, ...workspace.signals, ...workspace.commitments, ...workspace.decisionVersions]) {
    if (!decisionIds.has(child.decisionId)) errors.push('Child record ' + child.id + ' references a missing decision.');
  }
  for (const signal of workspace.signals) {
    if (signal.assumptionId && !assumptionIds.has(signal.assumptionId)) errors.push('Signal ' + signal.id + ' references a missing assumption.');
    const target = signal.assumptionId ? assumptionsById.get(signal.assumptionId) : undefined;
    if (target && target.decisionId !== signal.decisionId) errors.push('Signal ' + signal.id + ' references another decision’s assumption.');
  }
  for (const relation of workspace.relations) {
    if (!decisionIds.has(relation.sourceDecisionId)) errors.push('Relation ' + relation.id + ' has a missing source decision.');
    if (relation.targetDecisionId && !decisionIds.has(relation.targetDecisionId)) errors.push('Relation ' + relation.id + ' has a missing target decision.');
    if (relation.targetDecisionId === relation.sourceDecisionId) errors.push('A decision cannot depend on itself.');
    if (!relation.targetDecisionId && !relation.unresolvedTargetId) errors.push('Relation ' + relation.id + ' has no target reference.');
  }
  for (const review of workspace.reviews) if (!decisionIds.has(review.decisionId)) errors.push('Review ' + review.id + ' references a missing decision.');
  for (const row of workspace.assumptionReviews) {
    if (!reviewById.has(row.reviewId)) errors.push('Assumption review ' + row.id + ' references a missing review.');
    if (!assumptionIds.has(row.assumptionId)) errors.push('Assumption review ' + row.id + ' references a missing assumption.');
    const assumption = assumptionsById.get(row.assumptionId);
    const review = reviewById.get(row.reviewId);
    if (assumption && review && assumption.decisionId !== review.decisionId) errors.push('Assumption review ' + row.id + ' crosses decision boundaries.');
  }
  return { errors, warnings };
}
