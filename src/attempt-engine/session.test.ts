import { createLocalStore, type KeyValueStorage } from './local-store';
import { applyEvent, sessionFromServer } from './reducer';
import { AttemptSession, type SessionDeps } from './session';
import type { AttemptEvent, SessionState } from './types';

const MIN = 60_000;
const HOUR = 60 * MIN;

function memoryStorage(): KeyValueStorage & { keys: () => string[] } {
  const values = new Map<string, string>();
  return {
    getString: (key) => values.get(key),
    set: (key, value) => void values.set(key, value),
    remove: (key) => values.delete(key),
    keys: () => [...values.keys()],
  };
}

/** Two sections of two questions, 60 min each, 10 min break. */
const server = () =>
  sessionFromServer({
    attemptId: 'a1',
    examId: 'e1',
    examTitle: 'Mock',
    breakMinutes: 10,
    phase: 'NOT_STARTED',
    currentSectionOrder: 1,
    syncedSeq: 0,
    sections: [1, 2].map((order) => ({
      order,
      title: `Section ${order}`,
      budgetMs: HOUR,
      usedMs: 0,
      status: 'LOCKED' as const,
      startedAt: null,
      endedAt: null,
      endReason: null,
      breakTakenMs: null,
      breakSkipped: null,
    })),
    questions: [
      { id: 'q1', sectionOrder: 1 },
      { id: 'q2', sectionOrder: 1 },
      { id: 'q3', sectionOrder: 2 },
      { id: 'q4', sectionOrder: 2 },
    ],
  });

function setup() {
  const storage = memoryStorage();
  const time = { mono: 1_000, wall: 1_700_000_000_000 };
  let id = 0;
  const deps: SessionDeps = {
    store: createLocalStore(storage),
    monoNow: () => time.mono,
    wallNow: () => time.wall,
    newId: () => `id-${++id}`,
  };
  const session = AttemptSession.create(server(), { questions: [] }, deps);
  /** Time passes for the monotonic and the wall clock alike. */
  const wait = (ms: number) => {
    time.mono += ms;
    time.wall += ms;
  };
  return { storage, time, deps, session, wait };
}

const q = (session: AttemptSession, id: string) => session.state.questions[id]!;

