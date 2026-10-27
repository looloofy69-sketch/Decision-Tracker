export type Level = 'Low' | 'Medium' | 'High';
export type AssumptionStatus =
  | 'Active'
  | 'Confirmed'
  | 'Weakened'
  | 'Violated'
  | 'Uncertain'
  | 'Expired';
export type EvidenceLevel = 'None' | 'Weak' | 'Medium' | 'Strong';
export type Reversibility = 'Easily reversible' | 'Costly to reverse' | 'One-way door';
export type DecisionGrade = 'Good' | 'Acceptable' | 'Poor' | 'Too early to tell' | '';
export type View =
  | 'overview'
  | 'all'
  | 'reviews'
  | 'violated'
  | 'high-impact'
  | 'projects'
  | 'stats'
  | 'portfolio'
  | 'bets'
  | 'dependencies'
  | 'compare'
  | 'lessons';
export type Alternative = {
  id: string;
  text: string;
  reason: string;
  almostChosen: boolean;
  rank: number;
  secondBest: boolean;
  revived: boolean;
};
export type Assumption = {
  id: string;
  text: string;
  confidence: Level;
  impact: Level;
  evidence: EvidenceLevel;
  signal: string;
  status: AssumptionStatus;
  type: string;
  owner: string;
};
export type SignalStance = 'Supports' | 'Weakens' | 'Neutral';
export type SignalTargetType = 'Decision' | 'Assumption';
export type SignalLog = {
  id: string;
  date: string;
  observation: string;
  stance: SignalStance;
  targetType: SignalTargetType;
  targetId: string;
};
export type ScenarioEstimate = {
  value: string;
  probability: string;
};
export type DecisionScenarios = {
  unit: string;
  best: ScenarioEstimate;
  base: ScenarioEstimate;
  worst: ScenarioEstimate;
};
export type CommitmentStatus = 'Open' | 'Done' | 'Missed';
export type Commitment = {
  id: string;
  text: string;
  owner: string;
  dueDate: string;
  status: CommitmentStatus;
  completedAt: string;
};
export type KillCriterion = {
  id: string;
  text: string;
  triggered: boolean;
  triggeredAt: string;
  clearedAt: string;
};
export type DecisionVersion = {
  id: string;
  savedAt: string;
  summary: string;
  snapshot: string;
};
export type UrgencyLevel = 'Critical' | 'Urgent' | 'Watch' | 'Aging' | 'Stable';
export type Decision = {
  id: string;
  title: string;
  context: string;
  choice: string;
  date: string;
  project: string;
  decisionType: string;
  confidence: Level;
  reversibility: Reversibility;
  owner: string;
  tags: string[];
  links: string[];
  alternatives: Alternative[];
  assumptions: Assumption[];
  commitments: Commitment[];
  signals: SignalLog[];
  scenarios: DecisionScenarios;
  killCriteria: KillCriterion[];
  expectedUpside: string;
  expectedDownside: string;
  horizon: string;
  reviewDate: string;
  reviewOutcome: string;
  grade: DecisionGrade;
  lessons: string;
  relatedIds: string[];
  versions: DecisionVersion[];
  createdAt: string;
  updatedAt: string;
  reviewedAt: string;
};
export type DecisionDraft = Omit<
  Decision,
  'id' | 'links' | 'tags' | 'signals' | 'createdAt' | 'updatedAt' | 'reviewedAt' | 'versions'
> & {
  linksText: string;
  tagsText: string;
};
export type Store = { decisions: Decision[]; projects: string[] };
export type ReviewDraft = {
  actualOutcome: string;
  grade: DecisionGrade;
  lessons: string;
  nextReviewDate: string;
  assumptionStatuses: Record<string, AssumptionStatus>;
};
