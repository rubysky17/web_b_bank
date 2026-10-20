import {
  ArrowRight,
  ChevronLeft,
  CircleCheck,
  CircleMinus,
  CircleX,
  Flag,
  LayoutGrid,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router';

import { type ReviewQuestion, useAttemptReview } from '@/api/attempts';
import { FilterPill } from '@/components/app/filter-pill';
import { EmptyView, ErrorView, LoadingView } from '@/components/app/states';
import { ActionBar, TopBar } from '@/components/app/top-bar';
import { FocusPage } from '@/components/layout/app-shell';
import {
  AnswerView,
  Explanation,
  parseAnswer,
  parseInput,
  parseKey,
  QuestionStem,
  QuestionTags,
  useQuestionLabel,
} from '@/components/question';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { NoteModeBanner, NoteToggle } from '@/components/vocab/note-toggle';
import { VocabScope } from '@/components/vocab/vocab-scope';
import { exitNoteMode, toggleNoteMode } from '@/components/vocab/vocab-ui-store';
import { cn } from '@/lib/utils';
import { useQuestionHotkeys } from '@/screens/attempt/use-hotkeys';

import {
  activeCount,
  filterOptions,
  fromReviewParams,
  matches,
  NO_DOMAIN,
  NO_FILTERS,
  type Outcome,
  outcomeOf,
  type ReviewFilters,
  toggle,
  toReviewParams,
  wasFlagged,
} from './review-filters';

export function ReviewRoute() {
  const { id = '' } = useParams();
  const [searchParams] = useSearchParams();
  const { filters, questionId } = fromReviewParams(Object.fromEntries(searchParams));
  return (
    <ReviewScreen key={id} id={id} initialFilters={filters} initialQuestionId={questionId} />
  );
}

function ReviewScreen({
  id,
  initialFilters,
  initialQuestionId,
}: {
  id: string;
  initialFilters: ReviewFilters;
  initialQuestionId?: string;
}) {
  const { t } = useTranslation();
  const { data: review, error, isPending, refetch } = useAttemptReview(id);

  return (
    <VocabScope sourceTitle={review?.examTitle ?? null}>
      <FocusPage>
        <TopBar
          title={t('review.title')}
          subtitle={review?.examTitle}
          fallback={`/attempts/${id}/result`}
          accessory={review ? <NoteToggle /> : null}
        />
        <NoteModeBanner />
        {isPending ? (
          <LoadingView />
        ) : !review ? (
          <ErrorView error={error} onRetry={refetch} />
        ) : (
          <ReviewPager
            questions={review.questions}
            initialFilters={initialFilters}
            initialQuestionId={initialQuestionId}
          />
        )}
      </FocusPage>
    </VocabScope>
  );
}

// Literal class names so Tailwind generates them.
const VERDICT = {
  correct: { tone: 'bg-success-soft text-success-soft-foreground', icon: CircleCheck },
  wrong: { tone: 'bg-destructive-soft text-destructive-soft-foreground', icon: CircleX },
  notAnswered: { tone: 'bg-secondary text-secondary-foreground', icon: CircleMinus },
} as const;

/** One question at a time among those passing the filters; the sheet jumps to any of them. */
function ReviewPager({
  questions,
  initialFilters,
  initialQuestionId,
}: {
  questions: ReviewQuestion[];
  initialFilters: ReviewFilters;
  initialQuestionId: string | undefined;
}) {
  const { t } = useTranslation();
  const [, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState(initialFilters);
  const [currentId, setCurrentId] = useState(initialQuestionId);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Number = position in the whole attempt, so "Câu 90" stays question 90 under any filter.
  const numbered = questions.map((question, index) => ({ question, number: index + 1 }));
  const shown = numbered.filter(({ question }) => matches(question, filters));
  const found = shown.findIndex(({ question }) => question.id === currentId);
  const index = found === -1 ? 0 : found;
  const current = shown[index];
  const options = filterOptions(questions);

  // The URL follows the review, so a reload or a shared link opens the same question.
  useEffect(() => {
    setSearchParams(toReviewParams(filters, current?.question.id), { replace: true });
  }, [filters, current?.question.id, setSearchParams]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [current?.question.id]);

  const goTo = (questionId: string | undefined) => setCurrentId(questionId);
  const applyFilters = (next: ReviewFilters) => {
    setFilters(next);
    // Stay on the question shown if it still matches, else open the first one that does.
    goTo(
      current && matches(current.question, next)
        ? current.question.id
        : numbered.find(({ question }) => matches(question, next))?.question.id,
    );
  };

  useQuestionHotkeys({
    prev: () => goTo(shown[index - 1]?.question.id ?? current?.question.id),
    next: () => goTo(shown[index + 1]?.question.id ?? current?.question.id),
    note: toggleNoteMode,
    escape: exitNoteMode,
  });

  const tally = { correct: 0, wrong: 0, notAnswered: 0 };
  for (const { question } of shown) tally[outcomeOf(question)] += 1;

  const domainName = (domainId: string) =>
    domainId === NO_DOMAIN
      ? t('review.noDomain')
      : (options.domains.find((d) => d.value === domainId)?.label ?? domainId);

  const active = [
    ...filters.outcomes.map((value) => ({
      key: `o-${value}`,
      label: t(`review.${value}`),
      onRemove: () =>
        applyFilters({ ...filters, outcomes: filters.outcomes.filter((v) => v !== value) }),
    })),
    ...(filters.flagged
      ? [
          {
            key: 'flagged',
            label: t('review.flagged'),
            onRemove: () => applyFilters({ ...filters, flagged: false }),
          },
        ]
      : []),
    ...filters.difficulties.map((value) => ({
      key: `x-${value}`,
      label: t(`difficulty.${value}`),
      onRemove: () =>
        applyFilters({ ...filters, difficulties: filters.difficulties.filter((v) => v !== value) }),
    })),
    ...filters.domainIds.map((value) => ({
      key: `d-${value}`,
      label: domainName(value),
      onRemove: () =>
        applyFilters({ ...filters, domainIds: filters.domainIds.filter((v) => v !== value) }),
    })),
    ...filters.sectionIds.map((value) => ({
      key: `s-${value}`,
      label: options.sections.find((s) => s.value === value)?.label ?? value,
      onRemove: () =>
        applyFilters({ ...filters, sectionIds: filters.sectionIds.filter((v) => v !== value) }),
    })),
  ];

  return (
    <>
      <div className="flex flex-col gap-2 pt-3 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex flex-1 items-baseline gap-1.5">
            <span className="text-lg font-semibold">
              {current ? t('question.number', { n: current.number }) : '—'}
            </span>
            {shown.length > 0 ? (
              <span className="text-sm text-muted-foreground">
                {t('review.position', { current: index + 1, total: shown.length })}
              </span>
            ) : null}
          </div>
          <Button variant="outline" onClick={() => setSheetOpen(true)}>
            <LayoutGrid />
            {t('review.list')}
            {active.length > 0 ? (
              <span className="min-w-5 rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                {active.length}
              </span>
            ) : (
              <SlidersHorizontal className="text-muted-foreground" />
            )}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {(['correct', 'wrong', 'notAnswered'] as const).map((tone) => (
            <span
              key={tone}
              className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', VERDICT[tone].tone)}
            >
              {`${t(`review.${tone}`)} ${tally[tone]}`}
            </span>
          ))}
        </div>
        {active.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {active.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={filter.onRemove}
                aria-label={t('review.removeFilter', { label: filter.label })}
                className="flex items-center gap-1 rounded-full bg-primary-soft py-1 pr-2 pl-3 text-xs font-medium text-primary-soft-foreground hover:bg-primary/20"
              >
                {filter.label}
                <X className="size-3.5" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {current ? (
        <div className="pb-4">
          <ReviewCard question={current.question} />
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <EmptyView message={t('review.noMatch')} />
          <Button variant="secondary" onClick={() => applyFilters(NO_FILTERS)}>
            {t('review.clearFilters')}
          </Button>
        </div>
      )}

      <ActionBar>
        <Button
          variant="outline"
          size="icon-lg"
          disabled={index === 0 || !current}
          onClick={() => goTo(shown[index - 1]?.question.id)}
          aria-label={t('attempt.prev')}
          title={`${t('attempt.prev')} (←)`}
        >
          <ChevronLeft className="size-5" />
        </Button>
        <Button
          variant="outline"
          size="icon-lg"
          onClick={() => setSheetOpen(true)}
          aria-label={t('review.filterAndMap')}
        >
          <LayoutGrid className="size-5" />
        </Button>
        <Button
          variant="brand"
          size="lg"
          className="flex-1"
          disabled={index >= shown.length - 1}
          onClick={() => goTo(shown[index + 1]?.question.id)}
          title={`${t('attempt.next')} (→)`}
        >
          {t('attempt.next')}
          <ArrowRight />
        </Button>
      </ActionBar>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="overflow-y-auto p-5">
          <ReviewSheetBody
            items={shown.map(({ question, number }) => ({
              id: question.id,
              number,
              outcome: outcomeOf(question),
              flagged: wasFlagged(question),
            }))}
            total={questions.length}
            currentId={current?.question.id}
            filters={filters}
            options={options}
            onFiltersChange={applyFilters}
            onSelect={(questionId) => {
              goTo(questionId);
              setSheetOpen(false);
            }}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}

/** One question with the user's answer, the correct one and the explanation. */
function ReviewCard({ question }: { question: ReviewQuestion }) {
  const { t } = useTranslation();
  const label = useQuestionLabel();
  const input = parseInput(question.type, question.data);
  const key = parseKey(question.type, question.answerKey);
  const answer = parseAnswer(question.type, question.response);
  const verdict = outcomeOf(question);
  const { tone, icon: Icon } = VERDICT[verdict];

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
            tone,
          )}
        >
          <Icon className="size-3.5" />
          {t(`review.${verdict}`)}
        </span>
        <span className="ml-auto text-xs font-medium text-muted-foreground">
          {`${question.score ?? 0}/${question.points}`}
        </span>
      </div>
      <QuestionTags
        label={label(question.sectionTitle, question.sourceNumber, question.order)}
        domain={question.domain?.name}
        difficulty={question.difficulty}
      />
      {/* Folded: the same case study repeats over several questions in a row. */}
      <QuestionStem
        caseStudy={question.caseStudy}
        content={question.content}
        media={question.media}
        caseStudyOpen={false}
      />
      {input ? <AnswerView input={input} answer={answer} solution={key} /> : null}
      <Explanation explanation={question.explanation} media={question.media} />
    </Card>
  );
}

type MapItem = { id: string; number: number; outcome: Outcome; flagged: boolean };

function ReviewSheetBody({
  items,
  total,
  currentId,
  filters,
  options,
  onFiltersChange,
  onSelect,
}: {
  items: MapItem[];
  total: number;
  currentId: string | undefined;
  filters: ReviewFilters;
  options: ReturnType<typeof filterOptions>;
  onFiltersChange: (filters: ReviewFilters) => void;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 pr-8">
        <SheetTitle>{t('review.filterAndMap')}</SheetTitle>
        {activeCount(filters) > 0 ? (
          <button
            type="button"
            onClick={() => onFiltersChange(NO_FILTERS)}
            className="text-sm font-medium text-primary hover:underline"
          >
            {t('review.clearFilters')}
          </button>
        ) : null}
      </div>
      <SheetDescription className="sr-only">{t('review.filterAndMap')}</SheetDescription>
      <FilterGroup title={t('review.outcome')}>
        {options.outcomes.map((o) => (
          <FilterPill
            key={o.value}
            label={`${t(`review.${o.value}`)} · ${o.count}`}
            isSelected={filters.outcomes.includes(o.value)}
            onPress={() => onFiltersChange({ ...filters, outcomes: toggle(filters.outcomes, o.value) })}
          />
        ))}
        {options.flagged > 0 ? (
          <FilterPill
            label={`${t('review.flagged')} · ${options.flagged}`}
            isSelected={filters.flagged}
            onPress={() => onFiltersChange({ ...filters, flagged: !filters.flagged })}
          />
        ) : null}
      </FilterGroup>
      <FilterGroup title={t('review.difficulty')}>
        {options.difficulties.map((d) => (
          <FilterPill
            key={d.value}
            label={`${t(`difficulty.${d.value}`)} · ${d.count}`}
            isSelected={filters.difficulties.includes(d.value)}
            onPress={() =>
              onFiltersChange({ ...filters, difficulties: toggle(filters.difficulties, d.value) })
            }
          />
        ))}
      </FilterGroup>
      {options.domains.length > 1 ? (
        <FilterGroup title={t('review.domain')}>
          {options.domains.map((d) => (
            <FilterPill
              key={d.value}
              label={`${d.value === NO_DOMAIN ? t('review.noDomain') : d.label} · ${d.count}`}
              isSelected={filters.domainIds.includes(d.value)}
              onPress={() =>
                onFiltersChange({ ...filters, domainIds: toggle(filters.domainIds, d.value) })
              }
            />
          ))}
        </FilterGroup>
      ) : null}
      {options.sections.length > 1 ? (
        <FilterGroup title={t('review.section')}>
          {options.sections.map((s) => (
            <FilterPill
              key={s.value}
              label={`${s.label} · ${s.count}`}
              isSelected={filters.sectionIds.includes(s.value)}
              onPress={() =>
                onFiltersChange({ ...filters, sectionIds: toggle(filters.sectionIds, s.value) })
              }
            />
          ))}
        </FilterGroup>
      ) : null}
      <p className="pt-1 text-sm font-semibold">
        {t('review.questions', { shown: items.length, total })}
      </p>
      {items.length === 0 ? (
        <p className="p-6 text-center text-muted-foreground">{t('review.noMatch')}</p>
      ) : (
        <div className="grid grid-cols-6 gap-2">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              aria-label={`${t('question.number', { n: item.number })}, ${t(`review.${item.outcome}`)}`}
              aria-current={item.id === currentId ? 'true' : undefined}
              className={cn(
                'relative flex aspect-square items-center justify-center rounded-xl border-2 text-sm font-semibold transition hover:scale-105',
                VERDICT[item.outcome].tone,
                item.id === currentId ? 'border-primary' : 'border-transparent',
              )}
            >
              {item.number}
              {item.flagged ? (
                <Flag className="absolute top-0.5 right-0.5 size-2.5 fill-current text-warning" />
              ) : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
