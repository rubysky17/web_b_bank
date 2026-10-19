import { CircleHelp, FileText, Image, Play, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import type { Difficulty } from '@/api/attempts';
import {
  type BankFacets,
  type BankFilters,
  useBankFacets,
  useBankQuestions,
} from '@/api/question-bank';
import { BrandCard } from '@/components/app/brand';
import { FilterPill, PillRow } from '@/components/app/filter-pill';
import { IconTile, toneFor } from '@/components/app/icon-tile';
import { CenteredSpinner, EmptyView, ErrorView, LoadingView } from '@/components/app/states';
import { Page, PageTitle } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useLoadMore } from '@/hooks/use-load-more';

import { toParams } from './filters';

/** Every published question, filterable by exam, section, domain and difficulty. */
export function BankScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<BankFilters>({});
  const { data: facets, error: facetsError, refetch: refetchFacets } = useBankFacets();
  const { data, error, isPending, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useBankQuestions(filters);
  const sentinel = useLoadMore(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, Boolean(hasNextPage) && facets !== undefined);

  const practice = (start: number) =>
    void navigate(`/practice?${new URLSearchParams(toParams(filters, start))}`);

  return (
    <Page className="gap-4">
      <PageTitle title={t('bank.title')} subtitle={t('bank.subtitle')} />
      {!facets ? (
        facetsError ? (
          <ErrorView error={facetsError} onRetry={refetchFacets} />
        ) : (
          <LoadingView />
        )
      ) : (
        <>
          <PracticeCard
            count={data?.total ?? null}
            onPress={data && data.total > 0 ? () => practice(0) : undefined}
          />
          <FilterBar facets={facets} filters={filters} onChange={setFilters} />
          {isPending ? (
            <CenteredSpinner />
          ) : error && !data ? (
            <ErrorView error={error} onRetry={refetch} />
          ) : data && data.items.length === 0 ? (
            <EmptyView message={t('bank.empty')} />
          ) : (
            <div className="flex flex-col gap-3">
              {data?.items.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => practice(index)}
                  className="text-left"
                >
                  <Card className="flex flex-col gap-3 transition hover:border-primary/50">
                    <div className="flex items-center gap-3">
                      <IconTile
                        tone={toneFor(item.domain?.id ?? item.examTitle)}
                        icon={CircleHelp}
                        size="sm"
                      />
                      <p className="line-clamp-2 flex-1 text-xs text-muted-foreground">
                        {`${item.examTitle} · ${item.sectionTitle} · ${t('question.number', {
                          n: item.sourceNumber ?? item.order,
                        })}`}
                      </p>
                      {item.caseStudy !== null ? (
                        <FileText className="size-4 text-muted-foreground" />
                      ) : null}
                      {item.media.some((m) => m.placement === 'CONTENT') ? (
                        <Image className="size-4 text-muted-foreground" />
                      ) : null}
                    </div>
                    <p className="line-clamp-3 leading-relaxed">{item.content}</p>
                    <div className="flex flex-wrap gap-2">
                      {item.domain ? <Badge variant="primary">{item.domain.name}</Badge> : null}
                      <Badge>{t(`difficulty.${item.difficulty}`)}</Badge>
                    </div>
                  </Card>
                </button>
              ))}
            </div>
          )}
          <div ref={sentinel} />
          {isFetchingNextPage ? <CenteredSpinner /> : null}
        </>
      )}
    </Page>
  );
}

function FilterBar({
  facets,
  filters,
  onChange,
}: {
  facets: BankFacets;
  filters: BankFilters;
  onChange: (filters: BankFilters) => void;
}) {
  const { t } = useTranslation();
  const exam = facets.exams.find((e) => e.id === filters.examId);
  return (
    <div className="flex flex-col gap-2">
      <ChipRow
        options={facets.exams.map((e) => ({ value: e.id, label: e.title }))}
        value={filters.examId}
        allLabel={t('bank.allExams')}
        // Sections belong to one exam: changing the exam resets the section.
        onSelect={(examId) => onChange({ ...filters, examId, sectionId: undefined })}
      />
      {exam ? (
        <ChipRow
          options={exam.sections.map((s) => ({ value: s.id, label: s.title }))}
          value={filters.sectionId}
          allLabel={t('bank.allSections')}
          onSelect={(sectionId) => onChange({ ...filters, sectionId })}
        />
      ) : null}
      <ChipRow
        options={facets.domains.map((d) => ({ value: d.id, label: d.name }))}
        value={filters.domainId}
        allLabel={t('bank.allDomains')}
        onSelect={(domainId) => onChange({ ...filters, domainId })}
      />
      <ChipRow
        options={facets.difficulties.map((d) => ({
          value: d.difficulty,
          label: t(`difficulty.${d.difficulty}`),
        }))}
        value={filters.difficulty}
        allLabel={t('bank.allDifficulties')}
        onSelect={(difficulty) =>
          onChange({ ...filters, difficulty: difficulty as Difficulty | undefined })
        }
      />
    </div>
  );
}

/** One filter: "All" plus one chip per value. */
function ChipRow({
  options,
  value,
  allLabel,
  onSelect,
}: {
  options: { value: string; label: string }[];
  value: string | undefined;
  allLabel: string;
  onSelect: (value: string | undefined) => void;
}) {
  const choices = [{ value: undefined, label: allLabel }, ...options];
  return (
    <PillRow>
      {choices.map((choice) => (
        <FilterPill
          key={choice.value ?? 'all'}
          label={choice.label}
          isSelected={choice.value === value}
          onPress={() => onSelect(choice.value)}
        />
      ))}
    </PillRow>
  );
}

/** Gradient call to action: practice the filtered questions with explanations. */
function PracticeCard({ count, onPress }: { count: number | null; onPress?: () => void }) {
  const { t } = useTranslation();
  return (
    <BrandCard className="text-on-brand">
      <span className="flex items-center gap-1 self-start rounded-full bg-on-brand-subtle px-2 py-1 text-xs font-semibold">
        <Sparkles className="size-3" />
        {t('bank.eyebrow')}
      </span>
      <p className="min-h-8 text-2xl font-bold">{count === null ? '' : t('bank.count', { count })}</p>
      <p className="text-sm text-on-brand-muted">{t('bank.cardHint')}</p>
      {onPress ? (
        <button
          type="button"
          onClick={onPress}
          className="flex h-11 items-center gap-2 self-start rounded-full bg-on-brand px-5 font-medium text-brand-end transition hover:brightness-95"
        >
          <Play className="size-4 fill-current" />
          {t('bank.practice')}
        </button>
      ) : null}
    </BrandCard>
  );
}
