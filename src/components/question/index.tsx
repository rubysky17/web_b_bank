import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  CircleX,
  Expand,
  FileText,
  Lightbulb,
  Undo2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { CaseStudy, Difficulty, QuestionMedia as Media } from '@/api/attempts';
import { IconTile } from '@/components/app/icon-tile';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { API_ORIGIN } from '@/lib/env';
import { cn } from '@/lib/utils';
import { optionLetter } from '@/utils/format-duration';

import {
  type Answer,
  type AnswerKey,
  placeChoice,
  type QuestionInput,
  toggleOption,
} from './answer-model';

export * from './answer-model';

/** Images are served next to the API (`/media/...`), not under `/api/v1`. */
export const mediaUri = (url: string) => (url.startsWith('/') ? `${API_ORIGIN}${url}` : url);

/** Question texts keep the source's paragraphs (blank lines) and line breaks (tables, lists). */
export function Paragraphs({
  text,
  size = 'base',
  weight = 'normal',
}: {
  text: string;
  size?: 'base' | 'sm';
  weight?: 'normal' | 'medium';
}) {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  return (
    <div className="flex flex-col gap-3">
      {paragraphs.map((paragraph, index) => (
        // Paragraphs never reorder: the index is a stable key.
        <p
          key={index}
          className={cn(
            'leading-relaxed whitespace-pre-line',
            size === 'sm' ? 'text-sm' : 'text-[15px] md:text-base',
            weight === 'medium' && 'font-medium',
          )}
        >
          {paragraph}
        </p>
      ))}
    </div>
  );
}

