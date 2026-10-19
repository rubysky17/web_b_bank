import { clearAnswer, closeVisit, emptyTrace, openVisit, pickAnswer } from './metrics';
import type {
  AttemptEvent,
  Confidence,
  Phase,
  QuestionTrace,
  SectionEndReason,
  SectionState,
  SessionState,
} from './types';

/**
 * The rules of a sectioned attempt. `applyEvent` returns the next state, or null when the event is not
 * allowed now (answering a question of a closed section, starting a break twice…): such events are
 * never recorded, so replaying the stored log always gives the same state.
 *
 * Sections run in order and close for good: once a section ends, its questions cannot change.
 */
export function applyEvent(state: SessionState, event: AttemptEvent): SessionState | null {
  if (state.closing !== null || event.seq !== state.lastSeq + 1) return null;
  const next = reduce(state, event);
  if (next === null) return null;
  return { ...next, lastSeq: event.seq, sections: advanceClock(next.sections, event) };
}

const CONFIDENCE = new Set<Confidence | null>(['LOW', 'MEDIUM', 'HIGH', null]);

function reduce(state: SessionState, event: AttemptEvent): SessionState | null {
  const active = state.sections.find((s) => s.status === 'ACTIVE');
  const working = state.phase === 'IN_SECTION' || state.phase === 'IN_REVIEW';

  switch (event.type) {
    case 'SECTION_START': {
      if (!['NOT_STARTED', 'BREAK_OFFER', 'ON_BREAK'].includes(state.phase) || active) return null;
      const upcoming = state.sections.find((s) => s.status === 'LOCKED');
      if (!upcoming || upcoming.order !== event.sectionOrder) return null;
      let sections =
        state.phase === 'ON_BREAK' ? endBreak(state.sections, event.clientAt) : state.sections;
      sections = updateSection(sections, upcoming.order, {
        status: 'ACTIVE',
        startedAt: event.clientAt,
      });
      return { ...state, sections, phase: 'IN_SECTION', currentSectionOrder: upcoming.order };
    }

    case 'SECTION_PAUSE':
    case 'SECTION_RESUME':
      return working && active?.order === event.sectionOrder ? state : null;

    case 'SECTION_REVIEW_OPEN': {
      if (!working || active?.order !== event.sectionOrder) return null;
      return { ...leaveCurrent(state, event), phase: 'IN_REVIEW' };
    }

    case 'SECTION_END': {
      if (!working || active?.order !== event.sectionOrder) return null;
      const reason: SectionEndReason = event.payload?.reason === 'TIME_UP' ? 'TIME_UP' : 'USER';
      let next = closeVisits(state, active.order, event);
      next = {
        ...next,
        currentQuestionId: null,
        sections: updateSection(next.sections, active.order, {
          status: 'COMPLETED',
          usedMs: Math.min(event.activeMs, active.budgetMs),
          endedAt: event.clientAt,
          endReason: reason,
        }),
      };
      const upcoming = next.sections.find((s) => s.status === 'LOCKED');
      return upcoming
        ? { ...next, phase: 'BREAK_OFFER', currentSectionOrder: upcoming.order }
        : { ...next, phase: 'FINISHED' };
    }

    case 'BREAK_START': {
      const previous = lastCompleted(state);
      if (
        state.phase !== 'BREAK_OFFER' ||
        state.breakMinutes === null ||
        !previous ||
        previous.breakTakenMs !== null
      ) {
        return null;
      }
      return {
        ...state,
        phase: 'ON_BREAK',
        sections: updateSection(state.sections, previous.order, {
          breakStartedAt: event.clientAt,
        }),
      };
    }

    case 'BREAK_SKIP': {
      const previous = lastCompleted(state);
      if (state.phase !== 'BREAK_OFFER' || !previous || previous.breakTakenMs !== null) return null;
      return {
        ...state,
        sections: updateSection(state.sections, previous.order, {
          breakSkipped: true,
          breakTakenMs: 0,
        }),
      };
    }

    case 'BREAK_END':
      return state.phase === 'ON_BREAK'
        ? { ...state, phase: 'BREAK_OFFER', sections: endBreak(state.sections, event.clientAt) }
        : null;

    case 'QUESTION_VIEW': {
      const trace = editable(state, event, active);
      if (!trace || !working) return null;
      const left = state.currentQuestionId === trace.id ? state : leaveCurrent(state, event);
      return {
        ...setTrace(left, openVisit(left.questions[trace.id]!, event.activeMs), event.seq),
        currentQuestionId: trace.id,
        phase: 'IN_SECTION',
      };
    }

    case 'QUESTION_LEAVE': {
      const trace = editable(state, event, active);
      if (!trace || !working) return null;
      const next = setTrace(state, closeVisit(trace, event.activeMs), event.seq);
      return state.currentQuestionId === trace.id ? { ...next, currentQuestionId: null } : next;
    }

    case 'OPTION_ELIMINATE':
    case 'OPTION_RESTORE': {
      const trace = editable(state, event, active);
      const optionId = event.payload?.optionId;
      if (!trace || !working || typeof optionId !== 'string') return null;
      const isOut = trace.eliminated.includes(optionId);
      if (event.type === 'OPTION_ELIMINATE') {
        if (isOut) return null;
        return setTrace(
          state,
          {
            ...trace,
            eliminated: [...trace.eliminated, optionId],
            eliminationCount: trace.eliminationCount + 1,
          },
          event.seq,
        );
      }
      if (!isOut) return null;
      return setTrace(
        state,
        { ...trace, eliminated: trace.eliminated.filter((id) => id !== optionId) },
        event.seq,
      );
    }

    case 'ANSWER_SELECT': {
      const trace = editable(state, event, active);
      const response = event.payload?.response;
      if (!trace || !working || typeof response !== 'object' || response === null) return null;
      return setTrace(state, pickAnswer(trace, response, event.activeMs), event.seq);
    }

    case 'ANSWER_CLEAR': {
      const trace = editable(state, event, active);
      if (!trace || !working) return null;
      return setTrace(state, clearAnswer(trace), event.seq);
    }

    case 'CONFIDENCE_SET': {
      const trace = editable(state, event, active);
      const level = (event.payload?.level ?? null) as Confidence | null;
      if (!trace || !working || !CONFIDENCE.has(level)) return null;
      return setTrace(state, { ...trace, confidence: level }, event.seq);
    }

    case 'FLAG_SET': {
      const trace = editable(state, event, active);
      const flagged = event.payload?.flagged;
      if (!trace || !working || typeof flagged !== 'boolean') return null;
      return setTrace(
        state,
        { ...trace, flagged, everFlagged: trace.everFlagged || flagged },
        event.seq,
      );
    }

    case 'ATTEMPT_SUBMIT':
      return state.phase === 'FINISHED' ? { ...state, closing: 'SUBMIT' } : null;

    case 'ATTEMPT_ABANDON': {
      const next = active ? closeVisits(state, active.order, event) : state;
      return { ...next, closing: 'ABANDON', currentQuestionId: null };
    }
  }
}

