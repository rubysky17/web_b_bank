import type { ExamReport, ReportDomain } from '@/api/reports';

import { assignSlots, compareRows, mergeDomains, reportInsights, singleRows } from './rows';

function domain(domainId: string | null, name: string | null): ReportDomain {
  return {
    domainId,
    name,
    total: 4,
    correct: 2,
    wrong: 1,
    unanswered: 1,
    correctPercent: 50,
    avgTimePerAnswerMs: null,
  };
}

function report(examId: string, domains: ReportDomain[]): ExamReport {
  return {
    examId,
    examTitle: `Exam ${examId}`,
    summary: {
      attemptCount: 1,
      avgCorrectPercent: 50,
      latestCorrectPercent: 50,
      bestCorrectPercent: 50,
      avgTimePerAnswerMs: null,
      timeSource: null,
      outcomes: { total: 4, correct: 2, wrong: 1, unanswered: 1 },
    },
    attempts: [],
    domains,
  };
}

const people = domain('d-people', 'People');
const processDomain = domain('d-process', 'Process');
const business = domain('d-business', 'Business');
const none = domain(null, null);

describe('singleRows', () => {
  it('lists the fixed sections, then one row per domain', () => {
    const rows = singleRows(report('a', [people, none]));
    expect(rows.map((row) => row.key)).toEqual([
      'hero',
      'kpis',
      'outcomes',
      'trend',
      'h-domains',
      'd-d-people',
      'd-∅',
      'activity',
      'insights',
    ]);
  });

  it('drops the domain heading when there is no domain data', () => {
    expect(singleRows(report('a', [])).map((row) => row.kind)).toEqual([
      'hero',
      'kpis',
      'outcomes',
      'trend',
      'activity',
    ]);
  });
});

describe('reportInsights', () => {
  const at = (id: string, correctPercent: number, avgTimePerAnswerMs: number | null) => ({
    ...domain(id, id),
    correctPercent,
    avgTimePerAnswerMs,
  });

  it('picks the strongest, weakest and slowest named domains', () => {
    const insights = reportInsights(
      report('a', [at('people', 80, 40_000), at('process', 60, 70_000), domain(null, null)]),
    );
    expect(insights?.strongest.domainId).toBe('people');
    expect(insights?.weakest?.domainId).toBe('process');
    expect(insights?.slowest?.domainId).toBe('process');
  });

  it('has no weakest with a single domain, and nothing without named domains', () => {
    expect(reportInsights(report('a', [at('people', 80, null)]))?.weakest).toBeNull();
    expect(reportInsights(report('a', [at('people', 80, null)]))?.slowest).toBeNull();
    expect(reportInsights(report('a', [domain(null, null)]))).toBeNull();
  });
});

describe('mergeDomains', () => {
  it('unions the domains by id, aligned to the exams, unassigned last', () => {
    const merged = mergeDomains([
      report('a', [people, none]),
      report('b', [processDomain, people]),
    ]);
    expect(merged.map((row) => [row.name, row.byExam.map((d) => d?.domainId)])).toEqual([
      ['People', ['d-people', 'd-people']],
      ['Process', [undefined, 'd-process']],
      [null, [null, undefined]],
    ]);
  });
});

describe('compareRows', () => {
  it('puts the trend first, then one row per exam, then the merged domains', () => {
    const rows = compareRows([report('a', [business]), report('b', [])]);
    expect(rows.map((row) => row.key)).toEqual([
      'trend',
      'h-exams',
      'e-a',
      'e-b',
      'h-domains',
      'd-d-business',
    ]);
  });
});

describe('assignSlots', () => {
  it('numbers a first selection in order', () => {
    expect(assignSlots([], ['a', 'b'], 5)).toEqual([
      { examId: 'a', slot: 0 },
      { examId: 'b', slot: 1 },
    ]);
  });

  it('keeps existing colors and gives new exams the lowest free slot', () => {
    const before = assignSlots([], ['a', 'b', 'c'], 5);
    expect(assignSlots(before, ['a', 'c', 'd'], 5)).toEqual([
      { examId: 'a', slot: 0 },
      { examId: 'c', slot: 2 },
      { examId: 'd', slot: 1 },
    ]);
  });

  it('never selects more exams than there are slots', () => {
    expect(assignSlots([], ['a', 'b', 'c'], 2)).toHaveLength(2);
  });
});
