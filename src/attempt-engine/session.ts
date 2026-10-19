import type { LocalAttemptSummary, LocalStore } from './local-store';
import { isAnswered } from './metrics';
import { activeSection, applyEvent, sectionQuestionIds } from './reducer';
import {
  bankClock,
  createClock,
  isRunning,
  pauseClock,
  readClock,
  remainingMs,
  resumeClock,
  type SectionClock,
} from './section-clock';
import type { AttemptEvent, EventInput, SessionState } from './types';

export type SessionDeps = {
  store: LocalStore;
  /** Monotonic ms (`performance.now()`): the only source of measured time. */
  monoNow: () => number;
  /** Device clock, only to stamp events and time breaks. */
  wallNow: () => number;
  newId: () => string;
};

/** How often a running clock is written to storage: an app kill loses at most this much. */
export const CHECKPOINT_MS = 1_000;

/**
 * A sectioned attempt being played: state + running section clock + storage. Every action goes through
 * `dispatch`, which stamps the event with the section clock, checks it against the rules, stores it,
 * then saves the new state, in that order (MMKV writes are synchronous: nothing is lost on a crash).
 */
export class AttemptSession {
  private clock: SectionClock | null = null;
  private lastCheckpoint = 0;

  private constructor(
    public state: SessionState,
    private readonly deps: SessionDeps,
  ) {
    const active = activeSection(state);
    if (active) {
      // Back after an app kill: trust the newer of the last event and the last checkpoint. The clock
      // stays paused until the user taps "continue".
      const saved = deps.store.loadClock(state.attemptId);
      const used =
        saved?.sectionOrder === active.order
          ? Math.max(saved.usedMs, active.usedMs)
          : active.usedMs;
      this.clock = createClock(active.budgetMs, used);
    }
  }

  /** Opens the attempt stored on the device, if any. */
  static open(attemptId: string, deps: SessionDeps): AttemptSession | null {
    const state = deps.store.loadState(attemptId);
    return state ? new AttemptSession(state, deps) : null;
  }

  /** Starts keeping an attempt on the device (state built from the server copy). */
  static create(state: SessionState, snapshot: unknown, deps: SessionDeps): AttemptSession {
    deps.store.saveSnapshot(state.attemptId, snapshot);
    const session = new AttemptSession(state, deps);
    session.save();
    return session;
  }

  get isRunning() {
    return this.clock !== null && isRunning(this.clock);
  }

  /** Section clock now, for the running section (0 when no section is running). */
  activeMs() {
    return this.clock ? readClock(this.clock, this.deps.monoNow()) : 0;
  }

  remainingMs() {
    return this.clock ? remainingMs(this.clock, this.deps.monoNow()) : null;
  }

  /** Records an action. Returns false (and records nothing) when the rules refuse it. */
  dispatch(input: EventInput): boolean {
    const { state, deps } = this;
    const sectionOrder =
      input.sectionOrder ?? activeSection(state)?.order ?? state.currentSectionOrder;
    const section = state.sections.find((s) => s.order === sectionOrder);
    if (!section) return false;
    const event: AttemptEvent = {
      id: deps.newId(),
      attemptId: state.attemptId,
      seq: state.lastSeq + 1,
      type: input.type,
      sectionOrder,
      attemptQuestionId: input.attemptQuestionId,
      payload: input.payload,
      // Whole ms (performance.now() has decimals; the server takes integers).
      activeMs: Math.round(
        input.type === 'SECTION_END' && input.payload?.reason === 'TIME_UP'
          ? section.budgetMs
          : section.status === 'ACTIVE' && this.clock
            ? readClock(this.clock, deps.monoNow())
            : section.usedMs,
      ),
      clientAt: Math.round(deps.wallNow()),
    };
    const next = applyEvent(state, event);
    if (!next) return false;

    deps.store.appendEvent(event);
    this.state = next;
    this.updateClock(event);
    this.save();
    return true;
  }

  pause() {
    if (this.isRunning) this.dispatch({ type: 'SECTION_PAUSE' });
  }

  resume() {
    if (!this.clock || this.isRunning) return;
    const working = this.state.phase === 'IN_SECTION' || this.state.phase === 'IN_REVIEW';
    if (!working) return;
    // The app was killed right as time ran out: close the section instead of resuming it.
    if (remainingMs(this.clock, this.deps.monoNow()) <= 0) {
      this.dispatch({ type: 'SECTION_END', payload: { reason: 'TIME_UP' } });
      return;
    }
    this.dispatch({ type: 'SECTION_RESUME' });
  }

  /**
   * Called a few times per second while the screen is open: ends the section when its time is up and
   * checkpoints the clock. Returns true when the section just ended.
   */
  tick(): boolean {
    if (!this.clock || !this.isRunning) return false;
    const now = this.deps.monoNow();
    if (remainingMs(this.clock, now) <= 0) {
      return this.dispatch({ type: 'SECTION_END', payload: { reason: 'TIME_UP' } });
    }
    if (now - this.lastCheckpoint >= CHECKPOINT_MS) this.checkpoint();
    return false;
  }

  /** Writes the clock now (also call when the app goes to the background). */
  checkpoint() {
    const active = activeSection(this.state);
    if (!this.clock || !active) return;
    const now = this.deps.monoNow();
    this.clock = bankClock(this.clock, now);
    this.lastCheckpoint = now;
    this.deps.store.saveClock(this.state.attemptId, active.order, this.clock.usedMs);
  }

  /** The server applied the state as of `upToSeq`: questions changed after it stay to upload. */
  markSynced(upToSeq: number) {
    const dirty = Object.fromEntries(
      Object.entries(this.state.dirty).filter(([, seq]) => seq > upToSeq),
    );
    this.state = { ...this.state, dirty };
    this.save();
  }

  /** Sections with the live clock, for uploading. */
  sectionsForSync() {
    const used = this.activeMs();
    return this.state.sections.map((s) =>
      s.status === 'ACTIVE' && this.clock ? { ...s, usedMs: Math.max(s.usedMs, used) } : s,
    );
  }

  summary(): LocalAttemptSummary {
    const { state } = this;
    const answeredIn = (ids: string[]) =>
      ids.filter((id) => isAnswered(state.questions[id])).length;
    const current = sectionQuestionIds(state, state.currentSectionOrder);
    return {
      attemptId: state.attemptId,
      examId: state.examId,
      examTitle: state.examTitle,
      phase: state.phase,
      closing: state.closing,
      sectionOrder: state.currentSectionOrder,
      sectionCount: state.sections.length,
      answeredCount: answeredIn(state.questionIds),
      sectionAnswered: answeredIn(current),
      sectionTotal: current.length,
      remainingMs:
        this.remainingMs() ??
        state.sections.find((s) => s.order === state.currentSectionOrder)?.budgetMs ??
        null,
      totalQuestions: state.questionIds.length,
      updatedAt: this.deps.wallNow(),
    };
  }

  private updateClock(event: AttemptEvent) {
    const now = this.deps.monoNow();
    const active = activeSection(this.state);
    if (!active) {
      this.clock = null;
      return;
    }
    if (event.type === 'SECTION_START') {
      this.clock = resumeClock(createClock(active.budgetMs, active.usedMs), now);
      this.checkpoint();
    } else if (event.type === 'SECTION_PAUSE' && this.clock) {
      this.clock = pauseClock(this.clock, now);
      this.checkpoint();
    } else if (event.type === 'SECTION_RESUME' && this.clock) {
      this.clock = resumeClock(this.clock, now);
    }
  }

  private save() {
    this.deps.store.saveState(this.state, this.summary());
  }
}
