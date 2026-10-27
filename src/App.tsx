import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  Filter,
  FolderKanban,
  GitBranch,
  Lightbulb,
  Link2,
  Menu,
  ListChecks,
  Plus,
  Printer,
  Search,
  Settings2,
  ShieldAlert,
  Sparkles,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import type { Level, AssumptionStatus, EvidenceLevel, Reversibility, DecisionGrade, View, Alternative, Assumption, SignalStance, SignalLog, CommitmentStatus, Commitment, KillCriterion, DecisionVersion, UrgencyLevel, Decision, DecisionDraft, Store, ReviewDraft } from './domain/types';
import { createId } from './domain/ids';
import { isReviewDue, riskScore, urgencyInfo } from './domain/risk';
import { loadWorkspaceStore, saveWorkspaceStore } from './storage/indexedDb';

const STORAGE_KEY = 'decision-assumption-tracker-v1';
const DECISION_TYPES = [
  'Hire', 'Build vs Buy', 'Pricing', 'Launch', 'Investment', 'Strategy',
  'Personal', 'Technology', 'Operations', 'Other',
];
const REVERSIBILITY_OPTIONS: Reversibility[] = [
  'Easily reversible', 'Costly to reverse', 'One-way door',
];
const EVIDENCE_OPTIONS: EvidenceLevel[] = ['None', 'Weak', 'Medium', 'Strong'];
const SCENARIO_OPTIONS: { key: 'best' | 'base' | 'worst'; label: string }[] = [
  { key: 'best', label: 'Best case' },
  { key: 'base', label: 'Base case' },
  { key: 'worst', label: 'Worst case' },
];
function normalizeDecision(value: Partial<Decision> & Record<string, any>, index = 0): Decision {
  const alternatives = (Array.isArray(value.alternatives) ? value.alternatives : []).map(
    (a: Partial<Alternative> & Record<string, any>, i: number) => ({
      id: a.id || uid(),
      text: a.text || '',
      reason: a.reason || '',
      almostChosen: Boolean(a.almostChosen),
      rank: Number.isFinite(a.rank) && a.rank > 0 ? Number(a.rank) : i + 1,
      secondBest: Boolean(a.secondBest ?? a.almostChosen),
      revived: Boolean(a.revived),
    })
  );
  const assumptions = (Array.isArray(value.assumptions) ? value.assumptions : []).map(
    (a: Partial<Assumption> & Record<string, any>) => ({
      id: a.id || uid(),
      text: a.text || '',
      confidence: a.confidence || 'Medium',
      impact: a.impact || 'Medium',
      evidence: a.evidence || 'None',
      signal: a.signal || '',
      status: a.status || 'Active',
      type: a.type || 'Other',
      owner: a.owner || '',
    })
  );
  return {
    ...(value as Decision),
    id: value.id || uid(),
    title: value.title || 'Untitled decision ' + (index + 1),
    context: value.context || '',
    choice: value.choice || '',
    date: value.date || todayISO(),
    project: value.project || 'General',
    decisionType: value.decisionType || 'Strategy',
    confidence: value.confidence || 'Medium',
    reversibility: value.reversibility || 'Costly to reverse',
    tags: Array.isArray(value.tags) ? value.tags.filter(Boolean) : [],
    links: Array.isArray(value.links) ? value.links : [],
    alternatives,
    assumptions,
    killCriteria: (Array.isArray(value.killCriteria) ? value.killCriteria : []).map(
      (k: Partial<KillCriterion> & Record<string, any>) => ({
        id: k.id || uid(),
        text: k.text || '',
        triggered: Boolean(k.triggered),
        triggeredAt: k.triggeredAt || '',
        clearedAt: k.clearedAt || '',
      })
    ),
    owner: value.owner || '',
    scenarios: {
      unit: value.scenarios?.unit || '',
      best: { value: value.scenarios?.best?.value || '', probability: value.scenarios?.best?.probability || '' },
      base: { value: value.scenarios?.base?.value || '', probability: value.scenarios?.base?.probability || '' },
      worst: { value: value.scenarios?.worst?.value || '', probability: value.scenarios?.worst?.probability || '' },
    },
    commitments: (Array.isArray(value.commitments) ? value.commitments : []).map((item: Partial<Commitment> & Record<string, any>) => ({
      id: item.id || uid(),
      text: item.text || '',
      owner: item.owner || '',
      dueDate: item.dueDate || '',
      status: item.status === 'Done' || item.status === 'Missed' ? item.status : 'Open',
      completedAt: item.completedAt || '',
    })),
    signals: (Array.isArray(value.signals) ? value.signals : []).map((item: Partial<SignalLog> & Record<string, any>) => ({
      id: item.id || uid(),
      date: item.date || todayISO(),
      observation: item.observation || '',
      stance: item.stance === 'Supports' || item.stance === 'Weakens' ? item.stance : 'Neutral',
      targetType: item.targetType === 'Assumption' ? 'Assumption' : 'Decision',
      targetId: item.targetId || value.id || '',
    })),
    expectedUpside: value.expectedUpside || '',
    expectedDownside: value.expectedDownside || '',
    horizon: value.horizon || '',
    reviewDate: value.reviewDate || '',
    reviewOutcome: value.reviewOutcome || '',
    grade: value.grade || '',
    lessons: value.lessons || '',
    relatedIds: Array.isArray(value.relatedIds) ? value.relatedIds : [],
    versions: Array.isArray(value.versions) ? value.versions : [],
    createdAt: value.createdAt || new Date().toISOString(),
    updatedAt: value.updatedAt || new Date().toISOString(),
    reviewedAt: value.reviewedAt || '',
  };
}
function createVersion(decision: Decision, summary: string): DecisionVersion {
  const { versions: _versions, ...snapshot } = decision;
  return {
    id: uid(),
    savedAt: new Date().toISOString(),
    summary,
    snapshot: JSON.stringify(snapshot, null, 2),
  };
}
function describeDecisionChanges(existing: Decision, draft: DecisionDraft) {
  const changed: string[] = [];
  const check = (label: string, before: unknown, after: unknown) => {
    if (JSON.stringify(before) !== JSON.stringify(after)) changed.push(label);
  };
  check('title', existing.title, draft.title.trim());
  check('context', existing.context, draft.context.trim());
  check('final choice', existing.choice, draft.choice.trim());
  check('decision date', existing.date, draft.date || todayISO());
  check('project', existing.project, draft.project.trim() || 'General');
  check('decision type', existing.decisionType, draft.decisionType);
  check('confidence', existing.confidence, draft.confidence);
  check('reversibility', existing.reversibility, draft.reversibility);
  check('tags', existing.tags, draft.tagsText.split(',').map(tag => tag.trim()).filter(Boolean));
  check('linked documents', existing.links, draft.linksText.split('\n').map(link => link.trim()).filter(Boolean));
  check('ranked alternatives', existing.alternatives, draft.alternatives.filter(a => a.text.trim()).slice().sort((a, b) => a.rank - b.rank));
  check('assumptions', existing.assumptions, draft.assumptions.filter(a => a.text.trim()));
  check('kill criteria', existing.killCriteria, draft.killCriteria.filter(k => k.text.trim()));
  check('expected upside', existing.expectedUpside, draft.expectedUpside.trim());
  check('expected downside', existing.expectedDownside, draft.expectedDownside.trim());
  check('time horizon', existing.horizon, draft.horizon.trim());
  check('review date', existing.reviewDate, draft.reviewDate);
  check('decision owner', existing.owner, draft.owner.trim());
  check('numeric scenarios', existing.scenarios, draft.scenarios);
  check('commitments', existing.commitments, draft.commitments);
  check('decision dependencies', existing.relatedIds.slice().sort(), draft.relatedIds.slice().sort());
  return changed.length ? changed.join(', ') : 'no tracked field differences';
}
function horizonDays(value: string): number | null {
  const match = String(value || '').toLowerCase().match(/[0-9]+(?:\.[0-9]+)?/);
  if (!match) return null;
  const amount = Number(match[0]);
  const text = String(value).toLowerCase();
  if (text.includes('year') || text.includes('yr')) return amount * 365;
  if (text.includes('quarter') || text.includes('qtr')) return amount * 90;
  if (text.includes('month') || text.includes(' mo')) return amount * 30;
  if (text.includes('week') || text.includes('wk')) return amount * 7;
  return amount;
}
const ASSUMPTION_TYPES = [
  'Market',
  'Technical',
  'Cost',
  'Adoption',
  'Delivery',
  'People',
  'Legal / compliance',
  'External',
  'Other',
];
const STATUS_OPTIONS: AssumptionStatus[] = [
  'Active',
  'Confirmed',
  'Violated',
  'Uncertain',
  'Expired',
];
const REVIEW_STATUS_OPTIONS: AssumptionStatus[] = [
  'Confirmed',
  'Weakened',
  'Violated',
  'Uncertain',
  'Expired',
];
const TEMPLATES = [
  {
    name: 'Hire / Don’t hire',
    title: 'Hiring decision',
    context: 'Role, capability gap, and evidence of fit',
    options: ['Hire', 'Do not hire'],
  },
  {
    name: 'Build vs Buy',
    title: 'Build vs buy',
    context: 'Capability needed, constraints, and what success means',
    options: ['Build internally', 'Buy / adopt a solution'],
  },
  {
    name: 'Launch / Delay',
    title: 'Launch readiness',
    context: 'Readiness, customer impact, and the cost of waiting',
    options: ['Launch now', 'Delay launch'],
  },
  {
    name: 'Invest / Pass',
    title: 'Investment decision',
    context: 'Thesis, expected return, downside, and invalidation criteria',
    options: ['Invest', 'Pass'],
  },
];
const PREMORTEM_PROMPTS = [
  'What if the main user/customer need is weaker than expected?',
  'What hidden dependency could block execution?',
  'What cost, delay, or downside are we underestimating?',
  'What evidence would show that our central belief is wrong?',
];

function uid() {
  return createId();
}
function todayISO() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}
function addDays(date: string, days: number) {
  const d = new Date((date || todayISO()) + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function formatDate(value?: string) {
  if (!value) return 'Not set';
  const normalized = value.slice(0, 10);
  const d = new Date(normalized + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}
function readStore(): Store {
  if (typeof window === 'undefined')
    return { decisions: [], projects: ['General'] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { decisions: [], projects: ['General'] };
    const parsed = JSON.parse(raw) as Store;
    if (!Array.isArray(parsed.decisions) || !Array.isArray(parsed.projects)) {
      return { decisions: [], projects: ['General'] };
    }
    return {
      decisions: parsed.decisions.map((decision, index) =>
        normalizeDecision(decision as Partial<Decision> & Record<string, any>, index)
      ),
      projects: parsed.projects.length ? parsed.projects : ['General'],
    };
  } catch {
    return { decisions: [], projects: ['General'] };
  }
}
function emptyDraft(project = 'General'): DecisionDraft {
  return {
    title: '',
    context: '',
    choice: '',
    date: todayISO(),
    project,
    decisionType: 'Strategy',
    owner: '',
    confidence: 'Medium',
    reversibility: 'Costly to reverse',
    tagsText: '',
    linksText: '',
    alternatives: [{ id: uid(), text: '', reason: '', almostChosen: false, rank: 1, secondBest: false, revived: false }],
    assumptions: [
      {
        id: uid(),
        text: '',
        confidence: 'Medium',
        impact: 'High',
        evidence: 'None',
        signal: '',
        status: 'Active',
        type: 'Other',
        owner: '',
      },
    ],
    killCriteria: [{ id: uid(), text: '', triggered: false, triggeredAt: '', clearedAt: '' }],
    commitments: [],
    scenarios: {
      unit: '',
      best: { value: '', probability: '' },
      base: { value: '', probability: '' },
      worst: { value: '', probability: '' },
    },
    expectedUpside: '',
    expectedDownside: '',
    horizon: '30 days',
    reviewDate: addDays(todayISO(), 14),
    reviewOutcome: '',
    grade: '',
    lessons: '',
    relatedIds: [],
  };
}
function draftFromDecision(d: Decision): DecisionDraft {
  return {
    title: d.title,
    context: d.context,
    choice: d.choice,
    date: d.date,
    project: d.project,
    decisionType: d.decisionType || 'Strategy',
    owner: d.owner || '',
    confidence: d.confidence,
    reversibility: d.reversibility || 'Costly to reverse',
    tagsText: (d.tags || []).join(', '),
    linksText: d.links.join('\n'),
    alternatives: d.alternatives.map((a, index) => ({ ...a, rank: a.rank || index + 1, secondBest: Boolean(a.secondBest), revived: Boolean(a.revived) })),
    assumptions: d.assumptions.map(a => ({ ...a, evidence: a.evidence || 'None' })),
    killCriteria: (d.killCriteria || []).length ? d.killCriteria.map(k => ({ ...k })) : [{ id: uid(), text: '', triggered: false, triggeredAt: '', clearedAt: '' }],
    commitments: (d.commitments || []).map(item => ({ ...item })),
    scenarios: d.scenarios || { unit: '', best: { value: '', probability: '' }, base: { value: '', probability: '' }, worst: { value: '', probability: '' } },
    expectedUpside: d.expectedUpside,
    expectedDownside: d.expectedDownside,
    horizon: d.horizon,
    reviewDate: d.reviewDate,
    reviewOutcome: d.reviewOutcome,
    grade: d.grade,
    lessons: d.lessons,
    relatedIds: [...d.relatedIds],
  };
}
function reviewBadge(d: Decision) {
  if (!isReviewDue(d)) return '';
  return d.reviewDate < todayISO() ? 'Overdue' : 'Due today';
}
function urgencyTone(level: UrgencyLevel) {
  if (level === 'Critical' || level === 'Urgent') return 'danger';
  if (level === 'Watch' || level === 'Aging') return 'warm';
  return 'neutral';
}
function slug(value: string) {
  return (
    (value || 'decision')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 56) || 'decision'
  );
}
function downloadText(
  filename: string,
  content: string,
  mime = 'text/markdown;charset=utf-8'
) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
function decisionMarkdown(d: Decision, decisions: Decision[]) {
  const linked = d.relatedIds
    .map(id => decisions.find(x => x.id === id))
    .filter(Boolean) as Decision[];
  const lines = [
    '# ' + d.title,
    '',
    '> Decision record',
    '',
    '- **Date:** ' + formatDate(d.date),
    '- **Project:** ' + d.project,
    '- **Decision owner:** ' + (d.owner || 'Unassigned'),
    '- **Decision type:** ' + (d.decisionType || 'Strategy'),
    '- **Reversibility:** ' + (d.reversibility || 'Costly to reverse'),
    '- **Tags:** ' + ((d.tags || []).join(', ') || 'None'),
    '- **Confidence:** ' + d.confidence,
    '- **Review date:** ' +
      (d.reviewDate ? formatDate(d.reviewDate) : 'Not scheduled'),
    '- **Decision grade:** ' + (d.grade || 'Not reviewed'),
    '',
    '## Context',
    d.context || 'Not recorded',
    '',
    '## Final choice',
    d.choice || 'Not recorded',
    '',
    '## Alternatives considered',
    ...(d.alternatives.filter(a => a.text.trim()).length
      ? d.alternatives
          .filter(a => a.text.trim())
          .sort((a, b) => (a.rank || 999) - (b.rank || 999))
          .map(
            (a, index) =>
              '- **Rank ' + (a.rank || index + 1) + '** ' +
              a.text +
              (a.secondBest ? ' **(second-best)**' : '') +
              (a.almostChosen ? ' **(almost chosen)**' : '') +
              (a.revived ? ' **(revived)**' : '') +
              (a.reason ? '\n  - Rejected because: ' + a.reason : '')
          )
      : ['- None recorded']),
    '',
    '## Assumptions',
    ...(d.assumptions.filter(a => a.text.trim()).length
      ? d.assumptions
          .filter(a => a.text.trim())
          .map(
            a =>
              '- **' +
              a.text +
              '** — status: ' +
              a.status +
              '; confidence: ' +
              a.confidence +
              '; impact if wrong: ' +
              a.impact +
              '; evidence: ' + (a.evidence || 'None') +
              '; risk score: ' + riskScore(a) + '/100' +
              '; type: ' +
              a.type +
              (a.signal ? '\n  - Monitoring signal: ' + a.signal : '')
          )
      : ['- None recorded']),
    '',
    '## Kill criteria',
    ...((d.killCriteria || []).filter(k => k.text.trim()).length
      ? d.killCriteria.filter(k => k.text.trim()).map(k =>
          '- [' + (k.triggered ? (k.clearedAt ? 'Triggered — reviewed' : 'TRIGGERED') : 'Open') + '] ' + k.text
        )
      : ['- None recorded']),
    '',
    '## Decision version history',
    ...((d.versions || []).length
      ? d.versions.slice().reverse().map(v => '- ' + formatDate(v.savedAt) + ': ' + v.summary)
      : ['- No edits recorded']),
    '',
    '## Expected outcomes',
    '### Upside',
    d.expectedUpside || 'Not recorded',
    '',
    '### Downside and risks',
    d.expectedDownside || 'Not recorded',
    '',
    '### Time horizon',
    d.horizon || 'Not recorded',
    '',
    '## Numeric scenarios',
    '- **Unit / metric:** ' + (d.scenarios.unit || 'Not specified'),
    ...(['best', 'base', 'worst'] as const).map(key =>
      '- **' + key[0].toUpperCase() + key.slice(1) + ' case:** ' +
      (d.scenarios[key].value || 'Not recorded') +
      (d.scenarios[key].probability ? ' (' + d.scenarios[key].probability + '% probability)' : '')
    ),
    '',
    '## Commitments',
    ...((d.commitments || []).filter(item => item.text.trim()).length
      ? d.commitments.filter(item => item.text.trim()).map(item =>
          '- [' + item.status + '] ' + item.text +
          ' — owner: ' + (item.owner || 'Unassigned') +
          '; due: ' + (item.dueDate ? formatDate(item.dueDate) : 'No due date')
        )
      : ['- None recorded']),
    '',
    '## Signal log',
    ...((d.signals || []).length
      ? d.signals.slice().sort((a, b) => a.date.localeCompare(b.date)).map(signal =>
          '- ' + formatDate(signal.date) + ' [' + signal.stance + '; ' + signal.targetType + '] ' + signal.observation
        )
      : ['- No observations logged']),
    '',
    '## Review outcome',
    d.reviewOutcome || 'Not reviewed',
    '',
    '## Lessons learned',
    d.lessons || 'Not recorded',
    '',
    '## Linked documents and links',
    ...(d.links.length ? d.links.map(link => '- ' + link) : ['- None']),
    '',
    '## Related decisions',
    ...(linked.length
      ? linked.map(x => '- ' + x.title + ' (' + formatDate(x.date) + ')')
      : ['- None']),
    '',
    '---',
    'Exported from Decision & Assumption Tracker.',
  ];
  return lines.join('\n');
}
function projectMarkdown(project: string, decisions: Decision[]) {
  const selected = decisions
    .filter(d => d.project === project)
    .sort((a, b) => b.date.localeCompare(a.date));
  return [
    '# Project decision log: ' + project,
    '',
    'Exported ' + formatDate(todayISO()) + ' · ' + selected.length + ' decision(s)',
    '',
    ...selected.flatMap((d, index) => [
      '---', '',
      '## ' + (index + 1) + '. ' + d.title, '',
      '- **Date:** ' + formatDate(d.date),
      '- **Project:** ' + d.project,
      '- **Decision type:** ' + (d.decisionType || 'Strategy'),
      '- **Choice:** ' + d.choice,
      '- **Confidence at decision:** ' + d.confidence,
      '- **Reversibility:** ' + (d.reversibility || 'Costly to reverse'),
      '- **Time horizon:** ' + (d.horizon || 'Not specified'),
      '- **Review date:** ' + (d.reviewDate ? formatDate(d.reviewDate) : 'Not scheduled'),
      '- **Review grade:** ' + (d.grade || (isReviewDue(d) ? 'Due' : 'Not graded')),
      '- **Tags:** ' + ((d.tags || []).join(', ') || 'None'),
      '- **Decision owner:** ' + (d.owner || 'Unassigned'),
      '',
      '### Context',
      d.context || 'No context recorded', '',
      '### Expected outcomes',
      '- **Upside:** ' + (d.expectedUpside || 'Not recorded'),
      '- **Downside:** ' + (d.expectedDownside || 'Not recorded'), '',
      '### Ranked alternatives',
      ...((d.alternatives || []).filter(a => a.text.trim()).length
        ? d.alternatives.filter(a => a.text.trim()).slice().sort((a,b)=>(a.rank || 999)-(b.rank || 999)).map(a =>
            '- **Rank ' + (a.rank || 1) + ':** ' + a.text +
            (a.secondBest ? ' (second-best)' : '') +
            (a.almostChosen ? ' (almost chosen)' : '') +
            (a.revived ? ' (revived)' : '') +
            (a.reason ? '\n  - Rejected because: ' + a.reason : '')
          )
        : ['- None recorded']), '',
      '### Numeric scenarios',
      '- **Unit / metric:** ' + (d.scenarios.unit || 'Not specified'),
      ...(['best', 'base', 'worst'] as const).map(key =>
        '- **' + key[0].toUpperCase() + key.slice(1) + ' case:** ' + (d.scenarios[key].value || 'Not recorded') +
        (d.scenarios[key].probability ? ' (' + d.scenarios[key].probability + '% probability)' : '')
      ),
      '',
      '### Commitments',
      ...((d.commitments || []).filter(item => item.text.trim()).length
        ? d.commitments.filter(item => item.text.trim()).map(item =>
            '- [' + item.status + '] ' + item.text + ' — owner: ' + (item.owner || 'Unassigned') +
            '; due: ' + (item.dueDate ? formatDate(item.dueDate) : 'No due date')
          )
        : ['- None recorded']),
      '',
      '### Signal log',
      ...((d.signals || []).length
        ? d.signals.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(signal =>
            '- ' + formatDate(signal.date) + ' [' + signal.stance + '; ' + signal.targetType + '] ' + signal.observation
          )
        : ['- No observations logged']),
      '',
      '### Assumptions and risk',
      ...((d.assumptions || []).filter(a => a.text.trim()).length
        ? d.assumptions.filter(a => a.text.trim()).map(a =>
            '- [' + a.status + '] ' + a.text +
            ' — confidence: ' + a.confidence +
            '; impact: ' + a.impact +
            '; evidence: ' + (a.evidence || 'None') +
            '; risk: ' + riskScore(a) + '/100' +
            '; type: ' + a.type +
            (a.signal ? '\n  - Monitoring signal: ' + a.signal : '')
          )
        : ['- None recorded']), '',
      '### Kill criteria',
      ...((d.killCriteria || []).filter(k => k.text.trim()).length
        ? d.killCriteria.filter(k => k.text.trim()).map(k =>
            '- [' + (k.triggered ? (k.clearedAt ? 'Triggered — reviewed' : 'TRIGGERED') : 'Open') + '] ' + k.text
          )
        : ['- None recorded']), '',
      '### Linked documents',
      ...(d.links.length ? d.links.map(link => '- ' + link) : ['- None']), '',
      '### Related decisions',
      ...(d.relatedIds.map(id => decisions.find(x => x.id === id)).filter(Boolean).length
        ? d.relatedIds.map(id => decisions.find(x => x.id === id)).filter(Boolean).map(x => '- ' + (x as Decision).title)
        : ['- None']), '',
      '### Review outcome and lessons',
      d.reviewOutcome || 'Not reviewed', '',
      d.lessons || 'No lessons recorded', '',
      '### Version history',
      ...((d.versions || []).length
        ? d.versions.slice().reverse().map(v => '- ' + formatDate(v.savedAt) + ': ' + v.summary)
        : ['- No edits recorded']), '',
    ]),
    '',
    '---',
    'Exported from Decision & Assumption Tracker.',
  ].join('\n');
}
function Badge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={'badge badge-' + tone}>{children}</span>;
}
function LevelSelect({
  value,
  onChange,
}: {
  value: Level;
  onChange: (value: Level) => void;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value as Level)}>
      <option>Low</option>
      <option>Medium</option>
      <option>High</option>
    </select>
  );
}
function gradeTone(grade: DecisionGrade) {
  if (grade === 'Good') return 'good';
  if (grade === 'Poor') return 'danger';
  if (grade === 'Acceptable') return 'warm';
  return 'neutral';
}
function statusTone(status: AssumptionStatus) {
  if (status === 'Confirmed') return 'good';
  if (status === 'Violated') return 'danger';
  if (status === 'Weakened' || status === 'Uncertain') return 'warm';
  if (status === 'Expired') return 'muted';
  return 'neutral';
}