/** The question an event targets, if it may still change: it belongs to the running section. */
function editable(
  state: SessionState,
  event: AttemptEvent,
  active: SectionState | undefined,
): QuestionTrace | null {
  const trace = event.attemptQuestionId ? state.questions[event.attemptQuestionId] : undefined;
  if (!trace || !active || trace.sectionOrder !== active.order) return null;
  return event.sectionOrder === active.order ? trace : null;
}

function setTrace(state: SessionState, trace: QuestionTrace, seq: number): SessionState {
  return {
    ...state,
    questions: { ...state.questions, [trace.id]: trace },
    dirty: { ...state.dirty, [trace.id]: seq },
  };
}

function leaveCurrent(state: SessionState, event: AttemptEvent): SessionState {
  const current = state.currentQuestionId ? state.questions[state.currentQuestionId] : undefined;
  if (!current) return { ...state, currentQuestionId: null };
  return {
    ...setTrace(state, closeVisit(current, event.activeMs), event.seq),
    currentQuestionId: null,
  };
}

/** Ends every open visit of a section (it is ending, or the attempt is). */
function closeVisits(state: SessionState, sectionOrder: number, event: AttemptEvent) {
  let next = state;
  for (const trace of Object.values(state.questions)) {
    if (trace.sectionOrder === sectionOrder && trace.viewingSince !== null) {
      next = setTrace(next, closeVisit(trace, event.activeMs), event.seq);
    }
  }
  return next;
}

