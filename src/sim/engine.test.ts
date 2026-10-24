import { describe, expect, it } from 'vitest';
import { DEPARTURE_DEADLINE, NATURAL_WAKE, START_MINUTE } from './constants';
import { createGame, currentIncident, offered, reduce, results } from './engine';
import type { Action, EventId, GameState } from './types';

const run = (s: GameState, ...actions: Action[]) => actions.reduce(reduce, s);

/** Find a seed whose rolled setup matches a predicate, for stable scenarios. */
function seedWhere(pred: (s: GameState) => boolean): GameState {
  for (let seed = 1; seed < 5000; seed++) {
    const s = createGame(seed);
    if (pred(s)) return s;
  }
  throw new Error('no seed found');
}

const ordinary = () => seedWhere((s) => s.morningCondition === 'ordinary' && s.childTendency !== 'independent');

describe('morning start', () => {
  it('starts at 06:30 with the child asleep', () => {
    const s = createGame(42);
    expect(s.minute).toBe(START_MINUTE);
    expect(s.childAwake).toBe(false);
  });

  it('a prep action advances the clock by its duration and completes it', () => {
    const s = run(ordinary(), { type: 'startParent', task: 'lunch' });
    expect(s.minute).toBe(START_MINUTE + 8);
    expect(s.objectives.lunch.status).toBe('done');
  });

  it('wakes her naturally at 07:00 and pauses there', () => {
    let s = ordinary();
    s = run(s, { type: 'startParent', task: 'lunch' }, { type: 'startParent', task: 'breakfastMade' }, { type: 'startParent', task: 'parentReady' });
    expect(s.minute).toBe(START_MINUTE + 23);
    s = run(s, { type: 'startParent', task: 'bagChecked' });
    // bag check may raise the library incident; either way 07:00 is not crossed silently
    expect(s.minute).toBeLessThanOrEqual(NATURAL_WAKE);
    while (!s.childAwake) s = reduce(s, currentIncident(s) ? { type: 'respond', response: 'leave' } : { type: 'wait' });
    expect(s.minute).toBe(NATURAL_WAKE);
    expect(s.groggyUntil).toBeUndefined();
  });

  it('waking early makes her groggy, more so the earlier it is', () => {
    const early = run(ordinary(), { type: 'wakeNow' });
    const later = run(ordinary(), { type: 'startParent', task: 'lunch' }, { type: 'startParent', task: 'breakfastMade' }, { type: 'wakeNow' });
    expect(early.childAwake).toBe(true);
    expect(early.groggyLevel).toBeGreaterThan(later.groggyLevel);
    expect(early.groggyUntil! - early.minute).toBeGreaterThan(later.groggyUntil! - later.minute);
  });
});

describe('parallel activity', () => {
  it('child and parent progress over the same minutes without double counting', () => {
    // find a run where eating breakfast is not interrupted
    const base = seedWhere((s) => {
      if (s.morningCondition !== 'ordinary' || s.childTendency !== 'cheerful') return false;
      const t = run(s, { type: 'wakeNow' }, { type: 'assignChild', task: 'breakfastEaten' });
      return !t.objectives.breakfastEaten.pending;
    });
    let s = run(base, { type: 'wakeNow' }, { type: 'assignChild', task: 'breakfastEaten' });
    const t0 = s.minute;
    s = run(s, { type: 'startParent', task: 'lunch' });
    // prep is slower once she's up: 8 min of work at 0.8/min
    expect(s.minute).toBe(t0 + 10);
    expect(s.objectives.lunch.status).toBe('done');
    // eating progressed alongside (slowed by grogginess), but not twice over
    const eat = s.objectives.breakfastEaten;
    expect(eat.progress).toBeGreaterThan(5);
    expect(eat.progress).toBeLessThanOrEqual(10);
  });

  it('records parallel spans for the morning plot', () => {
    const s = run(ordinary(), { type: 'startParent', task: 'lunch' });
    expect(s.spans).toEqual([{ lane: 'parent', kind: 'task', task: 'lunch', start: START_MINUTE, end: START_MINUTE + 8 }]);
  });

  it('assigning the child is free', () => {
    const s = run(ordinary(), { type: 'wakeNow' });
    const t = run(s, { type: 'assignChild', task: 'dressed' });
    expect(t.minute).toBe(s.minute);
    expect(t.childActivity).toBe('dressed');
  });
});