describe('AttemptSession', () => {
  it('times each question on the section clock, across visits', () => {
    const { session, wait } = setup();
    session.dispatch({ type: 'SECTION_START', sectionOrder: 1 });
    session.dispatch({ type: 'QUESTION_VIEW', attemptQuestionId: 'q1' });
    wait(10_000);
    session.dispatch({ type: 'QUESTION_VIEW', attemptQuestionId: 'q2' });
    wait(5_000);
    session.dispatch({ type: 'QUESTION_VIEW', attemptQuestionId: 'q1' });
    wait(3_000);
    session.dispatch({
      type: 'OPTION_ELIMINATE',
      attemptQuestionId: 'q1',
      payload: { optionId: 'A' },
    });
    wait(2_000);
    session.dispatch({
      type: 'ANSWER_SELECT',
      attemptQuestionId: 'q1',
      payload: { response: { optionId: 'B' } },
    });
    wait(4_000);
    session.dispatch({
      type: 'ANSWER_SELECT',
      attemptQuestionId: 'q1',
      payload: { response: { optionId: 'C' } },
    });
    session.dispatch({
      type: 'CONFIDENCE_SET',
      attemptQuestionId: 'q1',
      payload: { level: 'LOW' },
    });
    wait(1_000);
    session.dispatch({ type: 'QUESTION_LEAVE', attemptQuestionId: 'q1' });

    expect(q(session, 'q1')).toMatchObject({
      visitCount: 2,
      dwellMs: 20_000,
      timeToFirstAnswerMs: 15_000,
      timeToFinalAnswerMs: 19_000,
      firstResponse: { optionId: 'B' },
      response: { optionId: 'C' },
      answerChangeCount: 1,
      eliminated: ['A'],
      eliminationCount: 1,
      confidence: 'LOW',
    });
    expect(q(session, 'q2').dwellMs).toBe(5_000);
  });

  it('stamps events with whole milliseconds (the server takes integers)', () => {
    const { session, deps, time } = setup();
    time.mono += 0.37;
    session.dispatch({ type: 'SECTION_START', sectionOrder: 1 });
    time.mono += 1234.56;
    session.dispatch({ type: 'QUESTION_VIEW', attemptQuestionId: 'q1' });
    const [, view] = deps.store.pendingEvents('a1', 2, 10);
    expect(view?.activeMs).toBe(1235);
  });

  it('stops the clock while paused; device clock changes never count', () => {
    const { session, time, wait } = setup();
    session.dispatch({ type: 'SECTION_START', sectionOrder: 1 });
    wait(10 * MIN);
    session.pause();
    wait(3 * HOUR); // away from the app
    time.wall -= 5 * HOUR; // and the device clock was moved back
    session.resume();
    wait(MIN);
    expect(session.activeMs()).toBe(11 * MIN);
    expect(session.remainingMs()).toBe(49 * MIN);
  });

  it('ends the section exactly at its budget when time is up', () => {
    const { session, wait } = setup();
    session.dispatch({ type: 'SECTION_START', sectionOrder: 1 });
    session.dispatch({ type: 'QUESTION_VIEW', attemptQuestionId: 'q1' });
    wait(HOUR + 5_000);
    expect(session.tick()).toBe(true);
    expect(session.state.phase).toBe('BREAK_OFFER');
    expect(session.state.sections[0]).toMatchObject({
      status: 'COMPLETED',
      usedMs: HOUR,
      endReason: 'TIME_UP',
    });
    expect(q(session, 'q1')).toMatchObject({ dwellMs: HOUR, viewingSince: null });
  });

  it('locks a section once it ends', () => {
    const { session } = setup();
    session.dispatch({ type: 'SECTION_START', sectionOrder: 1 });
    session.dispatch({ type: 'SECTION_END', payload: { reason: 'USER' } });
    const seq = session.state.lastSeq;
    expect(
      session.dispatch({
        type: 'ANSWER_SELECT',
        attemptQuestionId: 'q1',
        sectionOrder: 1,
        payload: { response: { optionId: 'A' } },
      }),
    ).toBe(false);
    // Questions of a section not started yet are closed too.
    expect(
      session.dispatch({ type: 'FLAG_SET', attemptQuestionId: 'q3', payload: { flagged: true } }),
    ).toBe(false);
    expect(session.state.lastSeq).toBe(seq);
  });

  it('times the break on the wall clock, and a skipped break counts as 0', () => {
    const { session, wait } = setup();
    session.dispatch({ type: 'SECTION_START', sectionOrder: 1 });
    session.dispatch({ type: 'SECTION_END', payload: { reason: 'USER' } });
    session.dispatch({ type: 'BREAK_START' });
    expect(session.state.phase).toBe('ON_BREAK');
    wait(7 * MIN);
    session.dispatch({ type: 'BREAK_END' });
    expect(session.dispatch({ type: 'BREAK_START' })).toBe(false);
    session.dispatch({ type: 'SECTION_START', sectionOrder: 2 });
    expect(session.state.sections[0]!.breakTakenMs).toBe(7 * MIN);
    expect(session.remainingMs()).toBe(HOUR);

    session.dispatch({ type: 'SECTION_END', payload: { reason: 'USER' } });
    expect(session.state.phase).toBe('FINISHED');
    expect(session.dispatch({ type: 'ATTEMPT_SUBMIT' })).toBe(true);
    expect(session.state.closing).toBe('SUBMIT');
    expect(session.dispatch({ type: 'QUESTION_VIEW', attemptQuestionId: 'q3' })).toBe(false);
  });

  it('survives an app kill: events, state and the checkpointed clock are reloaded, paused', () => {
    const { session, deps, wait } = setup();
    session.dispatch({ type: 'SECTION_START', sectionOrder: 1 });
    session.dispatch({ type: 'QUESTION_VIEW', attemptQuestionId: 'q1' });
    wait(30 * MIN);
    session.tick(); // checkpoint
    wait(400); // lost with the kill

    const reopened = AttemptSession.open('a1', deps)!;
    expect(reopened.isRunning).toBe(false);
    expect(reopened.activeMs()).toBe(30 * MIN);
    reopened.resume();
    wait(MIN);
    expect(reopened.remainingMs()).toBe(29 * MIN);
  });

  it('closes a section whose time ran out before the app was killed', () => {
    const { session, deps, wait } = setup();
    session.dispatch({ type: 'SECTION_START', sectionOrder: 1 });
    wait(HOUR);
    session.checkpoint();
    const reopened = AttemptSession.open('a1', deps)!;
    reopened.resume();
    expect(reopened.state.sections[0]).toMatchObject({ status: 'COMPLETED', endReason: 'TIME_UP' });
  });

  it('keeps every event until acknowledged, and replaying them gives the same state', () => {
    const { session, deps, wait } = setup();
    session.dispatch({ type: 'SECTION_START', sectionOrder: 1 });
    session.dispatch({ type: 'QUESTION_VIEW', attemptQuestionId: 'q2' });
    wait(8_000);
    session.dispatch({
      type: 'ANSWER_SELECT',
      attemptQuestionId: 'q2',
      payload: { response: { optionId: 'D' } },
    });
    session.dispatch({ type: 'FLAG_SET', attemptQuestionId: 'q2', payload: { flagged: true } });
    session.dispatch({ type: 'SECTION_REVIEW_OPEN' });

    const events = deps.store.pendingEvents('a1', session.state.lastSeq, 500);
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
    const replayed = events.reduce<SessionState>(
      (state, event: AttemptEvent) => applyEvent(state, event)!,
      server(),
    );
    expect(replayed).toEqual(session.state);

    deps.store.acknowledge('a1', 3);
    expect(deps.store.pendingEvents('a1', session.state.lastSeq, 500).map((e) => e.seq)).toEqual([
      4, 5,
    ]);
  });

  it('lists the attempt for the "continue" card and forgets it once removed', () => {
    const { session, deps, storage } = setup();
    session.dispatch({ type: 'SECTION_START', sectionOrder: 1 });
    session.dispatch({
      type: 'ANSWER_SELECT',
      attemptQuestionId: 'q1',
      payload: { response: { optionId: 'A' } },
    });
    expect(deps.store.findForExam('e1')).toMatchObject({
      attemptId: 'a1',
      phase: 'IN_SECTION',
      sectionOrder: 1,
      answeredCount: 1,
      sectionAnswered: 1,
      sectionTotal: 2,
      totalQuestions: 4,
    });
    deps.store.remove('a1');
    expect(deps.store.findForExam('e1')).toBeNull();
    expect(storage.keys()).toEqual(['attempt:index']);
  });
});