const lastCompleted = (state: SessionState) =>
  state.sections.findLast((s) => s.status === 'COMPLETED');

function endBreak(sections: SectionState[], at: number): SectionState[] {
  const previous = sections.findLast((s) => s.status === 'COMPLETED');
  if (!previous || previous.breakStartedAt === null || previous.breakTakenMs !== null) {
    return sections;
  }
  return updateSection(sections, previous.order, {
    breakTakenMs: Math.max(0, at - previous.breakStartedAt),
  });
}

function updateSection(
  sections: SectionState[],
  order: number,
  patch: Partial<SectionState>,
): SectionState[] {
  return sections.map((s) => (s.order === order ? { ...s, ...patch } : s));
}

/** Every event also records how far the running section's clock had gone. */
function advanceClock(sections: SectionState[], event: AttemptEvent): SectionState[] {
  return sections.map((s) =>
    s.order === event.sectionOrder && s.status === 'ACTIVE'
      ? { ...s, usedMs: Math.min(Math.max(s.usedMs, event.activeMs), s.budgetMs) }
      : s,
  );
}

/** What a sectioned attempt view from the server contains (see `AttemptViewSchema`). */
export type ServerSession = {
  attemptId: string;
  examId: string;
  examTitle: string;
  breakMinutes: number | null;
  phase: Phase | null;
  currentSectionOrder: number | null;
  syncedSeq: number;
  sections: {
    order: number;
    title: string;
    budgetMs: number;
    usedMs: number;
    status: SectionState['status'];
    startedAt: number | null;
    endedAt: number | null;
    endReason: SectionEndReason | null;
    breakTakenMs: number | null;
    breakSkipped: boolean | null;
  }[];
  questions: (Partial<Omit<QuestionTrace, 'eliminated'>> & {
    id: string;
    sectionOrder: number;
    eliminated?: string[] | null;
  })[];
};

/**
 * A session built from the server's copy: a new attempt, or one continued on another device (or after
 * reinstalling). The device then takes over from the last synced event.
 */
export function sessionFromServer(server: ServerSession): SessionState {
  const questions: Record<string, QuestionTrace> = {};
  for (const q of server.questions) {
    const base = emptyTrace(q.id, q.sectionOrder);
    questions[q.id] = {
      ...base,
      response: q.response ?? null,
      firstResponse: q.firstResponse ?? null,
      flagged: q.flagged ?? false,
      everFlagged: q.everFlagged ?? false,
      confidence: q.confidence ?? null,
      eliminated: q.eliminated ?? [],
      dwellMs: q.dwellMs ?? 0,
      timeToFirstAnswerMs: q.timeToFirstAnswerMs ?? null,
      timeToFinalAnswerMs: q.timeToFinalAnswerMs ?? null,
      visitCount: q.visitCount ?? 0,
      answerChangeCount: q.answerChangeCount ?? 0,
      eliminationCount: q.eliminationCount ?? 0,
    };
  }
  const sections = server.sections.map((s) => ({ ...s, breakStartedAt: null }));
  // A break in progress cannot be resumed from the server copy: offer to start the next section.
  const phase: Phase =
    server.phase === 'ON_BREAK' ? 'BREAK_OFFER' : (server.phase ?? 'NOT_STARTED');
  return {
    attemptId: server.attemptId,
    examId: server.examId,
    examTitle: server.examTitle,
    breakMinutes: server.breakMinutes,
    phase,
    currentSectionOrder: server.currentSectionOrder ?? sections[0]?.order ?? 1,
    currentQuestionId: null,
    lastSeq: server.syncedSeq,
    sections,
    questionIds: server.questions.map((q) => q.id),
    questions,
    closing: null,
    dirty: {},
  };
}

export const activeSection = (state: SessionState) =>
  state.sections.find((s) => s.status === 'ACTIVE');

export const sectionQuestionIds = (state: SessionState, order: number) =>
  state.questionIds.filter((id) => state.questions[id]?.sectionOrder === order);