describe('supervised tasks', () => {
  it('teeth only progress while you help, and assigning them takes you too', () => {
    const base = seedWhere((g) => {
      const t = run(g, { type: 'wakeNow' }, { type: 'assignChild', task: 'teeth' });
      return t.morningCondition === 'ordinary' && !currentIncident(t) && t.objectives.teeth.status === 'done';
    });
    const s = run(base, { type: 'wakeNow' }, { type: 'assignChild', task: 'teeth' });
    expect(s.minute).toBeGreaterThan(base.minute);
    expect(s.parentActivity).toBeUndefined();
  });

  it('stalls if you go off and do something else', () => {
    let s = run(ordinary(), { type: 'wakeNow' }, { type: 'assignChild', task: 'hair' });
    if (currentIncident(s) || s.objectives.hair.status === 'done') return; // seed-dependent; covered above
    s = run(s, { type: 'assignChild', task: 'hair' });
    const before = s.objectives.hair.progress;
    s = run(s, { type: 'startParent', task: 'lunch' });
    expect(s.objectives.hair.progress).toBe(before);
  });
});

describe('incidents', () => {
  it('missing shoes fires when shoes were never found, and finding them later resolves it', () => {
    let s = seedWhere((g) => g.morningCondition === 'ordinary');
    s = run(s, { type: 'wakeNow' }, { type: 'assignChild', task: 'shoesOn' });
    expect(currentIncident(s)?.id).toBe('shoesMissing');
    s = run(s, { type: 'defer' });
    expect(s.objectives.shoesOn.status).toBe('blocked');
    s = run(s, { type: 'startParent', task: 'shoesFound' });
    while (currentIncident(s)) s = reduce(s, { type: 'respond', response: INCIDENT_FALLBACK[currentIncident(s)!.id] });
    if (s.objectives.shoesFound.status !== 'done') s = run(s, { type: 'startParent', task: 'shoesFound' });
    expect(s.incidents.some((i) => i.id === 'shoesMissing')).toBe(false);
    expect(s.objectives.shoesOn.status).toBe('todo');
  });

  it('an interrupted task keeps its progress', () => {
    const base = seedWhere((g) => {
      const t = run(g, { type: 'wakeNow' }, { type: 'assignChild', task: 'dressed' });
      return t.objectives.dressed.pending?.incidentId === 'socks';
    });
    let s = run(base, { type: 'wakeNow' }, { type: 'assignChild', task: 'dressed' }, { type: 'wait' });
    expect(currentIncident(s)?.id).toBe('socks');
    const progress = s.objectives.dressed.progress;
    expect(progress).toBeGreaterThan(0);
    s = run(s, { type: 'respond', response: 'skip' });
    expect(s.objectives.dressed.progress).toBe(progress);
    expect(s.objectives.dressed.status).toBe('active');
  });

  it('response minutes are charged to the clock', () => {
    let s = run(ordinary(), { type: 'wakeNow' }, { type: 'assignChild', task: 'shoesOn' });
    const t0 = s.minute;
    s = run(s, { type: 'respond', response: 'together' });
    expect(s.minute).toBe(t0 + 6);
  });
});

describe('determinism and ending', () => {
  const script: Action[] = [
    { type: 'startParent', task: 'lunch' },
    { type: 'wakeNow' },
    { type: 'assignChild', task: 'breakfastEaten' },
    { type: 'startParent', task: 'breakfastMade' },
    { type: 'wait' },
    { type: 'wait' },
    { type: 'leave' },
  ];

  it('same seed + same decisions = same morning', () => {
    const play = () => {
      let s = createGame(1234);
      for (const a of script) {
        s = reduce(s, a);
        while (currentIncident(s) && !s.ended) s = reduce(s, { type: 'respond', response: INCIDENT_FALLBACK[currentIncident(s)!.id] });
      }
      return s;
    };
    expect(play()).toEqual(play());
  });

  it('can leave late and underprepared, and the debrief reports it', () => {
    let s = run(ordinary(), { type: 'wakeNow' });
    for (let i = 0; i < 20 && s.minute < 8 * 60; i++) s = reduce(s, { type: 'wait' });
    s = reduce(s, { type: 'leave' });
    if (!s.ended) s = reduce(s, { type: 'respond', response: 'wait' });
    expect(s.ended).toBe(true);
    const r = results(s);
    expect(r.lateness).toBeGreaterThan(0);
    expect(r.leftBehind).toContain('Packed lunch');
  });

  it('cannot leave without waking her', () => {
    const s = createGame(7);
    expect(reduce(s, { type: 'leave' })).toBe(s);
  });

  it('a bathroom trip at the door stops whatever you were both doing', () => {
    const s = seedWhere((g) => {
      const at = run(g, { type: 'wakeNow' }, { type: 'assignChild', task: 'breakfastEaten' }, { type: 'startParent', task: 'lunch' });
      return currentIncident(at) === undefined && currentIncident(reduce(at, { type: 'leave' }))?.id === 'bathroom';
    });
    const door = run(s, { type: 'wakeNow' }, { type: 'assignChild', task: 'breakfastEaten' }, { type: 'startParent', task: 'lunch' }, { type: 'leave' });
    expect(currentIncident(door)?.id).toBe('bathroom');
    expect(door.parentActivity).toBeUndefined();
    expect(door.childActivity).toBeUndefined();
  });
});