/** Charts and tables of a question, full width; click one to zoom. */
export function QuestionMedia({ media }: { media: readonly Media[] }) {
  const { t } = useTranslation();
  const [zoomed, setZoomed] = useState<Media | null>(null);
  if (media.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {media.map((item) => (
        <button
          key={item.url}
          type="button"
          onClick={() => setZoomed(item)}
          className="group flex flex-col gap-1 text-left"
          aria-label={`${item.alt} — ${t('question.zoomHint')}`}
        >
          <img
            src={mediaUri(item.url)}
            alt={item.alt}
            loading="lazy"
            width={item.width}
            height={item.height}
            className="h-auto w-full rounded-xl bg-white object-contain"
            style={{ aspectRatio: `${item.width} / ${item.height}` }}
          />
          <span className="flex items-center gap-1 self-end text-xs text-muted-foreground group-hover:text-foreground">
            <Expand className="size-3" />
            {t('question.zoomHint')}
          </span>
        </button>
      ))}
      <Dialog open={zoomed !== null} onOpenChange={(open) => (open ? null : setZoomed(null))}>
        <DialogContent className="max-w-[min(96vw,1400px)] p-2 sm:max-w-[min(96vw,1400px)]">
          <DialogTitle className="sr-only">{zoomed?.alt}</DialogTitle>
          {zoomed ? (
            <div className="max-h-[90dvh] overflow-auto">
              <img
                src={mediaUri(zoomed.url)}
                alt={zoomed.alt}
                className="mx-auto h-auto max-w-none rounded-xl bg-white"
                style={{ width: Math.max(zoomed.width, 600) }}
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** The shared scenario of "(Refer to the case study)" questions, foldable. */
export function CaseStudyPanel({
  caseStudy,
  initiallyOpen = true,
}: {
  caseStudy: CaseStudy;
  initiallyOpen?: boolean;
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(initiallyOpen);
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-primary-soft bg-primary-soft/40 p-4">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        title={isOpen ? t('question.hideCaseStudy') : t('question.showCaseStudy')}
        className="flex items-center gap-2 text-left text-primary"
      >
        <FileText className="size-[18px] shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase">{t('question.caseStudy')}</p>
          <p className="font-semibold text-foreground">{caseStudy.title}</p>
        </div>
        {isOpen ? <ChevronUp className="size-[18px]" /> : <ChevronDown className="size-[18px]" />}
      </button>
      {isOpen ? <Paragraphs text={caseStudy.content} size="sm" /> : null}
    </div>
  );
}

/** Case study, stem and figures of a question. */
export function QuestionStem({
  caseStudy,
  content,
  media,
  caseStudyOpen = true,
}: {
  caseStudy: CaseStudy | null;
  content: string;
  /** Only CONTENT images are shown here; explanation images belong to the explanation. */
  media: readonly Media[];
  caseStudyOpen?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {caseStudy ? (
        <CaseStudyPanel key={caseStudy.title} caseStudy={caseStudy} initiallyOpen={caseStudyOpen} />
      ) : null}
      <Paragraphs text={content} weight="medium" />
      <QuestionMedia media={media.filter((item) => item.placement === 'CONTENT')} />
    </div>
  );
}

export function QuestionTags({
  label,
  domain,
  difficulty,
}: {
  /** "Section 1 · Q17" style label. */
  label: string;
  domain?: string | null;
  difficulty?: Difficulty | null;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge>{label}</Badge>
      {domain ? <Badge variant="primary">{domain}</Badge> : null}
      {difficulty ? (
        <Badge variant={difficulty === 'EXPERT' ? 'destructive' : 'warning'}>
          {t(`difficulty.${difficulty}`)}
        </Badge>
      ) : null}
    </div>
  );
}

/** The explanation with the images that belong to it (e.g. the solved table). */
export function Explanation({
  explanation,
  media,
}: {
  explanation: string | null;
  media: readonly Media[];
}) {
  const { t } = useTranslation();
  const images = media.filter((item) => item.placement === 'EXPLANATION');
  if (!explanation && images.length === 0) return null;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-secondary p-4">
      <div className="flex items-center gap-2">
        <IconTile tone="amber" icon={Lightbulb} size="sm" />
        <p className="text-sm font-semibold">{t('review.explanation')}</p>
      </div>
      {explanation ? <Paragraphs text={explanation} size="sm" /> : null}
      <QuestionMedia media={images} />
    </div>
  );
}

/** "Section 1 · Q17" when the source number is known, else the position in the attempt. */
export function useQuestionLabel() {
  const { t } = useTranslation();
  return (sectionTitle: string, sourceNumber: number | null, fallback: number) =>
    `${sectionTitle} · ${t('question.number', { n: sourceNumber ?? fallback })}`;
}

type AnswerViewProps = {
  input: QuestionInput;
  answer: Answer | null;
  /** Omit to show the answer read-only. */
  onChange?: (answer: Answer | null) => void;
  /** Shows right/wrong marks and the correct answer (review, practice after checking). */
  solution?: AnswerKey | null;
  /** Choice types: options crossed out by the user. */
  eliminated?: readonly string[];
  /** Choice types: shows an X on each option to cross it out (or bring it back). */
  onEliminate?: (optionId: string, eliminate: boolean) => void;
};

/** Answer area of a question, for every supported type. */
export function AnswerView({
  input,
  answer,
  onChange,
  solution = null,
  eliminated = [],
  onEliminate,
}: AnswerViewProps) {
  const isLocked = onChange === undefined || solution !== null;
  if (input.type === 'DRAG_DROP') {
    return (
      <MatchingView
        input={input}
        answer={answer}
        onChange={isLocked ? undefined : onChange}
        solution={solution?.type === 'DRAG_DROP' ? solution : null}
      />
    );
  }
  return (
    <ChoiceView
      input={input}
      answer={answer}
      onChange={isLocked ? undefined : onChange}
      solution={solution}
      eliminated={eliminated}
      onEliminate={isLocked ? undefined : onEliminate}
    />
  );
}

type ChoiceViewProps = {
  input: Extract<QuestionInput, { type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' }>;
  answer: Answer | null;
  onChange?: (answer: Answer | null) => void;
  solution: AnswerKey | null;
  eliminated: readonly string[];
  onEliminate?: (optionId: string, eliminate: boolean) => void;
};

function ChoiceView({ input, answer, onChange, solution, eliminated, onEliminate }: ChoiceViewProps) {
  const { t } = useTranslation();
  const picked = new Set(
    answer && 'optionId' in answer
      ? [answer.optionId]
      : answer && 'optionIds' in answer
        ? answer.optionIds
        : [],
  );
  const correct = new Set(
    solution?.type === 'SINGLE_CHOICE'
      ? [solution.correctOptionId]
      : solution?.type === 'MULTIPLE_CHOICE'
        ? solution.correctOptionIds
        : [],
  );
  const isMulti = input.type === 'MULTIPLE_CHOICE';

  return (
    <div className="flex flex-col gap-3" role={isMulti ? 'group' : 'radiogroup'}>
      {isMulti ? (
        <p className="text-sm font-semibold text-primary">
          {t('question.selectCount', { count: input.selectCount })}
        </p>
      ) : null}
      {input.options.map((option, index) => {
        const isPicked = picked.has(option.id);
        const isEliminated = eliminated.includes(option.id);
        const mark =
          solution === null ? null : correct.has(option.id) ? 'correct' : isPicked ? 'wrong' : null;
        return (
          <OptionRow
            key={option.id}
            letter={optionLetter(index)}
            content={option.content}
            isMulti={isMulti}
            isPicked={isPicked}
            isEliminated={isEliminated}
            mark={mark}
            onEliminate={onEliminate ? () => onEliminate(option.id, !isEliminated) : undefined}
            onPress={onChange ? () => onChange(toggleOption(input, answer, option.id)) : undefined}
          />
        );
      })}
    </div>
  );
}

type OptionRowProps = {
  letter: string;
  content: string;
  isMulti: boolean;
  isPicked: boolean;
  isEliminated: boolean;
  mark: 'correct' | 'wrong' | null;
  onPress?: () => void;
  onEliminate?: () => void;
};

function OptionRow({
  letter,
  content,
  isMulti,
  isPicked,
  isEliminated,
  mark,
  onPress,
  onEliminate,
}: OptionRowProps) {
  const { t } = useTranslation();
  const tone =
    mark === 'correct'
      ? 'border-success bg-success-soft'
      : mark === 'wrong'
        ? 'border-destructive bg-destructive-soft'
        : isPicked
          ? 'border-primary bg-primary-soft'
          : 'border-border bg-card hover:border-primary/50';

  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-2xl border-2 transition-colors',
        tone,
        isEliminated && 'opacity-50',
      )}
    >
      <button
        type="button"
        role={isMulti ? 'checkbox' : 'radio'}
        aria-checked={isPicked}
        disabled={onPress === undefined}
        onClick={onPress}
        className="flex min-w-0 flex-1 items-center gap-3 p-4 text-left disabled:cursor-default"
      >
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center font-semibold',
            isMulti ? 'rounded-lg' : 'rounded-full',
            isPicked ? 'bg-primary text-primary-foreground' : 'bg-secondary',
          )}
        >
          {letter}
        </span>
        <span className={cn('flex-1 leading-relaxed', isEliminated && 'line-through')}>
          {content}
        </span>
        {mark === 'correct' ? <CircleCheck className="size-[22px] shrink-0 text-success" /> : null}
        {mark === 'wrong' ? <CircleX className="size-[22px] shrink-0 text-destructive" /> : null}
      </button>
      {onEliminate ? (
        <button
          type="button"
          onClick={onEliminate}
          aria-label={
            isEliminated
              ? t('question.restoreOption', { letter })
              : t('question.eliminateOption', { letter })
          }
          title={
            isEliminated
              ? t('question.restoreOption', { letter })
              : t('question.eliminateOption', { letter })
          }
          className="mr-2 flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {isEliminated ? <Undo2 className="size-5" /> : <X className="size-5" />}
        </button>
      ) : null}
    </div>
  );
}

