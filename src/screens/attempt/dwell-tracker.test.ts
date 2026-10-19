import { MAX_DWELL_MS, pause, resume, startDwell, switchQuestion, take } from './dwell-tracker';

describe('dwell tracker', () => {
  it('measures the time on a question until it is answered, then starts over', () => {
    const state = startDwell('q1', 1000, true);
    const first = take(state, 5000);
    expect(first.ms).toBe(4000);
    expect(take(first.next, 6500).ms).toBe(1500);
  });

  it('adds earlier visits to the time of the question finally answered', () => {
    let state = startDwell('q1', 0, true);
    state = switchQuestion(state, 'q2', 3000); // 3s on q1, unanswered
    state = switchQuestion(state, 'q1', 5000); // 2s on q2
    const answer = take(state, 6000); // +1s on q1
    expect(answer.ms).toBe(4000);
    // q2's time is kept for when it gets answered.
    const back = switchQuestion(answer.next, 'q2', 6000);
    expect(take(back, 7000).ms).toBe(3000);
  });

  it('does not count time while the app is in the background', () => {
    let state = startDwell('q1', 0, true);
    state = pause(state, 2000);
    state = resume(state, 60_000);
    expect(take(state, 61_000).ms).toBe(3000);
  });

  it('starts paused when the app is not active', () => {
    const state = resume(startDwell('q1', 0, false), 5000);
    expect(take(state, 6000).ms).toBe(1000);
  });

  it('ignores time before a question is shown', () => {
    const state = switchQuestion(startDwell(null, 0, true), 'q1', 10_000);
    expect(take(state, 12_000).ms).toBe(2000);
  });

  it('caps long stretches and ignores a clock that went backwards', () => {
    expect(take(startDwell('q1', 0, true), 60 * 60_000).ms).toBe(MAX_DWELL_MS);
    expect(take(startDwell('q1', 5000, true), 1000).ms).toBe(0);
  });
});