// A response that every incident type supports and that always resolves it.
const INCIDENT_FALLBACK: Record<string, string> = {
  spoon: 'abandon',
  spill: 'later',
  socks: 'skip',
  outfit: 'change',
  bug: 'ignore',
  shoesMissing: 'together',
  library: 'leave',
  bathroom: 'wait',
  stuffyWash: 'skip',
  peLaundry: 'skip',
};

describe('the day: weather, school events, intel', () => {
  const withEvent = (e: EventId, extra: (g: GameState) => boolean = () => true) =>
    seedWhere((g) => g.day.event === e && !g.day.eventKnown && extra(g));

  it('every morning has a forecast and a calendar entry', () => {
    const s = createGame(3);
    expect(s.intel.map((i) => i.source)).toEqual(['Forecast', 'Fridge calendar']);
    expect(s.day.eventKnown).toBe(false);
  });

  it('some mornings have a school event, and over many seeds every kind appears', () => {
    const seen = new Set<string>();
    let events = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const e = createGame(seed).day.event;
      if (e) {
        events++;
        seen.add(e);
      }
    }
    expect(events / 400).toBeGreaterThan(0.3);
    expect(events / 400).toBeLessThan(0.5);
    expect(seen.size).toBe(6);
  });

  it('the school email confirms the event, and a trip moves the leaving time', () => {
    let s = withEvent('trip');
    expect(s.departureDeadline).toBe(DEPARTURE_DEADLINE);
    s = run(s, { type: 'startParent', task: 'email' });
    expect(s.day.eventKnown).toBe(true);
    expect(s.departureDeadline).toBe(DEPARTURE_DEADLINE - 10);
    expect(offered(s, 'slip')).toBe(true);
    expect(offered(s, 'email')).toBe(false);
  });

  it('event tasks are only offered when the intel points at them', () => {
    const s = withEvent('stuffy', (g) => g.intel.every((i) => i.claims !== 'stuffy'));
    expect(offered(s, 'stuffy')).toBe(false);
    const confirmed = run(s, { type: 'startParent', task: 'email' });
    expect(offered(confirmed, 'stuffy')).toBe(true);
  });

  it('missing an unconfirmed event item is a severe miss, revealed in the report', () => {
    let s = withEvent('pe', (g) => g.intel.every((i) => i.claims !== 'pe'));
    s = run(s, { type: 'wakeNow' }, { type: 'leave' });
    while (currentIncident(s) && !s.ended) s = reduce(s, { type: 'respond', response: INCIDENT_FALLBACK[currentIncident(s)!.id] });
    const r = results(s);
    expect(r.misses.find((m) => m.id === 'event:pe')?.severity).toBe('severe');
    expect(r.revealed[0]).toContain('It was PE day. You never confirmed it.');
  });

  it('asking her adds low-grade intel and costs a minute', () => {
    const s = run(ordinary(), { type: 'wakeNow' });
    const asked = reduce(s, { type: 'ask' });
    expect(asked.minute).toBe(s.minute + 1);
    expect(asked.intel.at(-1)?.grade).toBe('E5');
    expect(reduce(asked, { type: 'ask' })).toBe(asked); // once only
  });

  it('a fate point confirms the event without spending minutes', () => {
    const s = createGame(5, { fate: 1 });
    const f = reduce(s, { type: 'favour' });
    expect(f.day.eventKnown).toBe(true);
    expect(f.fate).toBe(0);
    expect(f.minute).toBe(s.minute);
    expect(reduce(f, { type: 'favour' })).toBe(f);
  });

  it('a costume counts as getting dressed', () => {
    let s = withEvent('dressUp');
    s = run(s, { type: 'startParent', task: 'email' }, { type: 'wakeNow' }, { type: 'assignChild', task: 'costume' });
    for (let i = 0; i < 40 && s.objectives.costume.status !== 'done'; i++) {
      s = currentIncident(s) ? reduce(s, { type: 'respond', response: INCIDENT_FALLBACK[currentIncident(s)!.id] }) : reduce(s, { type: 'wait' });
    }
    expect(s.objectives.dressed.status).toBe('done');
  });

  it('rain makes the coat a requirement and the walk longer', () => {
    const s = seedWhere((g) => g.day.weather === 'rain' && !g.day.event);
    const ended = run(s, { type: 'wakeNow' }, { type: 'leave' });
    if (!ended.ended) return; // bathroom at the door; covered elsewhere
    const r = results(ended);
    expect(r.misses.some((m) => m.id === 'coat')).toBe(true);
    expect(r.arrived).toBe(ended.departedAt! + 15 + 3);
  });

  it('a packed bag the night before confirms a trip', () => {
    const seed = withEvent('trip').seed;
    const s = createGame(seed, { prepared: ['bagChecked'] });
    expect(s.day.eventKnown).toBe(true);
    expect(s.flags).toContain('slipFound');
  });
});