function App() {
  const [store, setStore] = useState<Store>({ decisions: [], projects: ['General'] });
  const [activeView, setActiveView] = useState<View>('overview');
  const [activeProject, setActiveProject] = useState('All');
  const [confidenceFilter, setConfidenceFilter] = useState('All');
  const [riskFilter, setRiskFilter] = useState('All');
  const [reversibilityFilter, setReversibilityFilter] = useState('All');
  const [reviewFilter, setReviewFilter] = useState('All');
  const [tagFilter, setTagFilter] = useState('All');
  const [horizonFilter, setHorizonFilter] = useState('All');
  const [urgencyFilter, setUrgencyFilter] = useState('All');
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<'decision' | 'review' | null>(null);
  const [draft, setDraft] = useState<DecisionDraft>(() => emptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [showPremortem, setShowPremortem] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [captureMode, setCaptureMode] = useState<'Quick' | 'Deep'>('Quick');
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft>({
    actualOutcome: '',
    grade: 'Too early to tell',
    lessons: '',
    nextReviewDate: '',
    assumptionStatuses: {},
  });
  const [storageError, setStorageError] = useState(false);
  const [storeReady, setStoreReady] = useState(false);
  const [storageBackend, setStorageBackend] = useState<'IndexedDB' | 'localStorage'>('IndexedDB');

  useEffect(() => {
    let active = true;
    loadWorkspaceStore(readStore, STORAGE_KEY)
      .then(result => {
        if (!active) return;
        setStore(result.store);
        setStorageBackend(result.backend);
        setStorageError(false);
        setStoreReady(true);
      })
      .catch(() => {
        if (!active) return;
        setStore(readStore());
        setStorageBackend('localStorage');
        setStorageError(true);
        setStoreReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!storeReady) return;
    let active = true;
    saveWorkspaceStore(store, STORAGE_KEY)
      .then(result => {
        if (!active) return;
        setStorageBackend(result.backend);
        setStorageError(false);
      })
      .catch(() => {
        if (active) setStorageError(true);
      });
    return () => {
      active = false;
    };
  }, [store, storeReady]);

  const decisions = store.decisions;
  const projects = store.projects;
  const selectedDecision = decisions.find(d => d.id === selectedId) || null;
  const dueDecisions = useMemo(
    () =>
      decisions
        .filter(isReviewDue)
        .sort((a, b) => a.reviewDate.localeCompare(b.reviewDate)),
    [decisions]
  );
  const filteredDecisions = useMemo(() => {
    let list = [...decisions];
    if (activeView === 'reviews') list = list.filter(isReviewDue);
    if (activeView === 'violated')
      list = list.filter(d => d.assumptions.some(a => a.status === 'Violated'));
    if (activeView === 'high-impact')
      list = list.filter(d =>
        d.assumptions.some(a => a.impact === 'High' && a.status !== 'Expired')
      );
    if (activeView === 'bets')
      list = list.filter(d => d.assumptions.some(a =>
        a.impact === 'High' && a.confidence !== 'High' &&
        ['Active', 'Weakened', 'Uncertain'].includes(a.status)
      ));
    if (activeView === 'lessons') list = list.filter(d => Boolean(d.lessons.trim()));
    if (activeProject !== 'All')
      list = list.filter(d => d.project === activeProject);
    if (confidenceFilter !== 'All')
      list = list.filter(d => d.confidence === confidenceFilter);
    if (reversibilityFilter !== 'All')
      list = list.filter(d => d.reversibility === reversibilityFilter);
    if (reviewFilter === 'Due') list = list.filter(isReviewDue);
    if (reviewFilter === 'Reviewed') list = list.filter(d => Boolean(d.reviewedAt));
    if (reviewFilter === 'Unscheduled') list = list.filter(d => !d.reviewDate);
    if (riskFilter !== 'All') {
      const minimumRisk = riskFilter === '75+' ? 75 : 50;
      list = list.filter(d => d.assumptions.some(a =>
        riskScore(a) >= minimumRisk && ['Active', 'Weakened', 'Uncertain'].includes(a.status)
      ));
    }
    if (tagFilter !== 'All') list = list.filter(d => d.tags.includes(tagFilter));
    if (horizonFilter !== 'All') {
      list = list.filter(d => {
        const days = horizonDays(d.horizon);
        if (horizonFilter === 'Unspecified') return days === null;
        if (days === null) return false;
        if (horizonFilter === '30 days or less') return days <= 30;
        if (horizonFilter === '31–90 days') return days > 30 && days <= 90;
        return days > 90;
      });
    }
    if (urgencyFilter !== 'All') list = list.filter(d => urgencyInfo(d).level === urgencyFilter);
    const needle = query.trim().toLowerCase();
    if (needle) {
      list = list.filter(d =>
        [
          d.title,
          d.context,
          d.choice,
          d.project,
          d.decisionType,
          d.reversibility,
          d.expectedUpside,
          d.expectedDownside,
          d.reviewOutcome,
          d.lessons,
          ...d.tags,
          d.owner,
          d.scenarios.unit,
          d.scenarios.best.value,
          d.scenarios.base.value,
          d.scenarios.worst.value,
          ...d.commitments.flatMap(item => [item.text, item.owner, item.status]),
          ...d.signals.map(signal => signal.observation),
          ...d.killCriteria.map(k => k.text),
          ...d.assumptions.flatMap(a => [a.text, a.signal, a.type, a.status, a.evidence]),
          ...d.alternatives.flatMap(a => [a.text, a.reason]),
        ]
          .join(' ')
          .toLowerCase()
          .includes(needle)
      );
    }
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [decisions, activeView, activeProject, confidenceFilter, query, reversibilityFilter, reviewFilter, riskFilter, tagFilter, horizonFilter, urgencyFilter]);

  const allAssumptions = useMemo(
    () => decisions.flatMap(d => d.assumptions),
    [decisions]
  );
  const evaluatedAssumptions = allAssumptions.filter(
    a => a.status === 'Confirmed' || a.status === 'Violated'
  );
  const violatedCount = allAssumptions.filter(
    a => a.status === 'Violated'
  ).length;
  const violationRate = evaluatedAssumptions.length
    ? Math.round((violatedCount / evaluatedAssumptions.length) * 100)
    : null;
  const graded = decisions.filter(
    d => d.grade === 'Good' || d.grade === 'Acceptable' || d.grade === 'Poor'
  );
  const gradeScore = graded.length
    ? (
        graded.reduce(
          (sum, d) =>
            sum + (d.grade === 'Good' ? 3 : d.grade === 'Acceptable' ? 2 : 1),
          0
        ) / graded.length
      ).toFixed(1)
    : null;
  const violatedTypes = allAssumptions
    .filter(a => a.status === 'Violated')
    .reduce<Record<string, number>>((acc, a) => {
      acc[a.type] = (acc[a.type] || 0) + 1;
      return acc;
    }, {});
  const topViolatedType = Object.entries(violatedTypes).sort(
    (a, b) => b[1] - a[1]
  )[0];
  const decisionTypeOutcomes = Array.from(new Set(decisions.map(d => d.decisionType || 'Strategy')))
    .map(type => {
      const evaluated = decisions.filter(d => d.decisionType === type && ['Good', 'Acceptable', 'Poor'].includes(d.grade));
      const poor = evaluated.filter(d => d.grade === 'Poor').length;
      return { type, evaluated: evaluated.length, poor, poorRate: evaluated.length ? Math.round(poor / evaluated.length * 100) : null };
    })
    .filter(item => item.evaluated > 0)
    .sort((a, b) => (b.poorRate || 0) - (a.poorRate || 0) || b.poor - a.poor);
  const highConfidenceEvaluated = evaluatedAssumptions.filter(a => a.confidence === 'High');
  const highConfidenceConfirmed = highConfidenceEvaluated.filter(a => a.status === 'Confirmed').length;
  const highConfidenceViolated = highConfidenceEvaluated.filter(a => a.status === 'Violated').length;
  const highConfidenceAccuracy = highConfidenceEvaluated.length
    ? Math.round((highConfidenceConfirmed / highConfidenceEvaluated.length) * 100)
    : null;
  const confidenceCalibration = (['Low', 'Medium', 'High'] as Level[]).map(level => {
    const evaluated = evaluatedAssumptions.filter(a => a.confidence === level);
    const correct = evaluated.filter(a => a.status === 'Confirmed').length;
    const actual = evaluated.length ? Math.round((correct / evaluated.length) * 100) : null;
    const expected = level === 'High' ? 85 : level === 'Medium' ? 60 : 35;
    return { level, evaluated: evaluated.length, correct, wrong: evaluated.length - correct, actual, expected, gap: actual === null ? null : actual - expected };
  });
  const openHighRiskAssumptions = decisions.flatMap(d =>
    d.assumptions
      .filter(a => riskScore(a) >= 50 && ['Active', 'Weakened', 'Uncertain'].includes(a.status))
      .map(a => ({ decision: d, assumption: a }))
  );
  const availableTags = Array.from(new Set(decisions.flatMap(d => d.tags))).sort();

  function beginNewDecision(templateName?: string) {
    const base = emptyDraft(
      activeProject !== 'All' ? activeProject : projects[0] || 'General'
    );
    const template = TEMPLATES.find(t => t.name === templateName);
    if (template) {
      base.title = template.title;
      base.context = template.context;
      base.decisionType = template.name.startsWith('Hire')
        ? 'Hire'
        : template.name.includes('Build')
          ? 'Build vs Buy'
          : template.name.includes('Launch')
            ? 'Launch'
            : 'Investment';
      base.alternatives = template.options.map((option, index) => ({
        id: uid(),
        text: option,
        reason: '',
        almostChosen: false,
        rank: index + 1,
        secondBest: index === 1,
        revived: false,
      }));
    }
    setCaptureMode('Quick');
    setDraft(base);
    setEditingId(null);
    setFormError('');
    setShowPremortem(false);
    setSelectedId(null);
    setModal('decision');
  }
  function beginEditDecision(d: Decision) {
    setCaptureMode('Deep');
    setDraft(draftFromDecision(d));
    setEditingId(d.id);
    setFormError('');
    setShowPremortem(false);
    setModal('decision');
  }
  function updateAlternative(id: string, patch: Partial<Alternative>) {
    setDraft(prev => ({
      ...prev,
      alternatives: prev.alternatives.map(a =>
        a.id === id
          ? { ...a, ...patch }
          : patch.secondBest ? { ...a, secondBest: false } : a
      ),
    }));
  }
  function updateAlternativeRank(id: string, rank: number) {
    setDraft(prev => {
      const current = prev.alternatives.find(a => a.id === id);
      const oldRank = current?.rank || 1;
      return {
        ...prev,
        alternatives: prev.alternatives.map(a =>
          a.id === id ? { ...a, rank }
            : a.rank === rank ? { ...a, rank: oldRank } : a
        ),
      };
    });
  }
  function updateAssumption(id: string, patch: Partial<Assumption>) {
    setDraft(prev => ({
      ...prev,
      assumptions: prev.assumptions.map(a =>
        a.id === id ? { ...a, ...patch } : a
      ),
    }));
  }
  function saveDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim()) {
      setFormError('Add a short title so you can find this decision later.');
      return;
    }
    if (!draft.choice.trim()) {
      setFormError('Record the final choice before saving.');
      return;
    }
    const scenarioProbabilities = [
      draft.scenarios.best.probability,
      draft.scenarios.base.probability,
      draft.scenarios.worst.probability,
    ];
    const hasScenarioProbabilities = scenarioProbabilities.some(value => value.trim() !== '');
    if (
      hasScenarioProbabilities &&
      (scenarioProbabilities.some(value => value.trim() === '') ||
        Math.abs(scenarioProbabilities.reduce((sum, value) => sum + Number(value), 0) - 100) > 0.01)
    ) {
      setFormError('Enter all three scenario probabilities and make their total 100%, or leave all three blank.');
      return;
    }
    const existing = editingId
      ? decisions.find(d => d.id === editingId)
      : undefined;
    const record: Decision = {
      id: editingId || uid(),
      title: draft.title.trim(),
      context: draft.context.trim(),
      choice: draft.choice.trim(),
      date: draft.date || todayISO(),
      project: draft.project.trim() || 'General',
      decisionType: draft.decisionType,
      owner: draft.owner.trim(),
      confidence: draft.confidence,
      reversibility: draft.reversibility,
      tags: draft.tagsText.split(',').map(tag => tag.trim()).filter(Boolean),
      links: draft.linksText
        .split('\n')
        .map(x => x.trim())
        .filter(Boolean),
      alternatives: draft.alternatives
        .filter(a => a.text.trim())
        .sort((a, b) => a.rank - b.rank)
        .map((a, index) => ({ ...a, rank: index + 1, text: a.text.trim(), reason: a.reason.trim() })),
      assumptions: draft.assumptions
        .filter(a => a.text.trim())
        .map(a => ({ ...a, text: a.text.trim(), signal: a.signal.trim(), evidence: a.evidence || 'None', owner: a.owner.trim() })),
      commitments: draft.commitments.filter(item => item.text.trim()).map(item => ({
        ...item,
        text: item.text.trim(),
        owner: item.owner.trim(),
        dueDate: item.dueDate || '',
        status: item.status || 'Open',
      })),
      scenarios: {
        unit: draft.scenarios.unit.trim(),
        best: { ...draft.scenarios.best },
        base: { ...draft.scenarios.base },
        worst: { ...draft.scenarios.worst },
      },
      signals: existing?.signals || [],
      killCriteria: draft.killCriteria.filter(k => k.text.trim()).map(k => ({ ...k, text: k.text.trim() })),
      versions: existing ? [...(existing.versions || []), createVersion(existing, 'Previous state · changed fields: ' + describeDecisionChanges(existing, draft))] : [],
      expectedUpside: draft.expectedUpside.trim(),
      expectedDownside: draft.expectedDownside.trim(),
      horizon: draft.horizon.trim(),
      reviewDate: draft.reviewDate,
      reviewOutcome: existing?.reviewOutcome || draft.reviewOutcome,
      grade: existing?.grade || draft.grade,
      lessons: existing?.lessons || draft.lessons,
      relatedIds: draft.relatedIds.filter(id => id !== (editingId || '')),
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      reviewedAt: existing?.reviewedAt || '',
    };
    setStore(prev => ({
      projects: Array.from(new Set([...prev.projects, record.project])).sort(
        (a, b) => a.localeCompare(b)
      ),
      decisions: existing
        ? prev.decisions.map(d =>
            d.id === record.id ? record : { ...d, relatedIds: d.relatedIds }
          )
        : [record, ...prev.decisions],
    }));
    setSelectedId(record.id);
    setActiveView('all');
    setActiveProject('All');
    setModal(null);
    setFormError('');
  }
  function addSignal(decisionId: string, signal: Omit<SignalLog, 'id'>) {
    const entry: SignalLog = { ...signal, id: uid() };
    setStore(prev => ({
      ...prev,
      decisions: prev.decisions.map(d => d.id === decisionId
        ? { ...d, signals: [...(d.signals || []), entry], updatedAt: new Date().toISOString() }
        : d
      ),
    }));
  }
  function setCommitmentStatus(decisionId: string, commitmentId: string, status: CommitmentStatus) {
    const current = decisions.find(d => d.id === decisionId);
    if (!current) return;
    const item = current.commitments.find(commitment => commitment.id === commitmentId);
    if (!item || item.status === status) return;
    setStore(prev => ({
      ...prev,
      decisions: prev.decisions.map(d => d.id !== decisionId ? d : ({
        ...d,
        updatedAt: new Date().toISOString(),
        versions: [...(d.versions || []), createVersion(d, 'Before commitment status changed: ' + item.text + ' (' + item.status + ' → ' + status + ')')],
        commitments: d.commitments.map(commitment => commitment.id === commitmentId
          ? { ...commitment, status, completedAt: status === 'Done' ? todayISO() : '' }
          : commitment
        ),
      })),
    }));
  }
  function deleteDecision(d: Decision) {
    if (
      !window.confirm(
        'Delete “' +
          d.title +
          '”? This cannot be undone. Export it first if you need a copy.'
      )
    )
      return;
    setStore(prev => ({
      ...prev,
      decisions: prev.decisions
        .filter(x => x.id !== d.id)
        .map(x => ({
          ...x,
          relatedIds: x.relatedIds.filter(id => id !== d.id),
        })),
    }));
    setSelectedId(null);
  }
  function beginReview(d: Decision) {
    const assumptionStatuses: Record<string, AssumptionStatus> = {};
    d.assumptions.forEach(a => {
      assumptionStatuses[a.id] = a.status === 'Active' ? 'Uncertain' : a.status;
    });
    setReviewDraft({
      actualOutcome: d.reviewOutcome,
      grade: d.grade || 'Too early to tell',
      lessons: d.lessons,
      nextReviewDate: '',
      assumptionStatuses,
    });
    setModal('review');
  }
  function saveReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDecision) return;
    const reviewedAt = todayISO();
    const updated: Decision = {
      ...selectedDecision,
      reviewOutcome: reviewDraft.actualOutcome.trim(),
      grade: reviewDraft.grade,
      lessons: reviewDraft.lessons.trim(),
      reviewDate: reviewDraft.nextReviewDate,
      reviewedAt,
      updatedAt: new Date().toISOString(),
      assumptions: selectedDecision.assumptions.map(a => ({
        ...a,
        status: reviewDraft.assumptionStatuses[a.id] || a.status,
      })),
      killCriteria: selectedDecision.killCriteria.map(k =>
        k.triggered && !k.clearedAt ? { ...k, clearedAt: new Date().toISOString() } : k
      ),
      versions: [...(selectedDecision.versions || []), createVersion(selectedDecision, 'Previous state before review: outcome, assumption verdicts, grade, and lesson')],
    };
    setStore(prev => ({
      ...prev,
      decisions: prev.decisions.map(d => (d.id === updated.id ? updated : d)),
    }));
    setModal(null);
  }
  function triggerKillCriterion(decisionId: string, criterionId: string) {
    const target = decisions.find(d => d.id === decisionId);
    const criterion = target?.killCriteria.find(k => k.id === criterionId);
    if (!target || !criterion || criterion.triggered) return;
    if (!window.confirm('Mark this kill criterion as triggered? The decision will be flagged for immediate review.')) return;
    const updatedAt = new Date().toISOString();
    setStore(prev => ({
      ...prev,
      decisions: prev.decisions.map(d => d.id !== decisionId ? d : ({
        ...d,
        reviewDate: todayISO(),
        reviewedAt: '',
        updatedAt,
        versions: [...(d.versions || []), createVersion(d, 'Before kill criterion triggered: ' + criterion.text)],
        killCriteria: d.killCriteria.map(k => k.id === criterionId ? { ...k, triggered: true, triggeredAt: updatedAt, clearedAt: '' } : k),
      })),
    }));
  }
  function reviveAlternative(decisionId: string, alternativeId: string) {
    const current = decisions.find(d => d.id === decisionId);
    const alternative = current?.alternatives.find(a => a.id === alternativeId);
    if (!current || !alternative) return;
    setStore(prev => ({
      ...prev,
      decisions: prev.decisions.map(d => d.id !== decisionId ? d : ({
        ...d,
        updatedAt: new Date().toISOString(),
        versions: [...(d.versions || []), createVersion(d, 'Before reviving alternative: ' + alternative.text)],
        alternatives: d.alternatives.map(a => a.id === alternativeId ? { ...a, revived: true } : a),
      })),
    }));
  }
  function addProject() {
    const name = newProjectName.trim();
    if (!name) return;
    if (!projects.some(p => p.toLowerCase() === name.toLowerCase())) {
      setStore(prev => ({
        ...prev,
        projects: [...prev.projects, name].sort((a, b) => a.localeCompare(b)),
      }));
    }
    setNewProjectName('');
  }
  function exportDecision(d: Decision) {
    downloadText(slug(d.title) + '.md', decisionMarkdown(d, decisions));
  }
  function exportProject(project: string) {
    downloadText(
      slug(project) + '-decision-log.md',
      projectMarkdown(project, decisions)
    );
  }
  function exportBackup() {
    downloadText(
      'decision-tracker-backup.json',
      JSON.stringify(
        { exportedAt: new Date().toISOString(), ...store },
        null,
        2
      ),
      'application/json;charset=utf-8'
    );
  }
  function escapeHtmlText(value: unknown) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function printProject(project: string) {
    const selected = decisions
      .filter(d => d.project === project)
      .sort((a, b) => b.date.localeCompare(a.date));
    const popup = window.open('', '_blank');
    if (!popup) {
      window.alert('Allow pop-ups to print the complete project record.');
      return;
    }
    const entries = selected.map(d => {
      const alternatives = d.alternatives
        .slice()
        .sort((a, b) => (a.rank || 999) - (b.rank || 999))
        .filter(a => a.text.trim())
        .map(a => '<li><strong>Rank ' + (a.rank || 1) + ': ' + escapeHtmlText(a.text) + '</strong>' +
          (a.secondBest ? ' <b>(second-best)</b>' : '') +
          (a.revived ? ' <b>(revived)</b>' : '') +
          '<p>Rejected because: ' + escapeHtmlText(a.reason || 'Not recorded') + '</p></li>').join('');
      const assumptions = d.assumptions.filter(a => a.text.trim()).map(a =>
        '<li><strong>' + escapeHtmlText(a.text) + '</strong> — ' + escapeHtmlText(a.status) +
        '; confidence ' + escapeHtmlText(a.confidence) +
        '; impact ' + escapeHtmlText(a.impact) +
        '; evidence ' + escapeHtmlText(a.evidence || 'None') +
        '; risk ' + riskScore(a) + '/100' +
        (a.signal ? '<p>Monitoring signal: ' + escapeHtmlText(a.signal) + '</p>' : '') + '</li>'
      ).join('');
      const criteria = d.killCriteria.filter(k => k.text.trim()).map(k =>
        '<li>' + (k.triggered ? (k.clearedAt ? 'Triggered and reviewed: ' : 'TRIGGERED — review required: ') : 'Open: ') +
        escapeHtmlText(k.text) + '</li>'
      ).join('');
      const history = (d.versions || []).slice().reverse().map(v =>
        '<li>' + escapeHtmlText(formatDate(v.savedAt)) + ' — ' + escapeHtmlText(v.summary) + '</li>'
      ).join('');
      const scenarios = (['best', 'base', 'worst'] as const).map(key =>
        '<li><strong>' + key.toUpperCase() + ':</strong> ' + escapeHtmlText(d.scenarios[key].value || 'Not recorded') +
        (d.scenarios[key].probability ? ' (' + escapeHtmlText(d.scenarios[key].probability) + '% probability)' : '') + '</li>'
      ).join('');
      const commitments = (d.commitments || []).filter(item => item.text.trim()).map(item =>
        '<li>[' + escapeHtmlText(item.status) + '] ' + escapeHtmlText(item.text) +
        ' — owner: ' + escapeHtmlText(item.owner || 'Unassigned') +
        '; due: ' + escapeHtmlText(item.dueDate ? formatDate(item.dueDate) : 'No due date') + '</li>'
      ).join('');
      const signals = (d.signals || []).slice().sort((a,b)=>a.date.localeCompare(b.date)).map(signal =>
        '<li>' + escapeHtmlText(formatDate(signal.date)) + ' [' + escapeHtmlText(signal.stance) +
        '; ' + escapeHtmlText(signal.targetType) + '] ' + escapeHtmlText(signal.observation) + '</li>'
      ).join('');
      return '<article><h2>' + escapeHtmlText(d.title) + '</h2>' +
        '<p class="meta">' + escapeHtmlText(formatDate(d.date)) + ' · ' + escapeHtmlText(d.decisionType || 'Strategy') + ' · ' +
        escapeHtmlText(d.confidence) + ' confidence · ' + escapeHtmlText(d.reversibility || 'Costly to reverse') + '</p>' +
        '<p class="meta">Decision owner: ' + escapeHtmlText(d.owner || 'Unassigned') + '</p>' +
        '<h3>Context</h3><p>' + escapeHtmlText(d.context || 'Not recorded') + '</p>' +
        '<h3>Final choice</h3><p><strong>' + escapeHtmlText(d.choice) + '</strong></p>' +
        '<div class="two"><section><h3>Expected upside</h3><p>' + escapeHtmlText(d.expectedUpside || 'Not recorded') + '</p></section>' +
        '<section><h3>Expected downside</h3><p>' + escapeHtmlText(d.expectedDownside || 'Not recorded') + '</p></section></div>' +
        '<p class="meta">Time horizon: ' + escapeHtmlText(d.horizon || 'Not set') +
        ' · Review: ' + escapeHtmlText(d.reviewDate ? formatDate(d.reviewDate) : 'Not scheduled') +
        ' · Grade: ' + escapeHtmlText(d.grade || 'Not reviewed') + '</p>' +
        '<h3>Numeric scenarios (' + escapeHtmlText(d.scenarios.unit || 'unit not specified') + ')</h3><ul>' + (scenarios || '<li>None recorded</li>') + '</ul>' +
        '<h3>Ranked alternatives</h3><ol>' + (alternatives || '<li>None recorded</li>') + '</ol>' +
        '<h3>Assumptions and risk</h3><ul>' + (assumptions || '<li>None recorded</li>') + '</ul>' +
        '<h3>Commitments</h3><ul>' + (commitments || '<li>None recorded</li>') + '</ul>' +
        '<h3>Signal log</h3><ul>' + (signals || '<li>No observations logged</li>') + '</ul>' +
        '<h3>Kill criteria</h3><ul>' + (criteria || '<li>None recorded</li>') + '</ul>' +
        '<h3>Observed outcome</h3><p>' + escapeHtmlText(d.reviewOutcome || 'Not reviewed') + '</p>' +
        '<h3>Lessons learned</h3><p>' + escapeHtmlText(d.lessons || 'Not recorded') + '</p>' +
        '<h3>Version history</h3><ul>' + (history || '<li>No edits recorded</li>') + '</ul></article>';
    }).join('');
    const page = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' +
      escapeHtmlText(project) + ' — Decision Ledger</title><style>' +
      'body{font:12px/1.55 Arial,sans-serif;max-width:900px;margin:32px auto;padding:0 24px;color:#18202b}' +
      'h1{font-size:26px;margin-bottom:4px}h2{font-size:19px;margin:0 0 4px}h3{font-size:13px;margin:15px 0 5px;color:#35435b}' +
      'p{margin:4px 0 8px;white-space:pre-wrap;overflow-wrap:anywhere}.meta{color:#697386;font-size:10px}' +
      'article{border-top:2px solid #cad1dc;padding:22px 0;break-inside:avoid}article:first-of-type{margin-top:22px}' +
      'li{margin:5px 0}.two{display:grid;grid-template-columns:1fr 1fr;gap:24px}.two section{background:#f5f7fa;padding:10px;border:1px solid #e1e5eb;border-radius:6px}' +
      '@media print{body{margin:0 auto;padding:0 12px}article{break-inside:avoid}.two{break-inside:avoid}}' +
      '@media(max-width:600px){body{padding:0 12px}.two{grid-template-columns:1fr}}' +
      '</style></head><body><header><h1>Project decision log: ' + escapeHtmlText(project) +
      '</h1><p class="meta">' + selected.length + ' decision(s) · Exported ' + escapeHtmlText(formatDate(todayISO())) +
      '</p></header>' + (entries || '<p>No decisions recorded for this project.</p>') +
      '</body></html>';
    popup.document.open();
    popup.document.write(page);
    popup.document.close();
    popup.focus();
    window.setTimeout(() => popup.print(), 250);
  }

  function printCurrent() {
    window.print();
  }
  function addPremortemPrompt(prompt: string) {
    setDraft(prev => ({
      ...prev,
      expectedDownside: prev.expectedDownside.trim()
        ? prev.expectedDownside.trim() + '\n\n' + prompt
        : prompt,
    }));
  }
  function selectView(view: View) {
    setActiveView(view);
    setSelectedId(null);
    setQuery('');
    if (
      view !== 'all' &&
      view !== 'reviews' &&
      view !== 'violated' &&
      view !== 'high-impact'
    ) {
      setActiveProject('All');
      setConfidenceFilter('All');
    }
  }

  const navItems: {
    id: View;
    label: string;
    icon: React.ReactNode;
    count?: number;
    group: 'Workspace' | 'Risk & attention' | 'Analysis & learning';
  }[] = [
    { id: 'overview', label: 'Overview', icon: <Activity size={17} />, group: 'Workspace' },
    { id: 'all', label: 'All decisions', icon: <ClipboardList size={17} />, count: decisions.length, group: 'Workspace' },
    { id: 'reviews', label: 'Open reviews', icon: <CalendarClock size={17} />, count: dueDecisions.length, group: 'Workspace' },
    { id: 'projects', label: 'Projects', icon: <FolderKanban size={17} />, group: 'Workspace' },
    { id: 'violated', label: 'Violated assumptions', icon: <ShieldAlert size={17} />, count: violatedCount, group: 'Risk & attention' },
    { id: 'high-impact', label: 'High-impact risks', icon: <Target size={17} />, group: 'Risk & attention' },
    { id: 'portfolio', label: 'Portfolio risk', icon: <ShieldAlert size={17} />, count: openHighRiskAssumptions.length, group: 'Risk & attention' },
    { id: 'bets', label: 'Strategic bets', icon: <Target size={17} />, group: 'Risk & attention' },
    { id: 'dependencies', label: 'Dependencies', icon: <GitBranch size={17} />, group: 'Analysis & learning' },
    { id: 'compare', label: 'Compare decisions', icon: <ListChecks size={17} />, group: 'Analysis & learning' },
    { id: 'lessons', label: 'Lessons library', icon: <Lightbulb size={17} />, group: 'Analysis & learning' },
    { id: 'stats', label: 'Learning stats', icon: <BarChart3 size={17} />, group: 'Analysis & learning' },
  ];
  const navGroups = [
    { label: 'WORKSPACE', items: navItems.filter(item => item.group === 'Workspace') },
    { label: 'RISK & ATTENTION', items: navItems.filter(item => item.group === 'Risk & attention') },
    { label: 'ANALYSIS & LEARNING', items: navItems.filter(item => item.group === 'Analysis & learning') },
  ];
  const listTitle =
    activeView === 'reviews' ? 'Open reviews'
      : activeView === 'violated' ? 'Decisions with violated assumptions'
      : activeView === 'high-impact' ? 'High-impact assumptions'
      : activeView === 'all' ? 'All decisions'
      : activeView === 'bets' ? 'Strategic bets'
      : activeView === 'lessons' ? 'Lessons library'
      : activeView === 'portfolio' ? 'Portfolio risk'
      : activeView === 'dependencies' ? 'Decision dependencies'
      : activeView === 'compare' ? 'Compare decisions'
      : 'Decision log';

  if (!storeReady) {
    return (
      <div className="app-shell" aria-busy="true">
        <main className="workspace" role="status" aria-live="polite">
          <div className="eyebrow">LOCAL WORKSPACE</div>
          <h1>Loading your decisions…</h1>
          <p className="page-subtitle">
            Opening the on-device workspace and checking for previously saved data.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className={"sidebar" + (mobileNavOpen ? " mobile-nav-open" : "")}>
        <div className="brand-lockup">
          <div className="brand-mark">
            <GitBranch size={20} />
          </div>
          <div>
            <div className="brand-name">Decision Ledger</div>
            <div className="brand-caption">Think clearly. Learn honestly.</div>
          </div>
        </div>
        <button
          className="primary-button new-decision-sidebar"
          type="button"
          onClick={() => beginNewDecision()}
        >
          <Plus size={17} /> New decision <span className="shortcut">N</span>
        </button>
        <nav className="primary-navigation" id="primary-navigation" aria-label="Primary navigation">
          {navGroups.map(group => (
            <section className="nav-section" key={group.label}>
              <div className="nav-caption">{group.label}</div>
              <div className="main-nav">
                {group.items.map(item => {
                  const isActive = (!selectedId && activeView === item.id) || (Boolean(selectedId) && item.id === 'all');
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={'nav-item ' + (isActive ? 'active' : '')}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={() => {
                        selectView(item.id);
                        setMobileNavOpen(false);
                      }}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                      {typeof item.count === 'number' && (
                        <span className={'nav-count ' + ((item.id === 'reviews' || item.id === 'violated') && item.count > 0 ? 'count-alert' : '')}>
                          {item.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-status">
            <span className="status-dot" />
            {storageError ? 'Storage unavailable' : storageBackend === 'IndexedDB' ? 'Stored on this device' : 'Browser storage fallback'}
          </div>
          <div className="privacy-note">
            Private by default. No account, cloud sync, or tracking.
          </div>
          <button
            className="subtle-button backup-button"
            type="button"
            onClick={exportBackup}
          >
            <Download size={15} /> Export data backup
          </button>
        </div>
      </aside>
      {mobileNavOpen && (
        <button type="button" className="mobile-nav-backdrop" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />
      )}

      <main className="main-area">
        <header className="topbar">
          <button
            className="mobile-nav-toggle secondary-button"
            type="button"
            aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobileNavOpen}
            aria-controls="primary-navigation"
            onClick={() => setMobileNavOpen(open => !open)}
          >
            {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <div className="topbar-context">
            <div className="eyebrow">DECISION QUALITY WORKSPACE</div>
            <div className="page-heading">
              {selectedDecision ? (
                <>
                  <button
                    className="back-button"
                    type="button"
                    onClick={() => setSelectedId(null)}
                    aria-label="Back to list"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <span>{selectedDecision.title}</span>
                </>
              ) : activeView === 'overview' ? (
                'Overview'
              ) : activeView === 'projects' ? (
                'Projects'
              ) : activeView === 'stats' ? (
                'Learning stats'
              ) : (
                listTitle
              )}
            </div>
          </div>
          <div className="topbar-meta">
            <span>{selectedDecision ? selectedDecision.project : activeProject === 'All' ? 'All projects' : activeProject}</span>
            <span className="topbar-meta-divider">/</span>
            <span>{selectedDecision ? 'Decision record' : decisions.length + ' decision' + (decisions.length === 1 ? '' : 's')}</span>
          </div>
          <div className="topbar-actions">
            <div className="privacy-chip">
              <span className="status-dot" /> Local-first
            </div>
            <button
              className="primary-button"
              type="button"
              onClick={() => beginNewDecision()}
            >
              <Plus size={16} />
              <span>New decision</span>
            </button>
          </div>
        </header>

        <div className="workspace">
          {(storageError || storageBackend === 'localStorage') && (
            <section className={'storage-alert ' + (storageError ? 'storage-alert-error' : 'storage-alert-warning')} role="alert">
              <ShieldAlert size={18} />
              <div>
                <strong>{storageError ? 'Local saving needs attention' : 'Using browser-storage fallback'}</strong>
                <p>
                  {storageError
                    ? 'The app could not confirm that your latest changes were saved. Export a backup and check available browser storage.'
                    : 'IndexedDB is unavailable in this browser context. Data is still kept locally, but export a backup before clearing site data.'}
                </p>
              </div>
              <button className="secondary-button" type="button" onClick={exportBackup}>
                <Download size={15} /> Export backup
              </button>
            </section>
          )}
          {selectedDecision ? (
            <DecisionDetail
              decision={selectedDecision}
              decisions={decisions}
              onBack={() => setSelectedId(null)}
              onEdit={() => beginEditDecision(selectedDecision)}
              onReview={() => beginReview(selectedDecision)}
              onDelete={() => deleteDecision(selectedDecision)}
              onExport={() => exportDecision(selectedDecision)}
              onPrint={printCurrent}
              onOpenRelated={id => setSelectedId(id)}
              onTriggerKill={criterionId => triggerKillCriterion(selectedDecision.id, criterionId)}
              onReviveAlternative={alternativeId => reviveAlternative(selectedDecision.id, alternativeId)}
              onAddSignal={signal => addSignal(selectedDecision.id, signal)}
              onSetCommitmentStatus={(commitmentId, status) => setCommitmentStatus(selectedDecision.id, commitmentId, status)}
            />
          ) : activeView === 'overview' ? (
            <div className="page-content overview-page">
              <div className="welcome-row">
                <div>
                  <h1>Make the reasoning visible.</h1>
                  <p className="page-subtitle">
                    Capture what you chose, what you believe, and what reality
                    teaches you later.
                  </p>
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={exportBackup}
                >
                  <Download size={16} /> Back up data
                </button>
              </div>
              <div className="metric-grid">
                <MetricCard
                  label="DECISIONS LOGGED"
                  value={String(decisions.length)}
                  hint={
                    projects.length +
                    ' project' +
                    (projects.length === 1 ? '' : 's')
                  }
                  icon={<ClipboardList size={18} />}
                />
                <MetricCard
                  label="REVIEWS DUE"
                  value={String(dueDecisions.length)}
                  hint={
                    dueDecisions.length
                      ? 'Reality check needed'
                      : 'Nothing overdue'
                  }
                  icon={<CalendarClock size={18} />}
                  emphasis={dueDecisions.length > 0}
                />
                <MetricCard
                  label="ASSUMPTIONS VIOLATED"
                  value={String(violatedCount)}
                  hint={allAssumptions.length + ' assumptions logged'}
                  icon={<ShieldAlert size={18} />}
                  emphasis={violatedCount > 0}
                />
                <MetricCard
                  label="ASSUMPTION VIOLATION RATE"
                  value={violationRate === null ? '—' : violationRate + '%'}
                  hint={
                    evaluatedAssumptions.length
                      ? evaluatedAssumptions.length + ' evaluated'
                      : 'After your first review'
                  }
                  icon={<Target size={18} />}
                />
              </div>

              <div className="content-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <div className="section-kicker">ATTENTION</div>
                      <h2>Reviews to make</h2>
                    </div>
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => selectView('reviews')}
                    >
                      View all <ArrowUpRight size={14} />
                    </button>
                  </div>
                  {dueDecisions.length ? (
                    <div className="compact-list">
                      {dueDecisions.slice(0, 5).map(d => (
                        <DecisionCompact
                          key={d.id}
                          decision={d}
                          onClick={() => setSelectedId(d.id)}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={<CheckCircle2 size={21} />}
                      title="No reviews due"
                      description="Set a review date when you capture a decision. This is where overdue reality checks will appear."
                    />
                  )}
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <div className="section-kicker">RECENT WORK</div>
                      <h2>Latest decisions</h2>
                    </div>
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => selectView('all')}
                    >
                      All decisions <ArrowUpRight size={14} />
                    </button>
                  </div>
                  {decisions.length ? (
                    <div className="compact-list">
                      {[...decisions]
                        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                        .slice(0, 5)
                        .map(d => (
                          <DecisionCompact
                            key={d.id}
                            decision={d}
                            onClick={() => setSelectedId(d.id)}
                          />
                        ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={<Lightbulb size={21} />}
                      title="Start with a real decision"
                      description="Capture a choice you made recently. Add the beliefs it depends on, then schedule a review."
                      action={
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => beginNewDecision()}
                        >
                          Create your first decision <ArrowUpRight size={14} />
                        </button>
                      }
                    />
                  )}
                </section>
              </div>
              <section className="principle-strip">
                <div className="principle-icon">
                  <Sparkles size={18} />
                </div>
                <div>
                  <strong>
                    Judge the process separately from the outcome.
                  </strong>
                  <p>
                    A sound decision can get unlucky. A weak decision can get
                    lucky. Track the assumptions and evidence so the lesson is
                    useful, not just comforting.
                  </p>
                </div>
              </section>
              <div className="bottom-row">
                <div className="mini-stat">
                  <span>Average decision grade</span>
                  <strong>
                    {gradeScore === null
                      ? 'Not enough reviews'
                      : gradeScore + ' / 3'}
                  </strong>
                  <small>Good = 3 · Acceptable = 2 · Poor = 1</small>
                </div>
                <div className="mini-stat">
                  <span>Most violated assumption type</span>
                  <strong>
                    {topViolatedType ? topViolatedType[0] : 'No pattern yet'}
                  </strong>
                  <small>
                    {topViolatedType
                      ? topViolatedType[1] + ' violation(s) recorded'
                      : 'Patterns appear after reviews'}
                  </small>
                </div>
                <button
                  className="outline-button"
                  type="button"
                  onClick={() => selectView('stats')}
                >
                  Explore learning stats <BarChart3 size={16} />
                </button>
              </div>
            </div>
          ) : activeView === 'projects' ? (
            <div className="page-content">
              <div className="page-intro-row">
                <div>
                  <h1>Projects</h1>
                  <p className="page-subtitle">
                    Keep decisions grouped by the work or life area they affect.
                  </p>
                </div>
              </div>
              <section className="panel project-add-panel">
                <div>
                  <h2>Add a project</h2>
                  <p className="muted-text">
                    Projects are local labels. Existing decision records are
                    never moved automatically.
                  </p>
                </div>
                <form
                  className="inline-add-form"
                  onSubmit={e => {
                    e.preventDefault();
                    addProject();
                  }}
                >
                  <input
                    value={newProjectName}
                    onChange={e => setNewProjectName(e.target.value)}
                    placeholder="e.g. Product launch, Hiring, Personal"
                    aria-label="New project name"
                  />
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={!newProjectName.trim()}
                  >
                    <Plus size={16} /> Add project
                  </button>
                </form>
              </section>
              <div className="project-grid">
                {projects.map(project => {
                  const items = decisions.filter(d => d.project === project);
                  const due = items.filter(isReviewDue).length;
                  const violated = items.reduce(
                    (sum, d) =>
                      sum +
                      d.assumptions.filter(a => a.status === 'Violated').length,
                    0
                  );
                  return (
                    <article className="project-card" key={project}>
                      <div className="project-card-top">
                        <div className="project-icon">
                          <FolderKanban size={18} />
                        </div>
                        <Badge>{items.length} decisions</Badge>
                      </div>
                      <h3>{project}</h3>
                      <div className="project-metrics">
                        <span>
                          {due} review{due === 1 ? '' : 's'} due
                        </span>
                        <span>
                          {violated} violated assumption
                          {violated === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div className="project-card-actions">
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => {
                            setActiveProject(project);
                            setActiveView('all');
                            setSelectedId(null);
                          }}
                        >
                          Open decisions
                        </button>
                        <button
                          className="icon-button"
                          type="button"
                          title="Export project as Markdown"
                          aria-label={'Export ' + project + ' as Markdown'}
                          onClick={() => exportProject(project)}
                        >
                          <Download size={16} />
                        </button>
                        <button
                          className="icon-button"
                          type="button"
                          title="Print project or save as PDF"
                          aria-label={'Print ' + project + ' project'}
                          onClick={() => printProject(project)}
                        >
                          <Printer size={16} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
              <section className="panel export-panel">
                <div className="export-panel-icon">
                  <Download size={18} />
                </div>
                <div className="export-panel-copy">
                  <h3>Portable by design</h3>
                  <p>
                    Export project decision logs as Markdown, or create a JSON
                    backup containing your projects and records. Nothing is
                    uploaded from this page.
                  </p>
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={exportBackup}
                >
                  Export JSON backup
                </button>
              </section>
            </div>
          ) : activeView === 'stats' ? (
            <div className="page-content">
              <div className="page-intro-row">
                <div>
                  <h1>Learning stats</h1>
                  <p className="page-subtitle">
                    Metrics reflect only what has been reviewed and recorded on
                    this device.
                  </p>
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={exportBackup}
                >
                  <Download size={16} /> Export backup
                </button>
              </div>
              <div className="metric-grid stats-metric-grid">
                <MetricCard
                  label="EVALUATED ASSUMPTIONS"
                  value={String(evaluatedAssumptions.length)}
                  hint="Confirmed + violated only"
                  icon={<ListChecks size={18} />}
                />
                <MetricCard
                  label="VIOLATION RATE"
                  value={violationRate === null ? '—' : violationRate + '%'}
                  hint="Violated ÷ evaluated"
                  icon={<ShieldAlert size={18} />}
                  emphasis={violationRate !== null && violationRate >= 50}
                />
                <MetricCard
                  label="AVERAGE DECISION GRADE"
                  value={gradeScore === null ? '—' : gradeScore + ' / 3'}
                  hint={graded.length + ' graded decision(s)'}
                  icon={<BarChart3 size={18} />}
                />
                <MetricCard
                  label="REVIEWS COMPLETED"
                  value={String(decisions.filter(d => d.reviewedAt).length)}
                  hint={dueDecisions.length + ' currently due'}
                  icon={<CheckCircle2 size={18} />}
                />
              </div>
              <div className="stats-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <div className="section-kicker">ASSUMPTION QUALITY</div>
                      <h2>Outcome of evaluated assumptions</h2>
                    </div>
                  </div>
                  {evaluatedAssumptions.length ? (
                    <div className="ratio-area">
                      <div className="ratio-labels">
                        <span>
                          <i className="legend-dot confirmed-dot" /> Confirmed{' '}
                          <strong>
                            {
                              allAssumptions.filter(
                                a => a.status === 'Confirmed'
                              ).length
                            }
                          </strong>
                        </span>
                        <span>
                          <i className="legend-dot violated-dot" /> Violated{' '}
                          <strong>{violatedCount}</strong>
                        </span>
                      </div>
                      <div className="ratio-bar">
                        <div
                          className="ratio-confirmed"
                          style={{
                            width:
                              (allAssumptions.filter(
                                a => a.status === 'Confirmed'
                              ).length /
                                evaluatedAssumptions.length) *
                                100 +
                              '%',
                          }}
                        />
                        <div
                          className="ratio-violated"
                          style={{
                            width:
                              (violatedCount / evaluatedAssumptions.length) *
                                100 +
                              '%',
                          }}
                        />
                      </div>
                      <p className="muted-text small">
                        Uncertain, active, and expired assumptions are excluded
                        from this rate. Review them when evidence becomes
                        available.
                      </p>
                    </div>
                  ) : (
                    <EmptyState
                      icon={<Target size={20} />}
                      title="No evaluated assumptions yet"
                      description="After a review, mark each assumption Confirmed or Violated. Uncertain assumptions are excluded from the accuracy denominator."
                    />
                  )}
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <div className="section-kicker">REPEATING PATTERNS</div>
                      <h2>Violated assumption types</h2>
                    </div>
                  </div>
                  {topViolatedType ? (
                    <div className="type-ranking">
                      {Object.entries(violatedTypes)
                        .sort((a, b) => b[1] - a[1])
                        .map(([type, count]) => (
                          <div className="type-row" key={type}>
                            <span>{type}</span>
                            <div className="type-track">
                              <div
                                style={{
                                  width:
                                    (count / (topViolatedType[1] || 1)) * 100 +
                                    '%',
                                }}
                              />
                            </div>
                            <strong>{count}</strong>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={<CircleHelp size={20} />}
                      title="No pattern yet"
                      description="Categorize assumptions when you create decisions. Repeated violations will surface here."
                    />
                  )}
                </section>
              </div>
              <section className="panel calibration-panel">
                <div className="panel-heading"><div><div className="section-kicker">PERSONAL CALIBRATION</div><h2>Confidence vs observed accuracy</h2></div></div>
                <div className="calibration-highlight">
                  <div><span>High-confidence assumptions confirmed</span><strong>{highConfidenceAccuracy === null ? '—' : highConfidenceAccuracy + '%'}</strong><small>{highConfidenceConfirmed} confirmed · {highConfidenceViolated} violated · {highConfidenceEvaluated.length} evaluated</small></div>
                  <p>Only evaluated assumptions are counted. Expected bands (Low 35%, Medium 60%, High 85%) are diagnostic reference points, not scientific measurements of your true confidence.</p>
                </div>
                <div className="calibration-grid">
                  {confidenceCalibration.map(band => <div className="calibration-band" key={band.level}>
                    <div className="calibration-band-heading"><strong>{band.level} confidence</strong><Badge>{band.evaluated} evaluated</Badge></div>
                    <div className="calibration-scale"><span>Reference {band.expected}%</span><span>{band.actual === null ? 'Actual —' : 'Actual ' + band.actual + '%'}</span></div>
                    <div className="ratio-bar"><div className="ratio-confirmed" style={{width:(band.actual === null ? 0 : band.actual) + '%'}} /></div>
                    <small>{band.correct} confirmed · {band.wrong} violated{band.gap === null ? '' : ' · ' + (band.gap > 0 ? 'underconfidence signal' : band.gap < 0 ? 'overconfidence signal' : 'near reference')}</small>
                  </div>)}
                </div>
              </section>
              <section className="panel quality-trend-panel">
                <div className="panel-heading"><div><div className="section-kicker">OVER TIME</div><h2>Decision quality trend</h2></div></div>
                {graded.length ? <div className="quality-trend-list">{Object.entries(graded.reduce<Record<string, {sum:number;count:number}>>((acc, d) => {
                  const month = (d.reviewedAt || d.date).slice(0, 7);
                  if (!acc[month]) acc[month] = {sum:0,count:0};
                  acc[month].sum += d.grade === 'Good' ? 3 : d.grade === 'Acceptable' ? 2 : d.grade === 'Poor' ? 1 : 0;
                  acc[month].count += 1;
                  return acc;
                }, {})).sort((a,b) => a[0].localeCompare(b[0])).map(([month, value]) => <div className="quality-trend-row" key={month}><span>{month}</span><div className="type-track"><div style={{width:(value.sum/value.count/3*100)+'%'}} /></div><strong>{(value.sum/value.count).toFixed(1)} / 3</strong><small>{value.count} decision(s)</small></div>)}</div> : <p className="muted-text">Grades appear here after you complete reviews. Trend quality depends on consistent, honest grading over time.</p>}
              </section>
              <section className="panel decision-type-failure-panel">
                <div className="panel-heading"><div><div className="section-kicker">DECISION-TYPE PATTERNS</div><h2>Which types receive the poorest grades?</h2></div></div>
                {decisionTypeOutcomes.length ? <>
                  <div className="type-ranking">{decisionTypeOutcomes.map(item => <div className="type-row" key={item.type}>
                    <span>{item.type}</span>
                    <div className="type-track"><div style={{width:(item.poorRate || 0)+'%'}} /></div>
                    <strong>{item.poorRate}%</strong>
                    <small>{item.poor}/{item.evaluated} poor grades</small>
                  </div>)}</div>
                  <p className="muted-text small">Sorted by poor-grade rate. Types with fewer than three graded decisions are provisional; this is a self-review signal, not proof of a stable personal trait.</p>
                </> : <EmptyState icon={<BarChart3 size={20}/>} title="Not enough graded decisions" description="Record decision grades over time. This view compares the share of Poor grades within each decision type."/>}
              </section>
              <section className="panel grade-guide">
                <h2>Read the metrics honestly</h2>
                <div className="grade-guide-grid">
                  <div>
                    <Badge tone="good">Confirmed</Badge>
                    <p>
                      The assumption held up against observed evidence. This is
                      not proof it will always hold.
                    </p>
                  </div>
                  <div>
                    <Badge tone="danger">Violated</Badge>
                    <p>
                      Evidence contradicted the assumption. Record what signal
                      you missed and what changes next time.
                    </p>
                  </div>
                  <div>
                    <Badge tone="warm">Uncertain</Badge>
                    <p>
                      There is not enough evidence. Do not force a verdict just
                      to improve the numbers.
                    </p>
                  </div>
                </div>
              </section>
            </div>
          ) : activeView === 'portfolio' ? (
            <PortfolioRiskView items={openHighRiskAssumptions} decisions={decisions} projects={projects} onOpen={id => setSelectedId(id)} />
          ) : activeView === 'bets' ? (
            <StrategicBetsView decisions={decisions} onOpen={id => setSelectedId(id)} />
          ) : activeView === 'dependencies' ? (
            <DependenciesView decisions={decisions} onOpen={id => setSelectedId(id)} />
          ) : activeView === 'compare' ? (
            <CompareDecisionsView decisions={decisions} compareA={compareA} compareB={compareB} onCompareA={setCompareA} onCompareB={setCompareB} onOpen={id => setSelectedId(id)} />
          ) : activeView === 'lessons' ? (
            <LessonsLibraryView decisions={decisions} query={query} onQueryChange={setQuery} onOpen={id => setSelectedId(id)} />
          ) : (
            <div className="page-content decisions-page">
              <div className="page-intro-row">
                <div>
                  <h1>{listTitle}</h1>
                  <p className="page-subtitle">
                    {activeView === 'reviews'
                      ? 'Due and overdue reviews based on the dates you set.'
                      : activeView === 'violated'
                        ? 'Decisions with at least one assumption contradicted by evidence.'
                        : activeView === 'high-impact'
                          ? 'Decisions containing assumptions with high impact if wrong.'
                          : 'Search the reasoning, assumptions, and lessons — not only the title.'}
                  </p>
                </div>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => beginNewDecision()}
                >
                  <Plus size={16} /> New decision
                </button>
              </div>
              <section className="filter-panel">
                <div className="search-wrap">
                  <Search size={17} />
                  <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search titles, assumptions, lessons…"
                    aria-label="Search decisions"
                  />
                </div>
                <div className="filter-control">
                  <Filter size={15} />
                  <label className="sr-only" htmlFor="project-filter">
                    Project filter
                  </label>
                  <select
                    id="project-filter"
                    value={activeProject}
                    onChange={e => setActiveProject(e.target.value)}
                  >
                    <option value="All">All projects</option>
                    {projects.map(p => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="filter-control">
                  <Settings2 size={15} />
                  <label className="sr-only" htmlFor="confidence-filter">
                    Confidence filter
                  </label>
                  <select
                    id="confidence-filter"
                    value={confidenceFilter}
                    onChange={e => setConfidenceFilter(e.target.value)}
                  >
                    <option value="All">All confidence</option>
                    <option>Low</option>
                    <option>Medium</option>
                    <option>High</option>
                  </select>
                </div>
                <div className="filter-control">
                  <ShieldAlert size={15} />
                  <label className="sr-only" htmlFor="risk-filter">Risk filter</label>
                  <select id="risk-filter" value={riskFilter} onChange={e => setRiskFilter(e.target.value)}>
                    <option value="All">Any risk</option><option value="50+">Risk 50+</option><option value="75+">Risk 75+</option>
                  </select>
                </div>
                <div className="filter-control">
                  <GitBranch size={15} />
                  <label className="sr-only" htmlFor="reversibility-filter">Reversibility filter</label>
                  <select id="reversibility-filter" value={reversibilityFilter} onChange={e => setReversibilityFilter(e.target.value)}>
                    <option value="All">Any reversibility</option>{REVERSIBILITY_OPTIONS.map(option => <option key={option}>{option}</option>)}
                  </select>
                </div>
                <div className="filter-control">
                  <CalendarClock size={15} />
                  <label className="sr-only" htmlFor="review-filter">Review status filter</label>
                  <select id="review-filter" value={reviewFilter} onChange={e => setReviewFilter(e.target.value)}>
                    <option value="All">Any review status</option><option value="Due">Due / overdue</option><option value="Reviewed">Reviewed</option><option value="Unscheduled">No review date</option>
                  </select>
                </div>
                <div className="filter-control">
                  <FolderKanban size={15} />
                  <label className="sr-only" htmlFor="tag-filter">Tag filter</label>
                  <select id="tag-filter" value={tagFilter} onChange={e => setTagFilter(e.target.value)}>
                    <option value="All">Any tag</option>{availableTags.map(tag => <option key={tag}>{tag}</option>)}
                  </select>
                </div>
                <div className="filter-control">
                  <Clock3 size={15} />
                  <label className="sr-only" htmlFor="horizon-filter">Time horizon filter</label>
                  <select id="horizon-filter" value={horizonFilter} onChange={e => setHorizonFilter(e.target.value)}>
                    <option value="All">Any horizon</option><option value="30 days or less">≤30 days</option><option value="31–90 days">31–90 days</option><option value="90+ days">90+ days</option><option value="Unspecified">Unspecified</option>
                  </select>
                </div>
                <div className="filter-control">
                  <Clock3 size={15} />
                  <label className="sr-only" htmlFor="urgency-filter">Urgency filter</label>
                  <select id="urgency-filter" value={urgencyFilter} onChange={e => setUrgencyFilter(e.target.value)}>
                    <option value="All">Any urgency</option>
                    <option>Critical</option><option>Urgent</option><option>Watch</option><option>Aging</option><option>Stable</option>
                  </select>
                </div>
                {(query || activeProject !== 'All' || confidenceFilter !== 'All' || riskFilter !== 'All' || reversibilityFilter !== 'All' || reviewFilter !== 'All' || tagFilter !== 'All' || horizonFilter !== 'All' || urgencyFilter !== 'All') && (
                  <button className="clear-filters" type="button" onClick={() => {
                    setQuery('');
                    setActiveProject('All');
                    setConfidenceFilter('All');
                    setRiskFilter('All');
                    setReversibilityFilter('All');
                    setReviewFilter('All');
                    setTagFilter('All');
                    setHorizonFilter('All');
                    setUrgencyFilter('All');
                  }}>Clear filters</button>
                )}
              </section>
              <div className="results-meta">
                <span>
                  {filteredDecisions.length} decision
                  {filteredDecisions.length === 1 ? '' : 's'}
                </span>
                <span>Sorted by decision date</span>
              </div>
              {filteredDecisions.length ? (
                <div className="decision-list">
                  {filteredDecisions.map(d => (
                    <DecisionRow
                      key={d.id}
                      decision={d}
                      onClick={() => setSelectedId(d.id)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<Search size={22} />}
                  title={
                    query || activeProject !== 'All' || confidenceFilter !== 'All' || riskFilter !== 'All' || reversibilityFilter !== 'All' || reviewFilter !== 'All' || tagFilter !== 'All' || horizonFilter !== 'All' || urgencyFilter !== 'All'
                      ? 'No matching decisions'
                      : 'Nothing here yet'
                  }
                  description={
                    query || activeProject !== 'All' || confidenceFilter !== 'All' || riskFilter !== 'All' || reversibilityFilter !== 'All' || reviewFilter !== 'All' || tagFilter !== 'All' || horizonFilter !== 'All' || urgencyFilter !== 'All'
                      ? 'Try changing the search or clearing filters.'
                      : activeView === 'reviews'
                        ? 'No reviews are due. Future review dates will appear here when they become due.'
                        : 'Capture your first decision to start a useful record of your reasoning.'
                  }
                  action={
                    !query &&
                    activeProject === 'All' &&
                    confidenceFilter === 'All' &&
                    riskFilter === 'All' &&
                    reversibilityFilter === 'All' &&
                    reviewFilter === 'All' &&
                    tagFilter === 'All' &&
                    horizonFilter === 'All' &&
                    urgencyFilter === 'All' &&
                    activeView === 'all' ? (
                      <button
                        className="primary-button"
                        type="button"
                        onClick={() => beginNewDecision()}
                      >
                        <Plus size={16} /> Create a decision
                      </button>
                    ) : undefined
                  }
                />
              )}
            </div>
          )}
        </div>
        <footer className="app-footer">
          <span>
            Decision Ledger <span className="footer-divider">/</span> A private
            record of reasoning
          </span>
          <span>
            {storageError
              ? 'Could not save local data — export a backup and check browser storage.'
              : storageBackend === 'IndexedDB'
                ? 'Saved locally on this device'
                : 'IndexedDB unavailable; using browser storage. Export a backup before clearing browser data.'}
          </span>
        </footer>
      </main>

      {modal === 'decision' && (
        <div
          className="modal-shade"
          role="presentation"
          onMouseDown={e => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            className="modal decision-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="decision-modal-title"
          >
            <header className="modal-header">
              <div>
                <div className="section-kicker">
                  {editingId ? 'UPDATE THE RECORD' : 'CAPTURE THE DECISION'}
                </div>
                <h2 id="decision-modal-title">
                  {editingId ? 'Edit decision' : 'New decision'}
                </h2>
                <p>
                  Start with the choice. Add detail only where it improves
                  future learning.
                </p>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setModal(null)}
                aria-label="Close form"
              >
                <X size={19} />
              </button>
            </header>
            <form className="decision-form" onSubmit={saveDecision}>
                            <div className="capture-mode-toggle">
                <div>
                  <strong>Capture mode</strong>
                  <small>Quick records the decision essentials. Deep opens trade-offs, assumptions, and invalidation rules.</small>
                </div>
                <div className="mode-switch" role="group" aria-label="Capture mode">
                  <button type="button" className={captureMode === 'Quick' ? 'active' : ''} onClick={() => setCaptureMode('Quick')}>Quick</button>
                  <button type="button" className={captureMode === 'Deep' ? 'active' : ''} onClick={() => setCaptureMode('Deep')}>Deep</button>
                </div>
              </div>
              {!editingId && (
                <div className="template-picker">
                  <span>Start from a template</span>
                  <div>
                    {TEMPLATES.map(t => (
                      <button
                        key={t.name}
                        className="template-chip"
                        type="button"
                        onClick={() =>
                          setDraft(prev => ({
                            ...prev,
                            title: t.title,
                            context: t.context,
                            decisionType: t.name.startsWith('Hire') ? 'Hire' : t.name.includes('Build') ? 'Build vs Buy' : t.name.includes('Launch') ? 'Launch' : 'Investment',
                            alternatives: t.options.map((option, index) => ({
                              id: uid(),
                              text: option,
                              reason: '',
                              almostChosen: false,
                              rank: index + 1,
                              secondBest: index === 1,
                              revived: false,
                            })),
                          }))
                        }
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="form-section">
                <div className="form-section-title">
                  <span className="step-index">01</span>
                  <div>
                    <h3>The choice</h3>
                    <p>What did you decide, and what was the situation?</p>
                  </div>
                </div>
                <div className="form-grid">
                  <label className="field full-field">
                    <span>
                      Decision title <b>*</b>
                    </span>
                    <input
                      autoFocus
                      value={draft.title}
                      onChange={e =>
                        setDraft(prev => ({ ...prev, title: e.target.value }))
                      }
                      placeholder="e.g. Build our own payment module"
                      required
                      maxLength={160}
                    />
                  </label>
                  <label className="field full-field">
                    <span>Short context</span>
                    <textarea
                      rows={2}
                      value={draft.context}
                      onChange={e =>
                        setDraft(prev => ({ ...prev, context: e.target.value }))
                      }
                      placeholder="What prompted this decision? What constraints mattered?"
                    />
                  </label>
                  <label className="field full-field">
                    <span>
                      Final choice <b>*</b>
                    </span>
                    <input
                      value={draft.choice}
                      onChange={e =>
                        setDraft(prev => ({ ...prev, choice: e.target.value }))
                      }
                      placeholder="The path you committed to"
                      required
                      maxLength={300}
                    />
                  </label>
                  <label className="field">
                    <span>Decision date</span>
                    <input
                      type="date"
                      value={draft.date}
                      onChange={e =>
                        setDraft(prev => ({ ...prev, date: e.target.value }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Project / area</span>
                    <input
                      list="project-options"
                      value={draft.project}
                      onChange={e =>
                        setDraft(prev => ({ ...prev, project: e.target.value }))
                      }
                      placeholder="General"
                    />
                    <datalist id="project-options">
                      {projects.map(p => (
                        <option key={p} value={p} />
                      ))}
                    </datalist>
                  </label>
                  <label className="field">
                    <span>Decision owner</span>
                    <input value={draft.owner} onChange={e => setDraft(prev => ({ ...prev, owner: e.target.value }))} placeholder="Person accountable for this decision" />
                  </label>
                  <label className="field">
                    <span>Confidence in the choice</span>
                    <LevelSelect
                      value={draft.confidence}
                      onChange={value =>
                        setDraft(prev => ({ ...prev, confidence: value }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Review date</span>
                    <input
                      type="date"
                      value={draft.reviewDate}
                      onChange={e =>
                        setDraft(prev => ({
                          ...prev,
                          reviewDate: e.target.value,
                        }))
                      }
                    />
                    <small>When should evidence be checked?</small>
                  </label>
                  <label className="field deep-only-field">
                    <span>Decision type</span>
                    <select value={draft.decisionType} onChange={e => setDraft(prev => ({ ...prev, decisionType: e.target.value }))}>
                      {DECISION_TYPES.map(type => <option key={type}>{type}</option>)}
                    </select>
                  </label>
                  <label className="field deep-only-field">
                    <span>Reversibility</span>
                    <select value={draft.reversibility} onChange={e => setDraft(prev => ({ ...prev, reversibility: e.target.value as Reversibility }))}>
                      {REVERSIBILITY_OPTIONS.map(option => <option key={option}>{option}</option>)}
                    </select>
                  </label>
                  <label className="field full-field deep-only-field">
                    <span>Tags (comma-separated)</span>
                    <input value={draft.tagsText} onChange={e => setDraft(prev => ({ ...prev, tagsText: e.target.value }))} placeholder="e.g. strategic-bet, customer, Q4" />
                  </label>
                </div>
              </div>

              <div className={'form-section ' + (captureMode === 'Quick' ? 'deep-hidden' : '')}>
                <div className="form-section-title">
                  <span className="step-index">02</span>
                  <div>
                    <h3>Alternatives considered</h3>
                    <p>Keep the serious options and why they did not win.</p>
                  </div>
                </div>
                <div className="dynamic-rows">
                  {draft.alternatives.map((alt, index) => (
                    <div className="alternative-edit-row" key={alt.id}>
                      <div className="row-number">{index + 1}</div>
                      <div className="alternative-fields">
                        <div className="alternative-title-row">
                          <input
                            value={alt.text}
                            onChange={e =>
                              updateAlternative(alt.id, {
                                text: e.target.value,
                              })
                            }
                            placeholder="Alternative considered"
                            aria-label={'Alternative ' + (index + 1)}
                          />
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={alt.almostChosen}
                              onChange={e =>
                                updateAlternative(alt.id, {
                                  almostChosen: e.target.checked,
                                })
                              }
                            />{' '}
                            Almost chosen
                          </label>
                        </div>
                        <div className="alternative-meta-row">
                          <label className="field"><span>Rank</span><select value={alt.rank || index + 1} onChange={e => updateAlternativeRank(alt.id, Number(e.target.value))}>{draft.alternatives.map((_, rankIndex) => <option key={rankIndex} value={rankIndex + 1}>{rankIndex + 1}</option>)}</select></label>
                          <label className="checkbox-label"><input type="checkbox" checked={Boolean(alt.secondBest)} onChange={e => updateAlternative(alt.id, { secondBest: e.target.checked })} /> Second-best</label>
                          <label className="checkbox-label"><input type="checkbox" checked={Boolean(alt.revived)} onChange={e => updateAlternative(alt.id, { revived: e.target.checked })} /> Revived</label>
                        </div>
                        <input
                          value={alt.reason}
                          onChange={e =>
                            updateAlternative(alt.id, {
                              reason: e.target.value,
                            })
                          }
                          placeholder="Why it was rejected (optional)"
                          aria-label="Reason rejected"
                        />
                      </div>
                      <button
                        className="row-remove"
                        type="button"
                        onClick={() =>
                          setDraft(prev => ({
                            ...prev,
                            alternatives: prev.alternatives.filter(
                              a => a.id !== alt.id
                            ),
                          }))
                        }
                        aria-label="Remove alternative"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                  <button
                    className="add-row-button"
                    type="button"
                    onClick={() =>
                      setDraft(prev => ({
                        ...prev,
                        alternatives: [
                          ...prev.alternatives,
                          {
                            id: uid(),
                            text: '',
                            reason: '',
                            almostChosen: false,
                            rank: prev.alternatives.length + 1,
                            secondBest: false,
                            revived: false,
                          },
                        ],
                      }))
                    }
                  >
                    <Plus size={15} /> Add alternative
                  </button>
                </div>
              </div>

              <div className={'form-section ' + (captureMode === 'Quick' ? 'deep-hidden' : '')}>
                <div className="form-section-title">
                  <span className="step-index">03</span>
                  <div>
                    <h3>Assumption ledger</h3>
                    <p>
                      Write beliefs as statements that evidence could confirm or
                      contradict.
                    </p>
                  </div>
                </div>
                <div className="assumption-edit-list">
                  {draft.assumptions.map((a, index) => (
                    <div className="assumption-edit-card" key={a.id}>
                      <div className="assumption-edit-top">
                        <div className="row-number">{index + 1}</div>
                        <input
                          className="assumption-statement"
                          value={a.text}
                          onChange={e =>
                            updateAssumption(a.id, { text: e.target.value })
                          }
                          placeholder="We believe that…"
                          aria-label={'Assumption ' + (index + 1)}
                        />
                        <button
                          className="row-remove"
                          type="button"
                          onClick={() =>
                            setDraft(prev => ({
                              ...prev,
                              assumptions: prev.assumptions.filter(
                                x => x.id !== a.id
                              ),
                            }))
                          }
                          aria-label="Remove assumption"
                        >
                          <X size={15} />
                        </button>
                      </div>
                      <div className="assumption-fields">
                        <label className="field">
                          <span>Assumption type</span>
                          <select
                            value={a.type}
                            onChange={e =>
                              updateAssumption(a.id, { type: e.target.value })
                            }
                          >
                            {ASSUMPTION_TYPES.map(type => (
                              <option key={type}>{type}</option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Assumption owner (optional)</span>
                          <input value={a.owner || ''} onChange={e => updateAssumption(a.id, { owner: e.target.value })} placeholder="Who can validate this belief?" />
                        </label>
                        <label className="field">
                          <span>Confidence</span>
                          <LevelSelect
                            value={a.confidence}
                            onChange={value =>
                              updateAssumption(a.id, { confidence: value })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Impact if wrong</span>
                          <LevelSelect
                            value={a.impact}
                            onChange={value =>
                              updateAssumption(a.id, { impact: value })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Evidence level</span>
                          <select value={a.evidence || 'None'} onChange={e => updateAssumption(a.id, { evidence: e.target.value as EvidenceLevel })}>
                            {EVIDENCE_OPTIONS.map(level => <option key={level}>{level}</option>)}
                          </select>
                        </label>
                        <label className="field assumption-signal">
                          <span>Monitoring signal — how will you know this is breaking?</span>
                          <input
                            value={a.signal}
                            onChange={e =>
                              updateAssumption(a.id, { signal: e.target.value })
                            }
                            placeholder="A measurable warning sign (optional)"
                          />
                        </label>
                      </div>
                      <div className="assumption-foot">
                        <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                        <Badge tone={riskScore(a) >= 75 ? 'danger' : riskScore(a) >= 50 ? 'warm' : 'neutral'}>Risk {riskScore(a)}/100</Badge>
                        <span>Impact × (1 − confidence); evidence is tracked separately.</span>
                      </div>
                    </div>
                  ))}
                  <button
                    className="add-row-button"
                    type="button"
                    onClick={() =>
                      setDraft(prev => ({
                        ...prev,
                        assumptions: [
                          ...prev.assumptions,
                          {
                            id: uid(),
                            text: '',
                            confidence: 'Medium',
                            impact: 'Medium',
                            evidence: 'None',
                            signal: '',
                            status: 'Active',
                            type: 'Other',
                            owner: '',
                          },
                        ],
                      }))
                    }
                  >
                    <Plus size={15} /> Add assumption
                  </button>
                </div>
              </div>

              <div className={'form-section ' + (captureMode === 'Quick' ? 'deep-hidden' : '')}>
                <div className="form-section-title">
                  <span className="step-index">04</span>
                  <div>
                    <h3>Expected outcomes</h3>
                    <p>
                      Make the forecast explicit so you can compare it with
                      reality.
                    </p>
                  </div>
                </div>
                <div className="form-grid">
                  <label className="field">
                    <span>Expected upside</span>
                    <textarea
                      rows={3}
                      value={draft.expectedUpside}
                      onChange={e =>
                        setDraft(prev => ({
                          ...prev,
                          expectedUpside: e.target.value,
                        }))
                      }
                      placeholder="What should improve if this works?"
                    />
                  </label>
                  <label className="field">
                    <span>Expected downside / risks</span>
                    <textarea
                      rows={3}
                      value={draft.expectedDownside}
                      onChange={e =>
                        setDraft(prev => ({
                          ...prev,
                          expectedDownside: e.target.value,
                        }))
                      }
                      placeholder="What could go wrong, and at what cost?"
                    />
                  </label>
                  <div className="scenario-input-block full-field">
                    <div className="scenario-unit-row">
                      <label className="field">
                        <span>Scenario unit / metric</span>
                        <input value={draft.scenarios.unit} onChange={e => setDraft(prev => ({ ...prev, scenarios: { ...prev.scenarios, unit: e.target.value } }))} placeholder="e.g. DZD net cash flow, monthly users, ROI %" />
                      </label>
                      <p>Values may be a number or a short range. Probability weights are optional; if you enter any, all three must sum to 100%.</p>
                    </div>
                    <div className="scenario-grid">
                      {SCENARIO_OPTIONS.map(option => (
                        <div className="scenario-card" key={option.key}>
                          <h4>{option.label}</h4>
                          <label className="field">
                            <span>Value / range</span>
                            <input value={draft.scenarios[option.key].value} onChange={e => setDraft(prev => ({ ...prev, scenarios: { ...prev.scenarios, [option.key]: { ...prev.scenarios[option.key], value: e.target.value } } }))} placeholder={option.key === 'base' ? 'Likely outcome' : 'Number or range'} />
                          </label>
                          <label className="field">
                            <span>Probability % (optional)</span>
                            <input type="number" min="0" max="100" step="1" value={draft.scenarios[option.key].probability} onChange={e => setDraft(prev => ({ ...prev, scenarios: { ...prev.scenarios, [option.key]: { ...prev.scenarios[option.key], probability: e.target.value } } }))} placeholder="—" />
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <label className="field">
                    <span>Time horizon</span>
                    <input
                      value={draft.horizon}
                      onChange={e =>
                        setDraft(prev => ({ ...prev, horizon: e.target.value }))
                      }
                      placeholder="e.g. 30 days, 2 quarters"
                    />
                  </label>
                  <label className="field">
                    <span>Linked documents or URLs</span>
                    <textarea
                      rows={2}
                      value={draft.linksText}
                      onChange={e =>
                        setDraft(prev => ({
                          ...prev,
                          linksText: e.target.value,
                        }))
                      }
                      placeholder="One URL or reference per line"
                    />
                  </label>
                </div>
                <div className="premortem-wrap">
                  <button
                    className="premortem-toggle"
                    type="button"
                    onClick={() => setShowPremortem(value => !value)}
                  >
                    <Lightbulb size={16} /> Pre-mortem prompts{' '}
                    <ChevronDown
                      size={15}
                      className={showPremortem ? 'rotate-icon' : ''}
                    />
                  </button>
                  {showPremortem && (
                    <div className="premortem-prompts">
                      {PREMORTEM_PROMPTS.map(prompt => (
                        <button
                          type="button"
                          key={prompt}
                          onClick={() => addPremortemPrompt(prompt)}
                        >
                          {prompt}
                          <Plus size={14} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className={'form-section ' + (captureMode === 'Quick' ? 'deep-hidden' : '')}>
                <div className="form-section-title">
                  <span className="step-index">05</span>
                  <div>
                    <h3>Commitments and follow-ups</h3>
                    <p>Turn the decision into concrete obligations with an owner and due date.</p>
                  </div>
                </div>
                <div className="commitment-edit-list">
                  {draft.commitments.map((item, index) => (
                    <div className="commitment-edit-row" key={item.id}>
                      <div className="row-number">{index + 1}</div>
                      <div className="commitment-edit-fields">
                        <input value={item.text} onChange={e => setDraft(prev => ({ ...prev, commitments: prev.commitments.map(c => c.id === item.id ? { ...c, text: e.target.value } : c) }))} placeholder="Concrete next action or condition" aria-label={'Commitment ' + (index + 1)} />
                        <input value={item.owner} onChange={e => setDraft(prev => ({ ...prev, commitments: prev.commitments.map(c => c.id === item.id ? { ...c, owner: e.target.value } : c) }))} placeholder="Owner" aria-label="Commitment owner" />
                        <label className="field"><span>Due date</span><input type="date" value={item.dueDate} onChange={e => setDraft(prev => ({ ...prev, commitments: prev.commitments.map(c => c.id === item.id ? { ...c, dueDate: e.target.value } : c) }))} /></label>
                        <label className="field"><span>Status</span><select value={item.status} onChange={e => setDraft(prev => ({ ...prev, commitments: prev.commitments.map(c => c.id === item.id ? { ...c, status: e.target.value as CommitmentStatus } : c) }))}><option>Open</option><option>Done</option><option>Missed</option></select></label>
                      </div>
                      <button className="row-remove" type="button" onClick={() => setDraft(prev => ({ ...prev, commitments: prev.commitments.filter(c => c.id !== item.id) }))} aria-label="Remove commitment"><X size={15}/></button>
                    </div>
                  ))}
                  <button className="add-row-button" type="button" onClick={() => setDraft(prev => ({ ...prev, commitments: [...prev.commitments, { id: uid(), text: '', owner: '', dueDate: '', status: 'Open', completedAt: '' }] }))}><Plus size={15}/> Add commitment</button>
                </div>
              </div>
              <div className={'form-section ' + (captureMode === 'Quick' ? 'deep-hidden' : '')}>
                <div className="form-section-title">
                  <span className="step-index">06</span>
                  <div>
                    <h3>Kill criteria</h3>
                    <p>Define observable conditions that should force an immediate revisit.</p>
                  </div>
                </div>
                <div className="dynamic-rows">
                  {draft.killCriteria.map((criterion, index) => (
                    <div className="alternative-edit-row" key={criterion.id}>
                      <div className="row-number">{index + 1}</div>
                      <div className="alternative-fields">
                        <input value={criterion.text} onChange={e => setDraft(prev => ({ ...prev, killCriteria: prev.killCriteria.map(k => k.id === criterion.id ? { ...k, text: e.target.value } : k) }))} placeholder="e.g. Pause if activation stays below 10% for 30 days" aria-label={'Kill criterion ' + (index + 1)} />
                        {criterion.triggered && <Badge tone={criterion.clearedAt ? 'muted' : 'danger'}>{criterion.clearedAt ? 'Triggered and reviewed' : 'Triggered — revisit required'}</Badge>}
                      </div>
                      <button className="row-remove" type="button" onClick={() => setDraft(prev => ({ ...prev, killCriteria: prev.killCriteria.filter(k => k.id !== criterion.id) }))} aria-label="Remove kill criterion"><X size={15} /></button>
                    </div>
                  ))}
                  <button className="add-row-button" type="button" onClick={() => setDraft(prev => ({ ...prev, killCriteria: [...prev.killCriteria, { id: uid(), text: '', triggered: false, triggeredAt: '', clearedAt: '' }] }))}><Plus size={15} /> Add kill criterion</button>
                </div>
              </div>
              <div className={'form-section ' + (captureMode === 'Quick' ? 'deep-hidden' : '')}>
                <div className="form-section-title">
                  <span className="step-index">07</span>
                  <div>
                    <h3>Related decisions</h3>
                    <p>Link prior choices this decision depends on.</p>
                  </div>
                </div>
                {decisions.filter(d => d.id !== editingId).length ? (
                  <div className="related-picker">
                    {decisions
                      .filter(d => d.id !== editingId)
                      .map(d => (
                        <label className="related-option" key={d.id}>
                          <input
                            type="checkbox"
                            checked={draft.relatedIds.includes(d.id)}
                            onChange={e =>
                              setDraft(prev => ({
                                ...prev,
                                relatedIds: e.target.checked
                                  ? [...prev.relatedIds, d.id]
                                  : prev.relatedIds.filter(id => id !== d.id),
                              }))
                            }
                          />
                          <span>
                            <strong>{d.title}</strong>
                            <small>
                              {d.project} · {formatDate(d.date)}
                            </small>
                          </span>
                        </label>
                      ))}
                  </div>
                ) : (
                  <p className="muted-text small">
                    Related decisions will be available here after you have
                    saved more than one decision.
                  </p>
                )}
              </div>

              {formError && (
                <div className="form-error" role="alert">
                  {formError}
                </div>
              )}
              <footer className="modal-footer">
                <span className="muted-text small">
                  Only required: title and final choice. The rest can evolve.
                </span>
                <div>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setModal(null)}
                  >
                    Cancel
                  </button>
                  <button className="primary-button" type="submit">
                    <Check size={16} />{' '}
                    {editingId ? 'Save changes' : 'Save decision'}
                  </button>
                </div>
              </footer>
            </form>
          </section>
        </div>
      )}

      {modal === 'review' && selectedDecision && (
        <div
          className="modal-shade"
          role="presentation"
          onMouseDown={e => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            className="modal review-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-modal-title"
          >
            <header className="modal-header">
              <div>
                <div className="section-kicker">
                  COMPARE EXPECTATION WITH EVIDENCE
                </div>
                <h2 id="review-modal-title">Review this decision</h2>
                <p>{selectedDecision.title}</p>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setModal(null)}
                aria-label="Close review"
              >
                <X size={19} />
              </button>
            </header>
            <form className="decision-form" onSubmit={saveReview}>
              <div className="review-reference">
                <div>
                  <span>Final choice</span>
                  <strong>{selectedDecision.choice}</strong>
                </div>
                <div>
                  <span>Expected upside</span>
                  <p>{selectedDecision.expectedUpside || 'Not recorded'}</p>
                </div>
                <div>
                  <span>Expected downside</span>
                  <p>{selectedDecision.expectedDownside || 'Not recorded'}</p>
                </div>
              </div>
              <div className="form-section">
                <div className="form-section-title">
                  <span className="step-index">01</span>
                  <div>
                    <h3>What actually happened?</h3>
                    <p>
                      Record observable facts, not only whether you feel the
                      choice was right.
                    </p>
                  </div>
                </div>
                <label className="field full-field">
                  <span>Actual outcome</span>
                  <textarea
                    rows={4}
                    value={reviewDraft.actualOutcome}
                    onChange={e =>
                      setReviewDraft(prev => ({
                        ...prev,
                        actualOutcome: e.target.value,
                      }))
                    }
                    placeholder="What happened compared with what you expected?"
                  />
                </label>
                <label className="field full-field">
                  <span>Overall decision grade</span>
                  <select
                    value={reviewDraft.grade}
                    onChange={e =>
                      setReviewDraft(prev => ({
                        ...prev,
                        grade: e.target.value as DecisionGrade,
                      }))
                    }
                  >
                    <option value="Good">
                      Good — sound process, outcome supported
                    </option>
                    <option value="Acceptable">
                      Acceptable — mixed evidence or trade-offs
                    </option>
                    <option value="Poor">
                      Poor — weak reasoning or avoidable failure
                    </option>
                    <option value="Too early to tell">Too early to tell</option>
                  </select>
                  <small>Grade the decision quality, not luck alone.</small>
                </label>
              </div>
              <div className="form-section">
                <div className="form-section-title">
                  <span className="step-index">02</span>
                  <div>
                    <h3>Reassess assumptions</h3>
                    <p>
                      Change the status based on evidence. Do not force
                      certainty where it does not exist.
                    </p>
                  </div>
                </div>
                {selectedDecision.assumptions.length ? (
                  <div className="review-assumption-list">
                    {selectedDecision.assumptions.map(a => (
                      <div className="review-assumption-row" key={a.id}>
                        <div className="review-assumption-copy">
                          <strong>{a.text}</strong>
                          <div>
                            <Badge
                              tone={a.impact === 'High' ? 'danger' : 'neutral'}
                            >
                              {a.impact} impact
                            </Badge>
                            <span>
                              {a.signal ? 'Signal: ' + a.signal : a.type}
                            </span>
                          </div>
                        </div>
                        <label className="field">
                          <span>Status</span>
                          <select
                            value={
                              reviewDraft.assumptionStatuses[a.id] ||
                              'Uncertain'
                            }
                            onChange={e =>
                              setReviewDraft(prev => ({
                                ...prev,
                                assumptionStatuses: {
                                  ...prev.assumptionStatuses,
                                  [a.id]: e.target.value as AssumptionStatus,
                                },
                              }))
                            }
                          >
                            {REVIEW_STATUS_OPTIONS.map(status => (
                              <option key={status}>{status}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted-text small">
                    No assumptions were recorded for this decision. Add them
                    when editing if you want assumption-level accuracy tracking.
                  </p>
                )}
              </div>
              <div className="form-section">
                <div className="form-section-title">
                  <span className="step-index">03</span>
                  <div>
                    <h3>Capture the lesson</h3>
                    <p>
                      What would you repeat, change, or measure earlier next
                      time?
                    </p>
                  </div>
                </div>
                <label className="field full-field">
                  <span>Lessons learned</span>
                  <textarea
                    rows={3}
                    value={reviewDraft.lessons}
                    onChange={e =>
                      setReviewDraft(prev => ({
                        ...prev,
                        lessons: e.target.value,
                      }))
                    }
                    required
                    minLength={10}
                    placeholder="Write a specific lesson — what will you repeat, change, or measure earlier?"
                  />
                </label>
                <label className="field full-field">
                  <span>Schedule another review (optional)</span>
                  <input
                    type="date"
                    min={todayISO()}
                    value={reviewDraft.nextReviewDate}
                    onChange={e =>
                      setReviewDraft(prev => ({
                        ...prev,
                        nextReviewDate: e.target.value,
                      }))
                    }
                  />
                  <small>
                    Useful when the outcome is still developing. Leave blank to
                    close this review cycle.
                  </small>
                </label>
              </div>
              <footer className="modal-footer">
                <span className="muted-text small">
                  Review date: {formatDate(todayISO())}
                </span>
                <div>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setModal(null)}
                  >
                    Cancel
                  </button>
                  <button className="primary-button" type="submit">
                    <Check size={16} /> Save review
                  </button>
                </div>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  icon,
  emphasis = false,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <article className={'metric-card ' + (emphasis ? 'metric-emphasis' : '')}>
      <div className="metric-card-top">
        <span>{label}</span>
        <span className="metric-icon">{icon}</span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-hint">{hint}</div>
    </article>
  );
}
function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}
function DecisionCompact({
  decision,
  onClick,
}: {
  decision: Decision;
  onClick: () => void;
}) {
  const badge = reviewBadge(decision);
  return (
    <button type="button" className="compact-row" onClick={onClick}>
      <span className="compact-status">
        {badge ? <Clock3 size={16} /> : <FileText size={16} />}
      </span>
      <span className="compact-copy">
        <strong>{decision.title}</strong>
        <small>
          {decision.project} · {formatDate(decision.date)}
        </small>
      </span>
      {badge ? (
        <Badge tone="danger">{badge}</Badge>
      ) : (
        <ArrowUpRight size={15} className="muted-icon" />
      )}
    </button>
  );
}
function DecisionRow({
  decision,
  onClick,
}: {
  decision: Decision;
  onClick: () => void;
}) {
  const badge = reviewBadge(decision);
  const urgency = urgencyInfo(decision);
  const assumptionsCount = decision.assumptions.length;
  const violated = decision.assumptions.filter(
    a => a.status === 'Violated'
  ).length;
  return (
    <button type="button" className="decision-row" onClick={onClick}>
      <div className="decision-row-main">
        <div className="decision-row-heading">
          <h3>{decision.title}</h3>
          {urgency.level !== 'Stable' && <span title={urgency.reasons.join(' ')}><Badge tone={urgencyTone(urgency.level)}>{urgency.level}</Badge></span>}
          {badge && <Badge tone="danger">{badge}</Badge>}
          {decision.grade && (
            <Badge tone={gradeTone(decision.grade)}>{decision.grade}</Badge>
          )}
        </div>
        <p>{decision.context || decision.choice}</p>
        <div className="row-meta">
          <span>
            <FolderKanban size={13} />
            {decision.project}
          </span>
          <span>
            <CalendarClock size={13} />
            {formatDate(decision.date)}
          </span>
          <span>
            <Target size={13} />
            {decision.confidence} confidence
          </span>
        </div>
      </div>
      <div className="decision-row-side">
        <div className="side-stat">
          <strong>{assumptionsCount}</strong>
          <span>assumptions</span>
        </div>
        {violated > 0 && (
          <div className="violation-mini">
            <ShieldAlert size={13} /> {violated} violated
          </div>
        )}
        <ArrowUpRight size={17} className="row-arrow" />
      </div>
    </button>
  );
}
function DecisionDetail({
  decision,
  decisions,
  onBack,
  onEdit,
  onReview,
  onDelete,
  onExport,
  onPrint,
  onOpenRelated,
  onTriggerKill,
  onReviveAlternative,
  onAddSignal,
  onSetCommitmentStatus,
}: {
  decision: Decision;
  decisions: Decision[];
  onBack: () => void;
  onEdit: () => void;
  onReview: () => void;
  onDelete: () => void;
  onExport: () => void;
  onPrint: () => void;
  onOpenRelated: (id: string) => void;
  onTriggerKill: (criterionId: string) => void;
  onReviveAlternative: (alternativeId: string) => void;
  onAddSignal: (signal: Omit<SignalLog, 'id'>) => void;
  onSetCommitmentStatus: (commitmentId: string, status: CommitmentStatus) => void;
}) {
  const badge = reviewBadge(decision);
  const urgency = urgencyInfo(decision);
  const [signalTarget, setSignalTarget] = useState('decision');
  const [signalObservation, setSignalObservation] = useState('');
  const [signalDate, setSignalDate] = useState(todayISO());
  const [signalStance, setSignalStance] = useState<SignalStance>('Neutral');
  useEffect(() => {
    setSignalTarget('decision');
    setSignalObservation('');
    setSignalDate(todayISO());
    setSignalStance('Neutral');
  }, [decision.id]);
  function submitSignal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!signalObservation.trim()) return;
    const isDecisionTarget = signalTarget === 'decision';
    onAddSignal({
      date: signalDate || todayISO(),
      observation: signalObservation.trim(),
      stance: signalStance,
      targetType: isDecisionTarget ? 'Decision' : 'Assumption',
      targetId: isDecisionTarget ? decision.id : signalTarget.slice('assumption:'.length),
    });
    setSignalObservation('');
    setSignalStance('Neutral');
  }
  const related = decision.relatedIds
    .map(id => decisions.find(d => d.id === id))
    .filter(Boolean) as Decision[];
  const inbound = decisions.filter(d => d.relatedIds.includes(decision.id));
  return (
    <div className="page-content detail-page">
      <div className="detail-toolbar">
        <button className="back-link" type="button" onClick={onBack}>
          <ArrowLeft size={16} /> Back to decisions
        </button>
        <div className="detail-actions">
          <button className="secondary-button" type="button" onClick={onExport}>
            <Download size={15} /> Markdown
          </button>
          <button className="secondary-button" type="button" onClick={onPrint}>
            <Printer size={15} /> Print / PDF
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={onEdit}
            title="Edit decision"
            aria-label="Edit decision"
          >
            <Settings2 size={16} />
          </button>
          <button
            className="icon-button danger-icon-button"
            type="button"
            onClick={onDelete}
            title="Delete decision"
            aria-label="Delete decision"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <div className="detail-title-block">
        <div className="detail-eyebrow">
          <span>{decision.project}</span>
          <span className="dot-separator">·</span>
          <span>Decided {formatDate(decision.date)}</span>
          <span className="dot-separator">·</span>
          <span>{decision.owner ? 'Owner: ' + decision.owner : 'Owner unassigned'}</span>
        </div>
        <h1>{decision.title}</h1>
        <p>{decision.context || 'No context recorded yet.'}</p>
        <div className="detail-badges">
          <Badge>{decision.decisionType || 'Strategy'}</Badge>
          <Badge>{decision.confidence} confidence</Badge>
          <Badge>{decision.reversibility || 'Costly to reverse'}</Badge>
          {(decision.tags || []).map(tag => <Badge key={tag}>{tag}</Badge>)}
          {decision.killCriteria.some(k => k.triggered && !k.clearedAt) && <Badge tone="danger">Revisit required</Badge>}
          {urgency.level !== 'Stable' && <span title={urgency.reasons.join(' ')}><Badge tone={urgencyTone(urgency.level)}>{urgency.level}</Badge></span>}
          {badge && <Badge tone="danger">{badge}</Badge>}
          {decision.grade && (
            <Badge tone={gradeTone(decision.grade)}>{decision.grade}</Badge>
          )}
          <span className="detail-review-date">
            Review{' '}
            {decision.reviewDate
              ? formatDate(decision.reviewDate)
              : 'not scheduled'}
          </span>
        </div>
        <div className="choice-banner">
          <div className="choice-symbol">
            <Check size={18} />
          </div>
          <div>
            <span>FINAL CHOICE</span>
            <strong>{decision.choice}</strong>
          </div>
          <button className="primary-button" type="button" onClick={onReview}>
            <CheckCircle2 size={16} /> Review outcome
          </button>
        </div>
      </div>
      <nav className="detail-jump-nav" aria-label="Decision record sections">
        <a href="#decision-forecast">Forecast</a>
        <a href="#decision-scenarios">Scenarios</a>
        <a href="#decision-commitments">Commitments</a>
        <a href="#decision-kill-criteria">Stop rules</a>
        <a href="#decision-alternatives">Alternatives</a>
        <a href="#decision-assumptions">Assumptions</a>
        <a href="#decision-signals">Signals</a>
        <a href="#decision-review">Review</a>
        <a href="#decision-dependencies">Dependencies</a>
      </nav>
      <div className="detail-section-grid">
        <section className="panel detail-panel" id="decision-forecast">
          <div className="panel-heading">
            <div>
              <div className="section-kicker">FORECAST</div>
              <h2>Expected outcomes</h2>
            </div>
            <span className="horizon-tag">
              {decision.horizon || 'No horizon set'}
            </span>
          </div>
          <div className="forecast-grid">
            <div>
              <div className="forecast-label">
                <span className="forecast-dot upside-dot" /> Expected upside
              </div>
              <p>{decision.expectedUpside || 'Not recorded.'}</p>
            </div>
            <div>
              <div className="forecast-label">
                <span className="forecast-dot downside-dot" /> Expected downside
              </div>
              <p>{decision.expectedDownside || 'Not recorded.'}</p>
            </div>
          </div>
        </section>
        <section className="panel detail-panel">
          <div className="panel-heading">
            <div>
              <div className="section-kicker">EVIDENCE TRAIL</div>
              <h2>Linked documents</h2>
            </div>
            <Link2 size={18} className="muted-icon" />
          </div>
          {decision.links.length ? (
            <div className="link-list">
              {decision.links.map((link, index) => (
                <a
                  key={link + index}
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={14} />
                  <span>{link}</span>
                </a>
              ))}
            </div>
          ) : (
            <p className="muted-text">No documents or links attached.</p>
          )}
        </section>
      </div>
      <section className="panel detail-panel scenario-summary-panel" id="decision-scenarios">
        <div className="panel-heading"><div><div className="section-kicker">NUMERIC FORECAST</div><h2>Outcome scenarios</h2></div><Badge>{decision.scenarios.unit || 'Unit not specified'}</Badge></div>
        {(['best', 'base', 'worst'] as const).some(key => decision.scenarios[key].value.trim()) ? (
          <div className="scenario-summary-grid">
            {SCENARIO_OPTIONS.map(option => <div className="scenario-summary-card" key={option.key}>
              <span>{option.label}</span>
              <strong>{decision.scenarios[option.key].value || 'Not entered'}</strong>
              {decision.scenarios[option.key].probability && <small>{decision.scenarios[option.key].probability}% probability</small>}
            </div>)}
          </div>
        ) : <p className="muted-text">No numeric scenarios captured. Use Deep mode to record best, base and worst case numbers or ranges.</p>}
      </section>
      <section className="panel detail-panel commitments-panel" id="decision-commitments">
        <div className="panel-heading"><div><div className="section-kicker">EXECUTION</div><h2>Commitments</h2></div><Badge>{decision.commitments.filter(item => item.status === 'Open').length} open</Badge></div>
        {(decision.commitments || []).filter(item => item.text.trim()).length ? <div className="commitment-list">
          {decision.commitments.filter(item => item.text.trim()).map(item => {
            const overdue = item.status === 'Open' && item.dueDate && item.dueDate < todayISO();
            return <article className="commitment-row" key={item.id}>
              <div className="commitment-status-mark"><Badge tone={item.status === 'Done' ? 'good' : item.status === 'Missed' || overdue ? 'danger' : 'neutral'}>{overdue ? 'Overdue' : item.status}</Badge></div>
              <div className="commitment-copy"><strong>{item.text}</strong><small>{item.owner ? 'Owner: ' + item.owner : 'Owner unassigned'} · Due {item.dueDate ? formatDate(item.dueDate) : 'date not set'}</small></div>
              <div className="commitment-actions">
                {item.status !== 'Done' && <button className="secondary-button" type="button" onClick={() => onSetCommitmentStatus(item.id, 'Done')}>Mark done</button>}
                {item.status !== 'Missed' && <button className="secondary-button" type="button" onClick={() => onSetCommitmentStatus(item.id, 'Missed')}>Mark missed</button>}
                {item.status !== 'Open' && <button className="text-button" type="button" onClick={() => onSetCommitmentStatus(item.id, 'Open')}>Reopen</button>}
              </div>
            </article>;
          })}
        </div> : <p className="muted-text">No follow-up commitments recorded. Add owners and due dates in Deep mode.</p>}
      </section>
      <section className="panel detail-panel kill-criteria-panel" id="decision-kill-criteria">
        <div className="panel-heading"><div><div className="section-kicker">INVALIDATION RULES</div><h2>Kill criteria</h2></div><Badge>{decision.killCriteria.filter(k => k.text.trim()).length} defined</Badge></div>
        {decision.killCriteria.filter(k => k.text.trim()).length ? <div className="kill-criteria-list">{decision.killCriteria.filter(k => k.text.trim()).map(k => <div className="kill-criterion-row" key={k.id}>
          <div className="kill-criterion-copy"><strong>{k.text}</strong><small>{k.triggeredAt ? 'Triggered ' + formatDate(k.triggeredAt) : 'Not triggered'}</small></div>
          {k.triggered ? <Badge tone={k.clearedAt ? 'muted' : 'danger'}>{k.clearedAt ? 'Triggered · reviewed' : 'Triggered · revisit needed'}</Badge> : <button className="secondary-button trigger-button" type="button" onClick={() => onTriggerKill(k.id)}><ShieldAlert size={14}/> Criterion triggered</button>}
        </div>)}</div> : <p className="muted-text">No kill criteria were defined. Edit this decision to add measurable conditions that would invalidate it.</p>}
      </section>
      <section className="panel detail-panel alternatives-panel" id="decision-alternatives">
        <div className="panel-heading">
          <div>
            <div className="section-kicker">TRADE-OFFS</div>
            <h2>Alternatives considered</h2>
          </div>
          <span className="count-tag">
            {decision.alternatives.filter(a => a.text.trim()).length}
          </span>
        </div>
        {decision.alternatives.filter(a => a.text.trim()).length ? (
          <div className="alternatives-list">
            {decision.alternatives
              .filter(a => a.text.trim())
              .sort((a, b) => (a.rank || 999) - (b.rank || 999))
              .map((a, index) => (
                <div className="alternative-detail-row" key={a.id}>
                  <div className="alternative-number">
                    {String(a.rank || index + 1).padStart(2, '0')}
                  </div>
                  <div className="alternative-detail-copy">
                    <div>
                      <strong>{a.text}</strong>
                      {a.secondBest && <Badge tone="good">Second-best</Badge>}
                      {a.almostChosen && <Badge tone="warm">Almost chosen</Badge>}
                      {a.revived && <Badge tone="good">Revived</Badge>}
                    </div>
                    <p>{a.reason || 'No rejection reason recorded.'}</p>
                    {!a.revived && <button className="text-button revive-button" type="button" onClick={() => onReviveAlternative(a.id)}>Revive rejected alternative <ArrowUpRight size={13}/></button>}
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <p className="muted-text">
            No alternatives recorded. Keeping at least one serious alternative
            makes the trade-off easier to evaluate later.
          </p>
        )}
      </section>
      <section className="panel detail-panel assumptions-panel" id="decision-assumptions">
        <div className="panel-heading">
          <div>
            <div className="section-kicker">THE BELIEFS UNDER THE CHOICE</div>
            <h2>Assumption ledger</h2>
          </div>
          <div className="panel-heading-right">
            <span className="count-tag">
              {decision.assumptions.filter(a => a.text.trim()).length}
            </span>
            <button className="text-button" type="button" onClick={onEdit}>
              Edit assumptions <ArrowUpRight size={14} />
            </button>
          </div>
        </div>
        {decision.assumptions.filter(a => a.text.trim()).length ? (
          <div className="assumption-detail-list">
            {decision.assumptions
              .filter(a => a.text.trim())
              .map((a, index) => (
                <article className="assumption-detail-row" key={a.id}>
                  <div className="assumption-index">
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <div className="assumption-main">
                    <div className="assumption-detail-heading">
                      <strong>{a.text}</strong>
                      <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                    </div>
                    <div className="assumption-meta">
                      <span>{a.type}</span>
                      {a.owner && <span>Owner: <strong>{a.owner}</strong></span>}
                      <span>
                        Confidence: <strong>{a.confidence}</strong>
                      </span>
                      <span>
                        Impact if wrong:{' '}
                        <strong
                          className={a.impact === 'High' ? 'impact-high' : ''}
                        >
                          {a.impact}
                        </strong>
                      </span>
                      <span>Evidence: <strong>{a.evidence || 'None'}</strong></span>
                      <Badge tone={riskScore(a) >= 75 ? 'danger' : riskScore(a) >= 50 ? 'warm' : 'neutral'}>Risk {riskScore(a)}/100</Badge>
                    </div>
                    {a.signal && (
                      <div className="signal-note">
                        <Lightbulb size={14} />
                        <span>
                          <b>Disconfirming signal:</b> {a.signal}
                        </span>
                      </div>
                    )}
                  </div>
                </article>
              ))}
          </div>
        ) : (
          <EmptyState
            icon={<Target size={20} />}
            title="No assumptions recorded"
            description="Edit the decision to add specific beliefs, an impact rating, and a signal that could prove each belief wrong."
          />
        )}
      </section>
      <section className="panel detail-panel signal-log-panel" id="decision-signals">
        <div className="panel-heading">
          <div><div className="section-kicker">EVIDENCE BETWEEN REVIEWS</div><h2>Signal log</h2></div>
          <Badge>{(decision.signals || []).length} entries</Badge>
        </div>
        <p className="muted-text small">Record what you observed in seconds. Signals do not silently change an assumption's formal status; use a review when you are ready to reassess it.</p>
        <form className="signal-entry-form" onSubmit={submitSignal}>
          <label className="field"><span>Attach to</span><select value={signalTarget} onChange={e => setSignalTarget(e.target.value)}><option value="decision">This decision</option>{decision.assumptions.filter(a => a.text.trim()).map(a => <option key={a.id} value={'assumption:' + a.id}>Assumption: {a.text}</option>)}</select></label>
          <label className="field"><span>Date</span><input type="date" value={signalDate} onChange={e => setSignalDate(e.target.value)} required /></label>
          <label className="field"><span>Evidence stance</span><select value={signalStance} onChange={e => setSignalStance(e.target.value as SignalStance)}><option>Neutral</option><option>Supports</option><option>Weakens</option></select></label>
          <label className="field signal-observation-field"><span>What did you observe?</span><input autoComplete="off" value={signalObservation} onChange={e => setSignalObservation(e.target.value)} placeholder="Short observation — what happened?" required maxLength={500} /></label>
          <button className="primary-button" type="submit" disabled={!signalObservation.trim()}><Plus size={15}/> Log signal</button>
        </form>
        {(decision.signals || []).length ? <div className="signal-log-list">{decision.signals.slice().sort((a, b) => b.date.localeCompare(a.date)).map(signal => {
          const targetAssumption = signal.targetType === 'Assumption' ? decision.assumptions.find(a => a.id === signal.targetId) : undefined;
          return <article className="signal-log-row" key={signal.id}>
            <div className="signal-date">{formatDate(signal.date)}</div>
            <div className="signal-log-copy"><strong>{signal.observation}</strong><small>{signal.targetType === 'Decision' ? 'Decision-level evidence' : 'Assumption: ' + (targetAssumption?.text || 'Former / removed assumption')}</small></div>
            <Badge tone={signal.stance === 'Supports' ? 'good' : signal.stance === 'Weakens' ? 'danger' : 'neutral'}>{signal.stance}</Badge>
          </article>;
        })}</div> : <p className="muted-text small">No signal entries yet.</p>}
      </section>
      <div className="detail-section-grid">
        <section className="panel detail-panel" id="decision-review">
          <div className="panel-heading">
            <div>
              <div className="section-kicker">REVIEW</div>
              <h2>What happened?</h2>
            </div>
            {decision.reviewedAt && (
              <span className="horizon-tag">
                Reviewed {formatDate(decision.reviewedAt)}
              </span>
            )}
          </div>
          {decision.reviewOutcome || decision.lessons || decision.grade ? (
            <div className="review-result">
              <div className="review-grade-row">
                <span>Decision grade</span>
                <Badge tone={gradeTone(decision.grade)}>
                  {decision.grade || 'Not graded'}
                </Badge>
              </div>
              <p>{decision.reviewOutcome || 'No outcome notes recorded.'}</p>
              {decision.lessons && (
                <div className="lesson-box">
                  <div>
                    <Lightbulb size={15} /> Lesson learned
                  </div>
                  <p>{decision.lessons}</p>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              icon={<CalendarClock size={20} />}
              title="No review logged yet"
              description="When the review date arrives, record what actually happened and update each assumption status."
              action={
                <button
                  className="text-button"
                  type="button"
                  onClick={onReview}
                >
                  Start a review <ArrowUpRight size={14} />
                </button>
              }
            />
          )}
        </section>
        <section className="panel detail-panel" id="decision-dependencies">
          <div className="panel-heading">
            <div>
              <div className="section-kicker">DEPENDENCIES</div>
              <h2>Related decisions</h2>
            </div>
            <GitBranch size={18} className="muted-icon" />
          </div>
          {related.length || inbound.length ? (
            <div className="related-list">
              {related.map(d => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onOpenRelated(d.id)}
                >
                  <Link2 size={15} />
                  <span>
                    <strong>{d.title}</strong>
                    <small>This decision depends on it</small>
                  </span>
                  <ArrowUpRight size={14} />
                </button>
              ))}
              {inbound.map(d => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onOpenRelated(d.id)}
                >
                  <GitBranch size={15} />
                  <span>
                    <strong>{d.title}</strong>
                    <small>Depends on this decision</small>
                  </span>
                  <ArrowUpRight size={14} />
                </button>
              ))}
            </div>
          ) : (
            <p className="muted-text">
              No linked decisions. Add links when editing to record
              dependencies.
            </p>
          )}
        </section>
      </div>
      {(decision.versions || []).length > 0 && <section className="panel detail-panel version-history-panel">
        <div className="panel-heading"><div><div className="section-kicker">CHANGE RECORD</div><h2>Decision version history</h2></div><Badge>{decision.versions.length} snapshot(s)</Badge></div>
        <div className="version-history-list">{decision.versions.slice().reverse().map(v => <details className="version-record" key={v.id}>
          <summary><span><strong>{v.summary}</strong><small>{formatDate(v.savedAt)} · {new Date(v.savedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</small></span><ArrowUpRight size={14}/></summary>
          <pre>{v.snapshot}</pre>
        </details>)}</div>
      </section>}
      <div className="detail-end-note">
        <ShieldAlert size={16} />
        <span>
          This record is stored in this browser only. Export Markdown or a JSON
          backup before clearing browser data or switching devices.
        </span>
      </div>
    </div>
  );
}


function PortfolioRiskView({ items, decisions, projects, onOpen }: {
  items: { decision: Decision; assumption: Assumption }[];
  decisions: Decision[];
  projects: string[];
  onOpen: (id: string) => void;
}) {
  const highRiskCount = items.length;
  const projectRisk = projects.map(project => ({
    project,
    count: decisions.filter(d => d.project === project).reduce((sum, d) => sum + d.assumptions.filter(a => riskScore(a) >= 50 && ['Active', 'Weakened', 'Uncertain'].includes(a.status)).length, 0),
    decisions: decisions.filter(d => d.project === project).length,
  })).sort((a,b) => b.count-a.count);
  return <div className="page-content advanced-page">
    <div className="page-intro-row"><div><h1>Portfolio risk</h1><p className="page-subtitle">Open assumptions ranked by risk score across every project. The score combines impact and stated confidence; evidence quality is shown separately.</p></div></div>
    <div className="metric-grid">
      <MetricCard label="OPEN HIGH-RISK ASSUMPTIONS" value={String(highRiskCount)} hint="Active, weakened, or uncertain; risk ≥ 50" icon={<ShieldAlert size={18}/>} emphasis={highRiskCount > 0}/>
      <MetricCard label="ONE-WAY DOOR DECISIONS" value={String(decisions.filter(d => d.reversibility === 'One-way door').length)} hint="Hard to reverse once committed" icon={<GitBranch size={18}/>}/>
      <MetricCard label="DECISIONS WITH KILL CRITERIA" value={String(decisions.filter(d => d.killCriteria.some(k => k.text.trim())).length)} hint="Explicit invalidation rules recorded" icon={<Target size={18}/>}/>
      <MetricCard label="TRIGGERED CRITERIA" value={String(decisions.reduce((sum,d)=>sum+d.killCriteria.filter(k=>k.triggered&&!k.clearedAt).length,0))} hint="Need a fresh review" icon={<ShieldAlert size={18}/>} emphasis={decisions.some(d => d.killCriteria.some(k => k.triggered && !k.clearedAt))}/>
    </div>
    <section className="panel"><div className="panel-heading"><div><div className="section-kicker">RISK REGISTER</div><h2>Assumptions requiring attention</h2></div><Badge>{items.length} open</Badge></div>
      {items.length ? <div className="risk-register">{items.slice().sort((a,b)=>riskScore(b.assumption)-riskScore(a.assumption)).map(({decision,assumption})=><button className="risk-register-row" type="button" key={decision.id+assumption.id} onClick={()=>onOpen(decision.id)}>
        <span className="risk-score" data-level={riskScore(assumption)>=75?'high':riskScore(assumption)>=50?'medium':'low'}>{riskScore(assumption)}</span>
        <span className="risk-register-copy"><strong>{assumption.text}</strong><small>{decision.title} · {decision.project} · {assumption.type}</small><small>Signal: {assumption.signal || 'No monitoring signal recorded'} · Evidence: {assumption.evidence || 'None'}</small></span>
        <span className="risk-register-right"><Badge tone={assumption.impact==='High'?'danger':'neutral'}>{assumption.impact} impact</Badge><ArrowUpRight size={16}/></span>
      </button>)}</div> : <EmptyState icon={<CheckCircle2 size={20}/>} title="No open high-risk assumptions" description="Capture assumption impact and confidence. Risk scores of 50 or above appear here while assumptions remain unresolved."/>}
    </section>
    <section className="panel"><div className="panel-heading"><div><div className="section-kicker">CONCENTRATION RISK</div><h2>Where critical assumptions cluster</h2></div></div>
      <div className="concentration-list">{projectRisk.map(item=><button className="concentration-row" key={item.project} type="button" onClick={()=>onOpen(decisions.find(d=>d.project===item.project)?.id || '')} disabled={!item.decisions}><span><strong>{item.project}</strong><small>{item.decisions} decision(s)</small></span><div className="type-track"><div style={{width:(item.count/Math.max(1,...projectRisk.map(p=>p.count))*100)+'%'}}/></div><Badge tone={item.count>=4?'danger':item.count>=2?'warm':'neutral'}>{item.count} risky assumption(s)</Badge></button>)}</div>
      <p className="muted-text small">Concentration is shown per project. Project sizes differ, so compare counts alongside the number of decisions and your knowledge of the underlying exposure.</p>
    </section>
  </div>;
}
function StrategicBetsView({ decisions, onOpen }: { decisions: Decision[]; onOpen: (id: string) => void }) {
  const bets = decisions.filter(d => d.assumptions.some(a => a.impact === 'High' && a.confidence !== 'High' && ['Active','Weakened','Uncertain'].includes(a.status)));
  return <div className="page-content advanced-page"><div className="page-intro-row"><div><h1>Strategic bets</h1><p className="page-subtitle">Decisions whose high-impact assumptions are not yet strongly supported. These are candidates for extra evidence, monitoring, or a staged commitment.</p></div></div>
    <div className="metric-grid"><MetricCard label="STRATEGIC BETS" value={String(bets.length)} hint="High impact + confidence below High" icon={<Target size={18}/>} emphasis={bets.length>0}/><MetricCard label="ONE-WAY DOOR BETS" value={String(bets.filter(d=>d.reversibility==='One-way door').length)} hint="High consequence to reverse" icon={<GitBranch size={18}/>}/></div>
    {bets.length ? <div className="decision-list">{bets.map(d=><DecisionRow key={d.id} decision={d} onClick={()=>onOpen(d.id)}/>)}</div> : <EmptyState icon={<CheckCircle2 size={20}/>} title="No strategic bets flagged" description="A decision appears here when it has an unresolved, high-impact assumption with Low or Medium confidence."/>}
  </div>;
}
function DependenciesView({ decisions, onOpen }: { decisions: Decision[]; onOpen: (id: string) => void }) {
  return <div className="page-content advanced-page"><div className="page-intro-row"><div><h1>Decision dependencies</h1><p className="page-subtitle">A readable dependency map. “Rests on” means the decision links to an earlier decision; incoming links show which choices depend on the current one.</p></div></div>
    <section className="panel dependency-list">{decisions.length ? decisions.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(d=>{
      const upstream=d.relatedIds.map(id=>decisions.find(x=>x.id===id)).filter(Boolean) as Decision[];
      const downstream=decisions.filter(x=>x.relatedIds.includes(d.id));
      return <div className="dependency-row" key={d.id}><button type="button" className="dependency-node" onClick={()=>onOpen(d.id)}><strong>{d.title}</strong><small>{d.project} · {formatDate(d.date)}</small><span>{d.decisionType} · {d.reversibility}</span></button><div className="dependency-links"><div><span className="dependency-label">RESTS ON</span>{upstream.length ? upstream.map(x=><button type="button" key={x.id} onClick={()=>onOpen(x.id)}><ArrowLeft size={13}/>{x.title}</button>) : <small>No upstream decision linked</small>}</div><div><span className="dependency-label">ENABLES / INFLUENCES</span>{downstream.length ? downstream.map(x=><button type="button" key={x.id} onClick={()=>onOpen(x.id)}><ArrowUpRight size={13}/>{x.title}</button>) : <small>No downstream decision linked</small>}</div></div></div>;
    }) : <EmptyState icon={<GitBranch size={20}/>} title="No dependency graph yet" description="Create at least two decisions and link an earlier decision from the capture form."/>}</section>
  </div>;
}
function CompareDecisionsView({ decisions, compareA, compareB, onCompareA, onCompareB, onOpen }: {
  decisions: Decision[];
  compareA: string;
  compareB: string;
  onCompareA: (id: string) => void;
  onCompareB: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const [mode, setMode] = useState<'decisions' | 'alternatives'>('decisions');
  const [alternativeDecisionId, setAlternativeDecisionId] = useState('');
  const [alternativeA, setAlternativeA] = useState('');
  const [alternativeB, setAlternativeB] = useState('');
  const leftId = compareA || decisions[0]?.id || '';
  const rightId = compareB || decisions.find(d => d.id !== leftId)?.id || leftId;
  const left = decisions.find(d => d.id === leftId);
  const right = decisions.find(d => d.id === rightId);
  const renderColumn = (d: Decision) => (
    <div className="compare-column" key={d.id}>
      <button className="compare-title" type="button" onClick={() => onOpen(d.id)}>
        <strong>{d.title}</strong><ArrowUpRight size={15}/>
      </button>
      <div className="compare-choice">{d.choice}</div>
      <CompareField label="Type" value={d.decisionType}/>
      <CompareField label="Confidence" value={d.confidence}/>
      <CompareField label="Reversibility" value={d.reversibility}/>
      <CompareField label="Time horizon" value={d.horizon || 'Not set'}/>
      <CompareField label="Review status" value={isReviewDue(d) ? 'Due / overdue' : d.reviewedAt ? 'Reviewed' : 'Not reviewed'}/>
      <CompareField label="Highest assumption risk" value={d.assumptions.length ? Math.max(...d.assumptions.map(riskScore)) + '/100' : 'No assumptions'}/>
      <CompareField label="Open high-impact assumptions" value={String(d.assumptions.filter(a => a.impact === 'High' && ['Active', 'Weakened', 'Uncertain'].includes(a.status)).length)}/>
      <CompareField label="Decision grade" value={d.grade || 'Not graded'}/>
      <div className="compare-text"><span>Expected upside</span><p>{d.expectedUpside || 'Not recorded'}</p></div>
      <div className="compare-text"><span>Expected downside</span><p>{d.expectedDownside || 'Not recorded'}</p></div>
    </div>
  );
  const optionDecision = decisions.find(d => d.id === alternativeDecisionId) || decisions[0];
  const options = (optionDecision?.alternatives || []).filter(a => a.text.trim()).slice().sort((a, b) => (a.rank || 999) - (b.rank || 999));
  const optionAId = alternativeA || options[0]?.id || '';
  const optionBId = alternativeB || options.find(a => a.id !== optionAId)?.id || '';
  const optionLeft = options.find(a => a.id === optionAId);
  const optionRight = options.find(a => a.id === optionBId);
  const renderAlternative = (a: Alternative, d: Decision) => (
    <div className="compare-column" key={a.id}>
      <div className="compare-title"><strong>Rank {a.rank || '—'} · {a.text}</strong><Badge tone={a.secondBest ? 'good' : 'neutral'}>{a.secondBest ? 'Second-best' : 'Alternative'}</Badge></div>
      <div className="compare-choice">{a.reason || 'No rejection reason recorded.'}</div>
      <CompareField label="Almost chosen" value={a.almostChosen ? 'Yes' : 'No'}/>
      <CompareField label="Previously revived" value={a.revived ? 'Yes' : 'No'}/>
      <CompareField label="Current final choice" value={d.choice}/>
      <CompareField label="Decision type" value={d.decisionType}/>
      <CompareField label="Reversibility" value={d.reversibility}/>
      <CompareField label="Highest assumption risk" value={d.assumptions.length ? Math.max(...d.assumptions.map(riskScore)) + '/100' : 'No assumptions'}/>
      <div className="compare-text"><span>Assumptions recorded for this decision</span><p>{d.assumptions.filter(x => x.text.trim()).slice(0, 5).map(x => '• ' + x.text + ' (risk ' + riskScore(x) + '/100)').join('\n') || 'No assumptions recorded'}</p></div>
    </div>
  );
  return <div className="page-content advanced-page">
    <div className="page-intro-row"><div><h1>Compare</h1><p className="page-subtitle">Compare complete decision records or two ranked alternatives inside one decision. The comparison makes trade-offs visible; it does not automatically choose a winner.</p></div></div>
    <div className="compare-mode-switch">
      <button type="button" className={mode === 'decisions' ? 'active' : ''} onClick={() => setMode('decisions')}>Compare decisions</button>
      <button type="button" className={mode === 'alternatives' ? 'active' : ''} onClick={() => setMode('alternatives')}>Compare alternatives</button>
    </div>
    {mode === 'decisions' ? (
      decisions.length < 2 ? <EmptyState icon={<ListChecks size={20}/>} title="Two decisions needed" description="Capture at least two decisions to compare their trade-offs and risk."/> : <>
        <div className="compare-selectors">
          <label className="field"><span>Decision A</span><select value={leftId} onChange={e => onCompareA(e.target.value)}>{decisions.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</select></label>
          <label className="field"><span>Decision B</span><select value={rightId} onChange={e => onCompareB(e.target.value)}>{decisions.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</select></label>
        </div>
        {left && right && left.id === right.id ? <p className="muted-text">Choose two different decisions for a meaningful comparison.</p> : <div className="compare-grid">{left && renderColumn(left)}{right && renderColumn(right)}</div>}
      </>
    ) : decisions.length === 0 ? <EmptyState icon={<ListChecks size={20}/>} title="No alternatives yet" description="Create a decision and add at least two alternatives in Deep capture mode."/> : <>
      <div className="compare-selectors">
        <label className="field"><span>Decision containing alternatives</span><select value={optionDecision?.id || ''} onChange={e => { setAlternativeDecisionId(e.target.value); setAlternativeA(''); setAlternativeB(''); }}>{decisions.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</select></label>
        <label className="field"><span>Selected decision</span><input readOnly value={optionDecision?.choice || 'No final choice recorded'}/></label>
        <label className="field"><span>Alternative A</span><select value={optionAId} onChange={e => setAlternativeA(e.target.value)}>{options.map(a => <option key={a.id} value={a.id}>#{a.rank || '—'} · {a.text}</option>)}</select></label>
        <label className="field"><span>Alternative B</span><select value={optionBId} onChange={e => setAlternativeB(e.target.value)}>{options.map(a => <option key={a.id} value={a.id}>#{a.rank || '—'} · {a.text}</option>)}</select></label>
      </div>
      {!optionDecision || options.length < 2 ? <EmptyState icon={<ListChecks size={20}/>} title="Two alternatives needed" description="Select a decision with at least two named alternatives to compare rank, rejection rationale, and risk context."/> : optionAId === optionBId ? <p className="muted-text">Choose two distinct alternatives.</p> : <div className="compare-grid">{optionLeft && renderAlternative(optionLeft, optionDecision)}{optionRight && renderAlternative(optionRight, optionDecision)}</div>}
    </>}
  </div>;
}
function CompareField({ label, value }: { label:string; value:string }) {
  return <div className="compare-field"><span>{label}</span><strong>{value}</strong></div>;
}
function LessonsLibraryView({ decisions, query, onQueryChange, onOpen }: { decisions: Decision[]; query: string; onQueryChange: (value:string)=>void; onOpen: (id:string)=>void }) {
  const needle=query.trim().toLowerCase();
  const lessons=decisions.filter(d=>d.lessons.trim()).filter(d=>!needle || [d.title,d.project,d.lessons,d.reviewOutcome,d.decisionType,...d.tags].join(' ').toLowerCase().includes(needle)).sort((a,b)=>(b.reviewedAt||b.updatedAt).localeCompare(a.reviewedAt||a.updatedAt));
  return <div className="page-content advanced-page"><div className="page-intro-row"><div><h1>Lessons library</h1><p className="page-subtitle">A searchable archive of reflections connected to the decisions that produced them.</p></div></div>
    <section className="filter-panel"><div className="search-wrap"><Search size={17}/><input value={query} onChange={e=>onQueryChange(e.target.value)} placeholder="Search lessons, outcomes, projects…" aria-label="Search lessons"/></div><span className="results-meta">{lessons.length} lesson record(s)</span></section>
    {lessons.length ? <div className="lesson-library">{lessons.map(d=><article className="lesson-card" key={d.id}><div className="lesson-card-heading"><div><div className="section-kicker">{d.project} · {formatDate(d.reviewedAt||d.updatedAt)}</div><h3>{d.title}</h3></div><button className="text-button" type="button" onClick={()=>onOpen(d.id)}>Open decision <ArrowUpRight size={14}/></button></div><p>{d.lessons}</p>{d.reviewOutcome&&<div className="lesson-outcome"><span>Observed outcome</span><p>{d.reviewOutcome}</p></div>}</article>)}</div> : <EmptyState icon={<Lightbulb size={20}/>} title="No lessons captured yet" description="Write a short reflection during a review. It will be searchable here alongside its decision context."/>}
  </div>;
}

export default App;
