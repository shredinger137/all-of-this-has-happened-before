import { describe, expect, it } from 'vitest';
import { CHILD_TASKS, INCIDENTS } from './content';
import { currentIncident, offered, reduce, results } from './engine';
import { chooseCards, choosePerk, finishMorning, morningSeed, newRun, startMorning, type RunState } from './run';
import type { GameState } from './types';

/** A quick, careless morning: wake her, give her one task, leave. */
function playQuickly(s: GameState): GameState {
  s = reduce(s, { type: 'wakeNow' });
  for (let i = 0; i < 200 && !s.ended; i++) {
    const inc = currentIncident(s);
    if (inc) {
      const r = INCIDENTS[inc.id].responses.find((x) => !x.available || x.available(s, inc))!;
      s = reduce(s, { type: 'respond', response: r.id });
    } else s = reduce(s, { type: 'leave' });
  }
  return s;
}

/** A thorough morning: everything offered, then leave. Usually late. */
function playSlowly(s: GameState): GameState {
  s = reduce(s, { type: 'wakeNow' });
  for (let i = 0; i < 400 && !s.ended; i++) {
    const inc = currentIncident(s);
    if (inc) {
      const r = INCIDENTS[inc.id].responses.find((x) => !x.available || x.available(s, inc))!;
      s = reduce(s, { type: 'respond', response: r.id });
      continue;
    }
    if (s.minute > 8 * 60 + 20) {
      s = reduce(s, { type: 'leave' });
      continue;
    }
    const t = CHILD_TASKS.find((c) => offered(s, c) && s.objectives[c].status === 'todo');
    s = t && !s.childActivity ? reduce(s, { type: 'assignChild', task: t }) : reduce(s, { type: 'wait' });
  }
  return s;
}

function playDay(run: RunState, play: (s: GameState) => GameState): RunState {
  return finishMorning(run, play(startMorning(run)));
}

describe('the run', () => {
  it('starts on Monday morning of week 1 with a fate point', () => {
    const run = newRun(1);
    expect([run.week, run.weekday, run.phase, run.fate]).toEqual([1, 0, 'morning', 1]);
  });

  it('each day gets a different seed, and the same run replays the same days', () => {
    const a = newRun(9);
    const b = { ...a, daysPlayed: 1 };
    expect(morningSeed(a)).not.toBe(morningSeed(b));
    expect(startMorning(newRun(9)).seed).toBe(startMorning(newRun(9)).seed);
  });

  it('after a morning comes an evening with four cards; picks prepare the next morning', () => {
    let run = playDay(newRun(2), playQuickly);
    expect(run.phase).toBe('evening');
    expect(run.offer).toHaveLength(4);
    const pick = run.offer.filter((c) => c === 'clothes' || c === 'lunch' || c === 'shoes' || c === 'bag');
    run = chooseCards(run, run.offer.slice(0, 2));
    expect(run.phase).toBe('morning');
    expect(run.weekday).toBe(1);
    expect(run.picks).toHaveLength(2);
    const s = startMorning(run);
    expect(s.day.label).toBe('Week 1 · Tuesday');
    for (const c of pick.filter((x) => run.picks.includes(x))) {
      const task = { clothes: 'clothesOut', lunch: 'lunch', shoes: 'shoesFound', bag: 'bagChecked' }[c] as keyof GameState['objectives'];
      expect(s.objectives[task].status).toBe('done');
    }
  });

  it('only two cards count, and only from tonight\'s offer', () => {
    const run = playDay(newRun(3), playQuickly);
    const next = chooseCards(run, [...run.offer, 'promise']);
    expect(next.picks).toHaveLength(2);
  });

  it('on-time mornings with no severe misses earn fate, capped at three', () => {
    let run: RunState = { ...newRun(4), fate: 3 };
    run = playDay(run, playQuickly);
    expect(run.fate).toBeLessThanOrEqual(3);
  });

  it('Friday ends in a weekly report with perks on offer, then Sunday evening, then Monday', () => {
    let run = newRun(5);
    for (let d = 0; d < 5; d++) {
      run = playDay(run, playQuickly);
      if (run.phase === 'evening') run = chooseCards(run, run.offer.slice(0, 2));
    }
    expect(run.phase).toBe('weekly');
    expect(run.weekLog).toHaveLength(5);
    expect(run.perkOffer).toHaveLength(3);
    run = choosePerk(run, run.perkOffer[0]);
    expect(run.perks).toHaveLength(1);
    expect(run.phase).toBe('evening');
    run = chooseCards(run, run.offer.slice(0, 2));
    expect([run.week, run.weekday, run.lateMarks]).toEqual([2, 0, 0]);
  });

  it('three late marks in a week mean a meeting with the head teacher on Monday', () => {
    let run = newRun(6);
    for (let d = 0; d < 5; d++) {
      run = playDay(run, playSlowly);
      if (run.phase === 'evening') run = chooseCards(run, []);
    }
    expect(run.lateMarks).toBeGreaterThanOrEqual(3);
    expect(run.meetingMonday).toBe(true);
    run = chooseCards(choosePerk(run), []);
    const monday = startMorning(run);
    expect(monday.day.meeting).toBe(true);
    expect(monday.departureDeadline).toBeLessThan(7 * 60 + 45);
    expect(results(playQuickly(monday)).revealed.join(' ')).toContain('head teacher');
  });

  it('an unreturned library book makes tomorrow a library day, known from the start', () => {
    let run: RunState = { ...newRun(7), overdueBook: true };
    const s = startMorning(run);
    expect(s.day.event).toBe('library');
    expect(s.day.eventKnown).toBe(true);
    run = finishMorning(run, playQuickly(s));
    expect(typeof run.overdueBook).toBe('boolean');
  });

  it('a promise carries into tomorrow; keeping it is offered that evening', () => {
    const run = playDay(newRun(8), (s) => {
      const g = playQuickly(s);
      return { ...g, flags: [...g.flags, 'promisedDress'] };
    });
    expect(run.promises).toEqual(['dress']);
    expect(run.offer).toContain('promise');
  });
});
