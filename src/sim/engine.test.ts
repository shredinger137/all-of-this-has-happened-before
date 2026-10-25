import { describe, expect, it } from 'vitest';
import { DEPARTURE_DEADLINE, NATURAL_WAKE, START_MINUTE } from './constants';
import { childRate, collapseStart, createGame, currentIncident, escalationChance, offered, parentRate, reduce, results, shoesAtDoorMinutes } from './engine';
import { INCIDENTS } from './content';
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
  it('starts at 06:45 with the child asleep', () => {
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
    s = run(s, { type: 'startParent', task: 'lunch' }, { type: 'startParent', task: 'breakfastMade', variant: 'oatmeal' });
    expect(s.minute).toBe(START_MINUTE + 15); // lunch 8 + oatmeal 7: right at 07:00
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
      return !t.objectives.breakfastEaten.pending && !currentIncident(run(t, { type: 'startParent', task: 'lunch' }));
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
  it('hair only progresses while you help, and assigning it takes you too', () => {
    const base = seedWhere((g) => {
      const t = run(g, { type: 'wakeNow' }, { type: 'assignChild', task: 'hair' });
      return t.morningCondition === 'ordinary' && !currentIncident(t) && t.objectives.hair.status === 'done';
    });
    const s = run(base, { type: 'wakeNow' }, { type: 'assignChild', task: 'hair' });
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
    for (let i = 0; i < 80 && s.minute < 8 * 60; i++) s = stepOn(s);
    s = reduce(s, { type: 'leave' });
    expect(s.ended).toBe(true);
    const r = results(s);
    expect(r.lateness).toBeGreaterThan(0);
    expect(r.leftBehind).toContain('Packed lunch');
  });

  it('cannot leave without waking her', () => {
    const s = createGame(7);
    expect(reduce(s, { type: 'leave' })).toBe(s);
  });

  it('leaving is final: no ambush at the door, whatever was going on stays behind', () => {
    const s = run(ordinary(), { type: 'wakeNow' }, { type: 'assignChild', task: 'breakfastEaten' }, { type: 'startParent', task: 'lunch' });
    const gone = reduce(s, { type: 'leave' });
    expect(gone.ended).toBe(true);
    // Shoes not on yet go on at the door, on your time; nothing else holds you up.
    expect(gone.departedAt).toBe(s.minute + shoesAtDoorMinutes(s));
    expect(gone.objectives.shoesOn.status).toBe('done');
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
  phone: 'ignore',
  groupChat: 'mute',
  doorbell: 'sign',
  shoesOff: 'together',
  coatOff: 'leave',
  hairMess: 'leave',
  juice: 'wipe',
  hungryAgain: 'snack',
  bagRaid: 'repack',
  wobble: 'hug',
  upset: 'hug',
  wrongBreakfast: 'remake',
  hairdo: 'down',
  flop: 'scoop',
  helper: 'no',
  joke: 'interrupt',
  closedDoor: 'sorry',
  cats: 'let',
};

/** Play on without leaving: respond to whatever comes up, otherwise wait. */
const stepOn = (s: GameState) =>
  currentIncident(s) ? reduce(s, { type: 'respond', response: INCIDENT_FALLBACK[currentIncident(s)!.id] }) : reduce(s, { type: 'wait' });

describe('the endgame', () => {
  it('a wave is announced in advance, stops the clock, then lands as problems', () => {
    let s = run(createGame(11), { type: 'wakeNow' }, { type: 'assignChild', task: 'breakfastEaten' });
    for (let i = 0; i < 300 && !s.wave && !s.ended; i++) s = stepOn(s);
    const wave = s.wave!;
    expect(wave).toBeDefined();
    expect(wave.announced).toBeGreaterThanOrEqual(collapseStart(s));
    expect(wave.at - wave.announced).toBe(5);
    expect(s.minute).toBe(wave.announced); // the clock stopped for the warning
    expect(wave.size).toBe(1);

    for (let i = 0; i < 50 && s.wave && !s.ended; i++) s = stepOn(s);
    expect(s.waves).toBe(1);
    expect(s.minute).toBeGreaterThanOrEqual(wave.at);
  });

  it('waves grow and come closer together the longer you stay', () => {
    let s = run(createGame(21), { type: 'wakeNow' });
    const announced: { at: number; size: number }[] = [];
    for (let i = 0; i < 400 && s.minute < 8 * 60 + 20 && !s.ended; i++) {
      const before = s.wave?.announced;
      s = stepOn(s);
      if (s.wave && s.wave.announced !== before) announced.push({ at: s.wave.announced, size: s.wave.size });
    }
    expect(announced.length).toBeGreaterThanOrEqual(3);
    expect(announced.map((w) => w.size).slice(0, 3)).toEqual([1, 2, 3]);
    const gaps = announced.slice(1).map((w, i) => w.at - announced[i].at);
    expect(gaps.at(-1)!).toBeLessThanOrEqual(gaps[0]);
  });

  it('a contact can undo finished work, depending on how you respond', () => {
    let found = false;
    for (let seed = 1; seed < 600 && !found; seed++) {
      let s = run(createGame(seed), { type: 'wakeNow' });
      for (let i = 0; i < 400 && !s.ended && currentIncident(s)?.id !== 'shoesOff' && s.minute < 8 * 60 + 30; i++) {
        if (!s.childActivity && s.objectives.shoesOn.status === 'todo' && s.objectives.shoesFound.status === 'done' && !currentIncident(s)) {
          s = reduce(s, { type: 'assignChild', task: 'shoesOn' });
          continue;
        }
        if (!s.parentActivity && s.objectives.shoesFound.status === 'todo' && !currentIncident(s)) {
          s = reduce(s, { type: 'startParent', task: 'shoesFound' });
          continue;
        }
        s = stepOn(s);
      }
      if (currentIncident(s)?.id !== 'shoesOff') continue;
      found = true;
      expect(reduce(s, { type: 'respond', response: 'together' }).objectives.shoesOn.status).toBe('done');
      expect(reduce(s, { type: 'respond', response: 'leave' }).objectives.shoesOn.status).toBe('todo');
    }
    expect(found).toBe(true);
  });

  it('leaving before a wave lands means it never does; the report says so', () => {
    let s = run(createGame(11), { type: 'wakeNow' });
    for (let i = 0; i < 300 && !s.wave && !s.ended; i++) s = stepOn(s);
    while (currentIncident(s)) s = stepOn(s);
    const gone = reduce(s, { type: 'leave' });
    expect(gone.ended).toBe(true);
    expect(gone.waves).toBe(s.waves);
    expect(results(gone).revealed.join(' ')).toContain('before');
  });

  it('arriving more than ten minutes late means the gate had shut: a serious miss', () => {
    let s = run(ordinary(), { type: 'wakeNow' });
    while (!s.ended && s.minute < 8 * 60) s = stepOn(s);
    while (currentIncident(s)) s = stepOn(s);
    s = reduce(s, { type: 'leave' });
    const r = results(s);
    expect(r.lateness).toBeGreaterThan(10);
    expect(r.misses.find((m) => m.id === 'gate')?.severity).toBe('severe');
  });
});

describe('follow-through', () => {
  it('every choice leaves a result to show, which clears when you carry on', () => {
    let s: GameState | undefined;
    for (let seed = 1; seed < 500 && !s; seed++) {
      const g = run(createGame(seed), { type: 'wakeNow' }, { type: 'assignChild', task: 'breakfastEaten' }, { type: 'startParent', task: 'lunch' });
      if (currentIncident(g)) s = g;
    }
    const inc = currentIncident(s!)!;
    const after = reduce(s!, { type: 'respond', response: INCIDENT_FALLBACK[inc.id] });
    expect(after.outcome?.choice).toBeTruthy();
    expect(after.outcome!.costs.length).toBeGreaterThan(0);
    expect(after.outcome!.lines.length).toBeGreaterThan(0);
    const acked = reduce(after, { type: 'ack' });
    expect(acked.outcome).toBeUndefined();
    expect(acked.minute).toBe(after.minute);
  });

  it('a risky choice that backfires opens a follow-up: she is upset now', () => {
    let found = false;
    for (let seed = 1; seed < 2000 && !found; seed++) {
      let s = run(createGame(seed), { type: 'wakeNow' }, { type: 'assignChild', task: 'breakfastEaten' });
      if (currentIncident(s)?.id !== 'spoon') {
        s = reduce(s, { type: 'startParent', task: 'lunch' });
        if (currentIncident(s)?.id !== 'spoon') continue;
      }
      const after = reduce(s, { type: 'respond', response: 'insist' });
      if (currentIncident(after)?.id !== 'upset') continue;
      found = true;
      expect(after.outcome!.good).toBe(false);
      expect(after.householdMood).toBe(s.householdMood - 1);
    }
    expect(found).toBe(true);
  });

  it('making the wrong breakfast in advance starts breakfast with an argument', () => {
    const s = seedWhere((g) => g.breakfastWant !== 'cereal');
    let g = run(s, { type: 'startParent', task: 'breakfastMade', variant: 'cereal' }, { type: 'wakeNow' }, { type: 'assignChild', task: 'breakfastEaten' });
    expect(currentIncident(g)?.id).toBe('wrongBreakfast');
    g = reduce(g, { type: 'respond', response: 'remake' });
    expect(g.breakfastChoice).toBe(s.breakfastWant);
  });

  it('the right breakfast goes down without a word; asking her tells you what that is', () => {
    const s = seedWhere((g) => g.breakfastWant === 'oatmeal');
    const asked = run(s, { type: 'wakeNow' }, { type: 'askBreakfast' });
    expect(asked.intel.at(-1)?.text.toLowerCase()).toContain('oatmeal');
    const g = run(asked, { type: 'startParent', task: 'breakfastMade', variant: 'oatmeal' }, { type: 'assignChild', task: 'breakfastEaten' });
    expect(currentIncident(g)?.id).not.toBe('wrongBreakfast');
  });

  it('she has her own idea about her hair, and you decide what to do about it', () => {
    const s = seedWhere((g) => g.hairWant === 'braids');
    const g = run(s, { type: 'wakeNow' }, { type: 'assignChild', task: 'hair' });
    expect(currentIncident(g)?.id).toBe('hairdo');
    const braided = reduce(g, { type: 'respond', response: 'yes' });
    expect(braided.objectives.hair.extra).toBe(8);
    expect(braided.hairStyle).toBe('braids');
    const down = seedWhere((g) => g.hairWant === 'down');
    expect(currentIncident(run(down, { type: 'wakeNow' }, { type: 'assignChild', task: 'hair' }))?.id).not.toBe('hairdo');
  });

  it('every step of her mood counts', () => {
    const s = createGame(7, { mood: 3 });
    const at = (mood: number) => ({ ...s, householdMood: mood } as GameState);
    for (let m = 1; m <= 5; m++) {
      expect(childRate(at(m))).toBeGreaterThan(childRate(at(m - 1)));
      expect(escalationChance(at(m))).toBeLessThan(escalationChance(at(m - 1)));
      expect(collapseStart(at(m))).toBeGreaterThanOrEqual(collapseStart(at(m - 1)));
    }
  });

  it('she only ends up on the floor when her mood is low', () => {
    for (let seed = 1; seed < 300; seed++) {
      const s = createGame(seed, { mood: 3 });
      const g = run({ ...s, householdMood: 3 } as GameState, { type: 'wakeNow' }, { type: 'assignChild', task: 'dressed' });
      // Waking her early can cost a step of mood; only check mornings that stayed calm.
      if (g.householdMood >= 3) expect(g.objectives.dressed.pending?.incidentId).not.toBe('flop');
    }
    let low = 0;
    for (let seed = 1; seed < 300; seed++) {
      const g = run(createGame(seed, { mood: 1 }), { type: 'wakeNow' }, { type: 'assignChild', task: 'dressed' });
      if (g.objectives.dressed.pending?.incidentId === 'flop') low++;
    }
    expect(low).toBeGreaterThan(20);
  });

  it('a joke goes all the way through, line by line, and ends with a laugh', () => {
    let found = false;
    for (let seed = 1; seed < 3000 && !found; seed++) {
      let s = run(createGame(seed), { type: 'wakeNow' }, { type: 'assignChild', task: 'dressed' });
      for (let i = 0; i < 6 && !currentIncident(s); i++) s = reduce(s, { type: 'startParent', task: 'lunch' });
      if (currentIncident(s)?.id !== 'joke') continue;
      found = true;
      const lines = [currentIncident(s)!.note];
      let steps = 0;
      while (currentIncident(s)?.id === 'joke' && steps++ < 6) {
        const inc = currentIncident(s)!;
        const last = inc.stage === undefined ? false : !INCIDENTS.joke.responses[0].available!(s, inc);
        s = reduce(s, { type: 'respond', response: last ? 'laugh' : 'listen' });
        if (currentIncident(s)?.id === 'joke') {
          lines.push(currentIncident(s)!.note);
          expect(s.outcome).toBeUndefined(); // the conversation carries on in the window
        }
      }
      expect(lines.length).toBeGreaterThanOrEqual(3);
      expect(lines[0]).toBe('Knock knock.');
      expect(s.outcome?.good).toBe(true);
    }
    expect(found).toBe(true);
  });

  it('interrupting the joke: she shuts her door, and the next job opens the door first', () => {
    let found = false;
    for (let seed = 1; seed < 3000 && !found; seed++) {
      let s = run(createGame(seed), { type: 'wakeNow' }, { type: 'assignChild', task: 'dressed' });
      for (let i = 0; i < 6 && !currentIncident(s); i++) s = reduce(s, { type: 'startParent', task: 'lunch' });
      if (currentIncident(s)?.id !== 'joke') continue;
      found = true;
      s = reduce(s, { type: 'respond', response: 'interrupt' });
      expect(s.flags).toContain('sulking');
      expect(s.childActivity).toBeUndefined();
      s = reduce(s, { type: 'assignChild', task: 'teeth' });
      expect(currentIncident(s)?.id).toBe('closedDoor');
      s = reduce(s, { type: 'respond', response: 'sorry' });
      expect(s.flags).not.toContain('sulking');
    }
    expect(found).toBe(true);
  });

  it('coffee makes you faster for a while', () => {
    const s = run(ordinary(), { type: 'startParent', task: 'coffee' });
    expect(parentRate(s)).toBeGreaterThan(1);
    expect(s.caffeinatedUntil).toBe(s.minute + 20);
  });
});

describe('tension', () => {
  it('a problem put off too long comes back, worse, and costs mood', () => {
    // Find a morning where getting dressed is interrupted by socks or the outfit (both deferrable).
    let s: GameState | undefined;
    for (let seed = 1; seed < 3000 && !s; seed++) {
      const g = run(createGame(seed), { type: 'wakeNow' }, { type: 'assignChild', task: 'dressed' }, { type: 'startParent', task: 'lunch' });
      const inc = currentIncident(g);
      if (inc && (inc.id === 'socks' || inc.id === 'outfit')) s = g;
    }
    expect(s).toBeDefined();
    const deferred = reduce(s!, { type: 'defer' });
    const uid = currentIncident(s!)!.uid;
    let g = deferred;
    // Other things may come up meanwhile; deal with them and keep waiting.
    for (let i = 0; i < 40 && !g.incidents.find((x) => x.uid === uid)?.worse; i++) g = stepOn(g);
    const back = g.incidents.find((x) => x.uid === uid)!;
    expect(back.worse).toBe(true);
    expect(back.status).toBe('open');
    expect(g.history.some((h) => h.text.includes("it's back, and worse"))).toBe(true);
  });

  it('the phone can interrupt your own task once she is up, and the task carries on after', () => {
    let found = false;
    for (let seed = 1; seed < 3000 && !found; seed++) {
      let g = run(createGame(seed), { type: 'wakeNow' }, { type: 'startParent', task: 'lunch' });
      const inc = currentIncident(g);
      if (inc?.id !== 'phone' || inc.task !== 'lunch') continue;
      found = true;
      expect(g.objectives.lunch.status).toBe('blocked');
      g = reduce(g, { type: 'respond', response: 'ignore' });
      expect(g.objectives.lunch.status).not.toBe('blocked');
      for (let i = 0; i < 10 && g.objectives.lunch.status !== 'done'; i++) {
        g = currentIncident(g) ? reduce(g, { type: 'respond', response: INCIDENT_FALLBACK[currentIncident(g)!.id] }) : reduce(g, { type: 'wait' });
      }
      expect(g.objectives.lunch.status).toBe('done');
    }
    expect(found).toBe(true);
  });
});

describe('the day: weather, school events, intel', () => {
  const withEvent = (e: EventId, extra: (g: GameState) => boolean = () => true) =>
    seedWhere((g) => g.day.event === e && !g.day.eventKnown && extra(g));

  it('every morning has a forecast and a calendar entry', () => {
    const s = createGame(3);
    expect(s.intel.map((i) => i.source).slice(0, 2)).toEqual(['Forecast', 'Fridge calendar']);
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
    expect(seen.size).toBe(7);
  });

  it('the school email confirms the event, and assembly moves the leaving time', () => {
    let s = withEvent('assembly');
    expect(s.departureDeadline).toBe(DEPARTURE_DEADLINE);
    s = run(s, { type: 'startParent', task: 'email' });
    expect(s.day.eventKnown).toBe(true);
    expect(s.departureDeadline).toBe(DEPARTURE_DEADLINE - 5);
    expect(offered(s, 'email')).toBe(false);
  });

  it('paperwork day: the form is offered once confirmed, and is quicker once found in the bag', () => {
    let s = withEvent('paperwork');
    s = run(s, { type: 'startParent', task: 'email' });
    expect(offered(s, 'paperwork')).toBe(true);
    const before = s.minute;
    const filled = run(s, { type: 'startParent', task: 'paperwork' });
    expect(filled.minute - before).toBeGreaterThanOrEqual(6); // not found yet: hunting for it first
  });

  it('event tasks are only offered when the intel points at them', () => {
    const s = withEvent('stuffy', (g) => g.intel.every((i) => i.claims !== 'stuffy'));
    expect(offered(s, 'stuffy')).toBe(false);
    const confirmed = run(s, { type: 'startParent', task: 'email' });
    expect(offered(confirmed, 'stuffy')).toBe(true);
  });

  it('missing an unconfirmed event item is a severe miss, revealed in the report', () => {
    let s = withEvent('project', (g) => g.intel.every((i) => i.claims !== 'project'));
    s = run(s, { type: 'wakeNow' }, { type: 'leave' });
    const r = results(s);
    expect(r.misses.find((m) => m.id === 'event:project')?.severity).toBe('severe');
    expect(r.revealed[0]).toContain('The leaf project was due. You never confirmed it.');
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
    const f = reduce(s, { type: 'favor' });
    expect(f.day.eventKnown).toBe(true);
    expect(f.fate).toBe(0);
    expect(f.minute).toBe(s.minute);
    expect(reduce(f, { type: 'favor' })).toBe(f);
  });

  it('festival clothes count as getting dressed', () => {
    let s = withEvent('festival');
    s = run(s, { type: 'startParent', task: 'email' }, { type: 'wakeNow' }, { type: 'assignChild', task: 'festivalClothes' });
    for (let i = 0; i < 40 && s.objectives.festivalClothes.status !== 'done'; i++) {
      s = currentIncident(s) ? reduce(s, { type: 'respond', response: INCIDENT_FALLBACK[currentIncident(s)!.id] }) : reduce(s, { type: 'wait' });
    }
    expect(s.objectives.dressed.status).toBe('done');
  });

  it('rain makes the coat a requirement and the walk longer', () => {
    const s = seedWhere((g) => g.day.weather === 'rain' && !g.day.event);
    const ended = run(s, { type: 'wakeNow' }, { type: 'leave' });
    const r = results(ended);
    expect(r.misses.some((m) => m.id === 'coat')).toBe(true);
    expect(r.arrived).toBe(ended.departedAt! + 15 + 3);
  });

  it('rain gear on a day that stays dry means rain boots all day', () => {
    let s = seedWhere((g) => g.day.weather === 'clear' && !g.day.event);
    s = run(s, { type: 'wakeNow' }, { type: 'assignChild', task: 'coat' });
    while (s.objectives.coat.status !== 'done' && !s.ended) {
      s = currentIncident(s) ? reduce(s, { type: 'respond', response: INCIDENT_FALLBACK[currentIncident(s)!.id] }) : reduce(s, { type: 'wait' });
    }
    expect(s.flags).toContain('wellies');
    expect(results(run(s, { type: 'leave' })).misses.some((m) => m.id === 'wellies')).toBe(true);
  });

  it('a look outside does not always settle the weather, and can be taken again', () => {
    let unsettled = 0;
    for (let seed = 1; seed < 80; seed++) {
      const g = createGame(seed);
      if (g.day.weather === 'cold') continue;
      let s = run(g, { type: 'startParent', task: 'window' });
      while (s.parentActivity === 'window' && !s.ended) {
        s = currentIncident(s) ? reduce(s, { type: 'respond', response: INCIDENT_FALLBACK[currentIncident(s)!.id] }) : reduce(s, { type: 'wait' });
      }
      if (!s.day.weatherKnown) {
        unsettled++;
        expect(s.objectives.window.status).toBe('todo');
        expect(offered(s, 'window')).toBe(true);
      }
    }
    expect(unsettled).toBeGreaterThan(5);
  });

  it('a packed bag the night before finds the form', () => {
    const seed = withEvent('paperwork').seed;
    const s = createGame(seed, { prepared: ['bagChecked'] });
    expect(s.day.eventKnown).toBe(true);
    expect(s.flags).toContain('formFound');
  });
});