type MatchingViewProps = {
  input: Extract<QuestionInput, { type: 'DRAG_DROP' }>;
  answer: Answer | null;
  onChange?: (answer: Answer | null) => void;
  solution: Extract<AnswerKey, { type: 'DRAG_DROP' }> | null;
};

/**
 * Drag and drop, made for click/touch: pick a target, then the choice that belongs there. A choice
 * already placed elsewhere moves to the new target.
 */
function MatchingView({ input, answer, onChange, solution }: MatchingViewProps) {
  const { t } = useTranslation();
  const [activeTarget, setActiveTarget] = useState<string | null>(null);
  const pairs = answer && 'pairs' in answer ? answer.pairs : {};
  const choiceById = new Map(input.choices.map((choice) => [choice.id, choice]));
  const used = new Set(Object.values(pairs));

  const place = (targetId: string, choiceId: string | null) => {
    onChange?.(placeChoice(answer, targetId, choiceId));
    setActiveTarget(null);
  };

  return (
    <div className="flex flex-col gap-3">
      {onChange ? <p className="text-sm text-muted-foreground">{t('question.matchHint')}</p> : null}
      {input.targets.map((target, index) => {
        const placed = choiceById.get(pairs[target.id] ?? '');
        const expected = solution ? choiceById.get(solution.pairs[target.id] ?? '') : undefined;
        const mark = solution ? (placed && placed.id === expected?.id ? 'correct' : 'wrong') : null;
        const isActive = activeTarget === target.id;
        const tone =
          mark === 'correct'
            ? 'border-success bg-success-soft'
            : mark === 'wrong'
              ? 'border-destructive bg-destructive-soft'
              : isActive
                ? 'border-primary bg-primary-soft'
                : 'border-border bg-card';
        return (
          <div key={target.id} className={cn('flex flex-col gap-3 rounded-2xl border-2 p-4', tone)}>
            <button
              type="button"
              disabled={onChange === undefined}
              onClick={() => setActiveTarget(isActive ? null : target.id)}
              aria-expanded={isActive}
              className="flex flex-col gap-2 text-left disabled:cursor-default"
            >
              <span className="text-sm leading-5">{`${index + 1}. ${target.content}`}</span>
              <span className="flex items-center gap-2">
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                <span
                  className={cn(
                    'flex-1',
                    placed ? 'font-semibold text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {placed ? placed.content : t('question.pickChoice')}
                </span>
                {mark === 'correct' ? <CircleCheck className="size-[22px] text-success" /> : null}
                {mark === 'wrong' ? <CircleX className="size-[22px] text-destructive" /> : null}
              </span>
              {mark === 'wrong' && expected ? (
                <span className="text-sm font-semibold text-success-soft-foreground">
                  {t('question.correctIs', { answer: expected.content })}
                </span>
              ) : null}
            </button>
            {isActive ? (
              <div className="flex flex-wrap gap-2">
                {input.choices.map((choice) => {
                  const isHere = choice.id === placed?.id;
                  const isElsewhere = used.has(choice.id) && !isHere;
                  return (
                    <button
                      key={choice.id}
                      type="button"
                      onClick={() => place(target.id, choice.id)}
                      className={cn(
                        'rounded-full px-3 py-1.5 text-sm font-medium transition',
                        isHere
                          ? 'bg-primary text-primary-foreground'
                          : isElsewhere
                            ? 'bg-secondary text-muted-foreground'
                            : 'bg-primary-soft text-primary-soft-foreground hover:bg-primary/20',
                      )}
                    >
                      {choice.content}
                    </button>
                  );
                })}
                {placed ? (
                  <button
                    type="button"
                    onClick={() => place(target.id, null)}
                    className="rounded-full bg-secondary px-3 py-1.5 text-sm font-medium hover:bg-accent"
                  >
                    {t('question.clear')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
