/**
 * Sectioned attempts, played on the device. The app is the source of truth while the attempt is open:
 * every user action is an event (kept on the device, uploaded when online) and `SessionState` is what
 * those events add up to. Times are measured on the section clock (`activeMs`), which only runs while
 * the user is actually working, so pauses, app switches and device clock changes never count.
 */

/** Where the attempt stands. Same values as the server (`Attempt.phase`). */
export type Phase =
  | 'NOT_STARTED'
  | 'IN_SECTION'
  | 'IN_REVIEW'
  /** A section just ended: offer the break, or (after the break) wait for "start next section". */
  | 'BREAK_OFFER'
  | 'ON_BREAK'
  /** The last section ended; ATTEMPT_SUBMIT follows. */
  | 'FINISHED';

export type EventType =
  | 'SECTION_START'
  | 'SECTION_PAUSE'
  | 'SECTION_RESUME'
  | 'SECTION_REVIEW_OPEN'
  | 'SECTION_END'
  | 'BREAK_START'
  | 'BREAK_SKIP'
  | 'BREAK_END'
  | 'QUESTION_VIEW'
  | 'QUESTION_LEAVE'
  | 'OPTION_ELIMINATE'
  | 'OPTION_RESTORE'
  | 'ANSWER_SELECT'
  | 'ANSWER_CLEAR'
  | 'CONFIDENCE_SET'
  | 'FLAG_SET'
  | 'ATTEMPT_SUBMIT'
  | 'ATTEMPT_ABANDON';

export type Confidence = 'LOW' | 'MEDIUM' | 'HIGH';
export type SectionEndReason = 'USER' | 'TIME_UP';
export type SectionStatus = 'LOCKED' | 'ACTIVE' | 'COMPLETED';

/** What the user did, as uploaded to `POST /attempts/:id/sync`. */
export type AttemptEvent = {
  /** UUIDv7 made on the device: uploading an event twice stores it once. */
  id: string;
  attemptId: string;
  /** 1, 2, 3… per attempt, without gaps. */
  seq: number;
  type: EventType;
  sectionOrder: number;
  attemptQuestionId?: string;
  payload?: Record<string, unknown>;
  /** Section clock when it happened: the time base of every metric. */
  activeMs: number;
  /** Device clock, for display only. */
  clientAt: number;
};

export type SectionState = {
  order: number;
  title: string;
  budgetMs: number;
  /** Section clock as of the last event (the live value comes from the running clock). */
  usedMs: number;
  status: SectionStatus;
  startedAt: number | null;
  endedAt: number | null;
  endReason: SectionEndReason | null;
  /** Wall-clock start of the break taken after this section (device only). */
  breakStartedAt: number | null;
  breakTakenMs: number | null;
  breakSkipped: boolean | null;
};

/** The decision trace of one question. */
export type QuestionTrace = {
  id: string;
  sectionOrder: number;
  /** Type-specific answer (`{ optionId }`, `{ optionIds }`, `{ pairs }`); null = not answered. */
  response: unknown;
  /** The first answer picked, to tell right→wrong from wrong→right changes. */
  firstResponse: unknown;
  flagged: boolean;
  everFlagged: boolean;
  confidence: Confidence | null;
  /** Options crossed out with X. */
  eliminated: string[];
  /** Active time on the question, closed visits only (see `viewingSince`). */
  dwellMs: number;
  /** Section clock when the current visit began; null when the question is not on screen. */
  viewingSince: number | null;
  timeToFirstAnswerMs: number | null;
  timeToFinalAnswerMs: number | null;
  visitCount: number;
  answerChangeCount: number;
  eliminationCount: number;
};

export type SessionState = {
  attemptId: string;
  examId: string;
  examTitle: string;
  breakMinutes: number | null;
  phase: Phase;
  currentSectionOrder: number;
  currentQuestionId: string | null;
  /** Highest seq recorded. */
  lastSeq: number;
  sections: SectionState[];
  /** In exam order. */
  questionIds: string[];
  questions: Record<string, QuestionTrace>;
  /** Set by ATTEMPT_SUBMIT / ATTEMPT_ABANDON: the attempt takes no more actions. */
  closing: 'SUBMIT' | 'ABANDON' | null;
  /** Questions changed since the server last applied the state, with the seq of their last change. */
  dirty: Record<string, number>;
};

/** Fields a caller gives; the session fills in id, seq, attemptId, activeMs and clientAt. */
export type EventInput = {
  type: EventType;
  attemptQuestionId?: string;
  payload?: Record<string, unknown>;
  /** Defaults to the current section. */
  sectionOrder?: number;
};
