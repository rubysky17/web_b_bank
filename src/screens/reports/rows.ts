/**
 * Report dashboards flattened into list rows (pure, no React), like the result screen's breakdown.
 */
import type { ExamReport, ReportDomain } from '@/api/reports';

export type SingleRow =
  | { kind: 'hero'; key: string }
  | { kind: 'kpis'; key: string }
  | { kind: 'outcomes'; key: string }
  | { kind: 'trend'; key: string }
  | { kind: 'heading'; key: string; title: 'byDomain' }
  | { kind: 'domain'; key: string; domain: ReportDomain; index: number }
  | { kind: 'activity'; key: string }
  | { kind: 'insights'; key: string; insights: ReportInsights };

export type CompareRow =
  | { kind: 'trend'; key: string }
  | { kind: 'heading'; key: string; title: 'byDomain' | 'overview' }
  | { kind: 'exam'; key: string; report: ExamReport; index: number }
  | { kind: 'domain'; key: string; domain: DomainComparison };

/** One domain across the compared exams; `byExam[i]` is null when exam i has no such questions. */
export type DomainComparison = {
  key: string;
  name: string | null;
  byExam: (ReportDomain | null)[];
};

/** A compared exam and its color slot (index into the chart series colors). */
export type Selection = { examId: string; slot: number };

const NO_DOMAIN = '∅';
const domainKey = (domain: Pick<ReportDomain, 'domainId'>) => domain.domainId ?? NO_DOMAIN;

/** By name; questions without a domain last. */
const byDomainName = (a: { name: string | null }, b: { name: string | null }) =>
  a.name === null ? 1 : b.name === null ? -1 : a.name.localeCompare(b.name);

export function singleRows(report: ExamReport): SingleRow[] {
  const insights = reportInsights(report);
  return [
    { kind: 'hero', key: 'hero' },
    { kind: 'kpis', key: 'kpis' },
    { kind: 'outcomes', key: 'outcomes' },
    { kind: 'trend', key: 'trend' },
    ...(report.domains.length > 0
      ? [
          { kind: 'heading' as const, key: 'h-domains', title: 'byDomain' as const },
          ...report.domains.map((domain, index) => ({
            kind: 'domain' as const,
            key: `d-${domainKey(domain)}`,
            domain,
            index,
          })),
        ]
      : []),
    { kind: 'activity', key: 'activity' },
    ...(insights ? [{ kind: 'insights' as const, key: 'insights', insights }] : []),
  ];
}

export type ReportInsights = {
  strongest: ReportDomain;
  /** null when it would be the same domain as the strongest. */
  weakest: ReportDomain | null;
  /** Domain with the longest measured time per answer; null when none was timed. */
  slowest: ReportDomain | null;
};

/** Strongest / weakest / slowest named domain, from domains with answered questions. */
export function reportInsights(report: ExamReport): ReportInsights | null {
  const named = report.domains.filter((d) => d.name !== null && d.total > 0);
  if (named.length === 0) return null;
  const byPercent = [...named].sort((a, b) => b.correctPercent - a.correctPercent);
  const strongest = byPercent[0]!;
  const weakest = byPercent[byPercent.length - 1]!;
  const timed = named.filter((d) => d.avgTimePerAnswerMs !== null);
  const slowest = timed.length
    ? timed.reduce((a, b) => ((b.avgTimePerAnswerMs ?? 0) > (a.avgTimePerAnswerMs ?? 0) ? b : a))
    : null;
  return { strongest, weakest: weakest === strongest ? null : weakest, slowest };
}

/** Union of the exams' domains, aligned to the exams' order. */
export function mergeDomains(reports: readonly ExamReport[]): DomainComparison[] {
  const rows = new Map<string, DomainComparison>();
  reports.forEach((report, index) => {
    for (const domain of report.domains) {
      const key = domainKey(domain);
      const row = rows.get(key) ?? { key, name: domain.name, byExam: reports.map(() => null) };
      row.byExam[index] = domain;
      rows.set(key, row);
    }
  });
  return [...rows.values()].sort(byDomainName);
}

export function compareRows(reports: readonly ExamReport[]): CompareRow[] {
  const domains = mergeDomains(reports);
  return [
    { kind: 'trend', key: 'trend' },
    { kind: 'heading', key: 'h-exams', title: 'overview' },
    ...reports.map((report, index) => ({
      kind: 'exam' as const,
      key: `e-${report.examId}`,
      report,
      index,
    })),
    ...(domains.length > 0
      ? [
          { kind: 'heading' as const, key: 'h-domains', title: 'byDomain' as const },
          ...domains.map((domain) => ({ kind: 'domain' as const, key: `d-${domain.key}`, domain })),
        ]
      : []),
  ];
}

/**
 * Color slots for a new selection: exams already shown keep their color, new ones take the lowest
 * free slot, so adding or removing an exam never repaints the others.
 */
export function assignSlots(
  previous: readonly Selection[],
  nextIds: readonly string[],
  slotCount: number,
): Selection[] {
  const ids = nextIds.slice(0, slotCount);
  const kept = new Map(previous.map((s) => [s.examId, s.slot]));
  const used = new Set(ids.flatMap((id) => (kept.has(id) ? [kept.get(id)!] : [])));
  return ids.map((examId) => {
    const slot = kept.get(examId);
    if (slot !== undefined) return { examId, slot };
    let free = 0;
    while (used.has(free)) free++;
    used.add(free);
    return { examId, slot: free };
  });
}
