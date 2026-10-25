// Tuning harness: "did a good player barely make it?"
//
//   npx vite-node scripts/tune.ts                 # single mornings (Tuesday, no evening prep) + full weeks
//   npx vite-node scripts/tune.ts -- --n 2000     # mornings per policy (default 1500)
//   npx vite-node scripts/tune.ts -- --runs 150   # runs for the week mode (default 100, 4 weeks each)
//   npx vite-node scripts/tune.ts -- --only strong --mode week
//
// Margin = school start − arrival (minutes). Negative = late. "Close call" = arrived with 0–3 min to spare.
// Policies:
//   legacy   the careful/trust/natural bot from scripts/balance.ts (leaves only when everything offered is done)
//   mediocre natural wake, trusts the calendar, does things in a fixed order, leaves when ready, or past the
//            deadline with only minor things left, or when the status bar says 6+ minutes late
//   strong   a competent human: favour/email + window in the quiet window, keeps both lanes busy (wakes her 10 min
//            before she would wake herself), saves shoes and coat for last, cheap reliable incident responses, and leaves as soon as what
//            is left isn't worth the lateness (score: 4 points per late minute vs 5/10/20 per miss)
//   strong-early / strong-natural: the same player waking her 20 min early / letting her sleep
//   strong-wake-25/30: wakes her 25/30 min early (30 = as soon as the favour/email is done)
//   strong-nocards: strong, but skipping the evening cards (how much slack the cards give)
//   Extra flags: --slices (by tendency and condition), --by-week, --severe (which serious misses),
//   --trace <seed> [--week] (print one morning)
import { BREAKFAST_ORDER, BREAKFASTS, CHILD_TASKS, EVENTS, GATE_CLOSES_AFTER, INCIDENTS, TASKS } from '../src/sim/content';
import { formatClock, NATURAL_WAKE } from '../src/sim/constants';
import {
  childRate,
  childTaskBlocker,
  createGame,
  currentIncident,
  escalationChance,
  leaveNowProjection,
  offered,
  parentTaskBlocker,
  reduce,
  requirements,
  results,
  SEVERITY_COST,
  type Requirement,
} from '../src/sim/engine';
import { chooseCards, choosePerk, finishMorning, newRun, startMorning, type CardId, type RunState } from '../src/sim/run';
import type { Action, Breakfast, EventId, GameState, IncidentId, TaskId } from '../src/sim/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isDone = (s: GameState, t: TaskId) => s.objectives[t].status === 'done';
const finished = (s: GameState, t: TaskId) => ['done', 'skipped'].includes(s.objectives[t].status);

function eventTask(e?: EventId): TaskId | undefined {
  return e ? EVENTS[e].task : undefined;
}

/** What the player believes today's event is (only what the intel shows). */
function believedEvent(s: GameState): EventId | undefined {
  if (s.day.eventKnown) return s.day.event;
  const cal = [...s.intel].reverse().find((i) => i.claims);
  return cal && cal.claims !== 'none' ? (cal.claims as EventId) : undefined;
}

/** Minutes of work left on a task at the current rates. */
function remaining(s: GameState, t: TaskId, helped = false): number {
  const o = s.objectives[t];
  const dur = TASKS[t].duration(s) + o.extra;
  const left = Math.max(0, dur - o.progress);
  if (TASKS[t].owner === 'parent') return left / (s.childAwake ? 0.8 : 1);
  let rate = childRate({ ...s, parentActivity: undefined } as GameState);
  if (TASKS[t].supervised || helped) rate *= 1.5;
  return left / Math.max(0.3, rate);
}

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

type Policy = {
  name: string;
  step: (s: GameState) => Action;
  evening: (run: RunState) => CardId[];
};

// --- legacy: scripts/balance.ts "natural, careful, trust" ------------------
const LEGACY_PARENT: TaskId[] = ['breakfastMade', 'clothesOut', 'shoesFound', 'lunch', 'paperwork', 'project', 'parentReady', 'bagChecked', 'tea'];
const LEGACY_READY: TaskId[] = [...CHILD_TASKS, 'lunch', 'parentReady', 'paperwork', 'project'];
function legacyStep(s: GameState): Action {
  const inc = currentIncident(s);
  if (inc) {
    const options = INCIDENTS[inc.id].responses.filter((r) => !r.available || r.available(s, inc));
    return { type: 'respond', response: options[0].id };
  }
  if (s.childAwake) {
    const ready = LEGACY_READY.filter((t) => offered(s, t)).every((t) => finished(s, t));
    if (ready || s.minute >= s.departureDeadline + 30) return { type: 'leave' };
    if (!s.childActivity) {
      const t = CHILD_TASKS.find((c) => offered(s, c) && !childTaskBlocker(s, c));
      if (t) return { type: 'assignChild', task: t };
    }
  }
  if (!s.parentActivity) {
    const t = LEGACY_PARENT.find((p) => offered(s, p) && !parentTaskBlocker(s, p));
    if (t) return { type: 'startParent', task: t };
    if (s.childActivity && s.objectives[s.childActivity].status === 'active') return { type: 'help' };
  }
  return { type: 'wait' };
}

// --- mediocre: plausible, unoptimised human --------------------------------
function mediocreStep(s: GameState): Action {
  const inc = currentIncident(s);
  if (inc) {
    // Usually the first (stable) option; quickest when already late.
    const options = INCIDENTS[inc.id].responses.filter((r) => !r.available || r.available(s, inc));
    const late = s.minute >= s.departureDeadline;
    const pick = late ? [...options].sort((a, b) => a.minutes - b.minutes)[0] : options[0];
    return { type: 'respond', response: pick.id };
  }
  if (s.childAwake) {
    const visible = requirements(s).filter((r) => r.known);
    const ready = LEGACY_READY.filter((t) => offered(s, t)).every((t) => finished(s, t));
    const seriousLeft = visible.some((r) => !r.met && r.severity !== 'minor' && r.id !== 'mood');
    // Watches the status bar: gives up on the rest once it says 6+ minutes late.
    if (ready || (s.minute >= s.departureDeadline && !seriousLeft) || leaveNowProjection(s).spare <= -6) return { type: 'leave' };
    if (!s.childActivity) {
      const t = CHILD_TASKS.find((c) => offered(s, c) && !childTaskBlocker(s, c));
      if (t) return { type: 'assignChild', task: t };
    }
  }
  if (!s.parentActivity) {
    const t = LEGACY_PARENT.find((p) => offered(s, p) && !parentTaskBlocker(s, p));
    if (t) return { type: 'startParent', task: t };
    if (s.childActivity && s.objectives[s.childActivity].status === 'active') return { type: 'help' };
  }
  return { type: 'wait' };
}

// --- strong: a competent human ----------------------------------------------

/** Points a response is expected to cost (4 points ≈ one late minute), from the player's view. */
function respondStrong(s: GameState): Action {
  const inc = currentIncident(s)!;
  const id: IncidentId = inc.id;
  const ok = (r: string) => INCIDENTS[id].responses.some((x) => x.id === r && (!x.available || x.available(s, inc)));
  const risk = (base = 0.4) => escalationChance(s, base);
  const ev = believedEvent(s);
  const tight = leaveNowProjection(s).spare - childLaneLeft(s) < 2; // little or no slack left
  const pick = (r: string): Action => ({ type: 'respond', response: r });
  switch (id) {
    case 'spoon':
      return pick(risk() < 0.25 ? 'insist' : 'blue');
    case 'spill':
      if (isDone(s, 'dressed') && (ev === 'picture' || ev === 'assembly')) return pick('together');
      return pick(tight ? 'later' : 'wipe');
    case 'socks':
      if (isDone(s, 'clothesOut')) return pick('soft');
      return pick(risk() < 0.3 ? 'insist' : 'soft');
    case 'outfit':
      return pick(risk(0.2) < 0.35 ? 'promise' : 'change');
    case 'bug':
      return pick(tight ? 'ignore' : 'look');
    case 'shoesMissing':
      return pick(s.day.weather === 'rain' && s.day.weatherKnown ? 'wellies' : tight && risk(0.3) < 0.4 ? 'wellies' : 'together');
    case 'library':
      if (ok('ask')) return pick('ask');
      if (ok('search') && !tight) return pick('search');
      return pick('leave');
    case 'bathroom':
      return pick(risk(0.35) < 0.4 ? 'hurry' : 'wait');
    case 'stuffyWash':
      return pick('damp');
    case 'phone':
      return pick('ignore');
    case 'groupChat':
      return pick(s.day.eventKnown || tight ? 'mute' : 'read');
    case 'doorbell':
      return pick(ok('ignore') ? 'ignore' : 'sign');
    case 'shoesOff':
      return pick('together');
    case 'coatOff':
      return pick(risk(0.3) < 0.45 ? 'zip' : 'leave');
    case 'hairMess':
      return pick(ev === 'picture' || !tight ? 'redo' : 'leave');
    case 'juice':
      return pick(ev === 'picture' || ev === 'assembly' || !tight ? 'change' : 'wipe');
    case 'hungryAgain':
      return pick('snack');
    case 'bagRaid':
      return pick(tight ? 'scoop' : 'repack');
    case 'wobble':
      return pick('hug');
    case 'cats':
      return pick(tight ? 'let' : 'together');
    case 'upset':
      return pick(tight ? 'carry' : 'hug');
    case 'wrongBreakfast':
      return pick(risk(0.45) < 0.35 ? 'negotiate' : 'remake');
    case 'hairdo':
      if (!tight && s.hairWant !== 'braids') return pick('yes');
      if (ok('promise') && risk(0.2) < 0.35) return pick('promise');
      return pick(ok('clip') && risk(0.4) < 0.4 ? 'clip' : ok('clip') ? 'yes' : risk(0.45) < 0.4 ? 'down' : 'yes');
    case 'joke':
      return pick(ok('listen') ? 'listen' : 'laugh');
    case 'closedDoor':
      return pick('joke');
    case 'flop':
      return pick(tight ? 'scoop' : 'sit');
    case 'helper':
      return pick(isDone(s, 'shoesFound') && !tight ? 'yes' : 'job');
  }
}

/** Child tasks still wanted today, in the order a sensible parent runs them. */
function childPlan(s: GameState): TaskId[] {
  const ev = believedEvent(s);
  const plan: TaskId[] = ['breakfastEaten'];
  plan.push(ev === 'festival' && offered(s, 'festivalClothes') ? 'festivalClothes' : 'dressed');
  if (ev === 'stuffy' && offered(s, 'stuffy')) plan.push('stuffy');
  plan.push('teeth', 'face', 'hair', 'shoesOn');
  if (offered(s, 'carStuffy') && !(ev === 'stuffy' && offered(s, 'stuffy'))) plan.push('carStuffy');
  const coatNeeded = s.day.weather === 'cold' || (s.day.weatherKnown ? s.day.weather === 'rain' : s.day.rainChance >= 0.5);
  if (coatNeeded && offered(s, 'coat')) plan.push('coat');
  return plan.filter((t) => !finished(s, t) && !(t === 'dressed' && isDone(s, 'festivalClothes')));
}

function childLaneLeft(s: GameState): number {
  return childPlan(s).reduce((n, t) => n + remaining(s, t), 0);
}

/** Parent tasks worth doing, most valuable first. */
function parentPlan(s: GameState, quiet: boolean): TaskId[] {
  const ev = believedEvent(s);
  const plan: TaskId[] = [];
  const et = eventTask(ev);
  if (et && TASKS[et].owner === 'parent') plan.push(et);
  if (!s.objectives.breakfastEaten.progress && !isDone(s, 'breakfastEaten')) plan.push('breakfastMade');
  if (!s.objectives.dressed.progress && !isDone(s, 'dressed')) plan.push('clothesOut');
  if (!isDone(s, 'shoesOn')) plan.push('shoesFound');
  plan.push('bagChecked', 'lunch', 'parentReady');
  if (quiet) plan.push('tea');
  return plan.filter((t) => offered(s, t) && !parentTaskBlocker(s, t));
}

/** Unmet requirements the player can see and still fix, with their cost and time. */
function fixable(s: GameState): { r: Requirement; task: TaskId; time: number; parent: boolean }[] {
  const out: { r: Requirement; task: TaskId; time: number; parent: boolean }[] = [];
  for (const r of requirements(s)) {
    if (r.met || !r.known) continue;
    let task: TaskId | undefined;
    if ((TASKS as Record<string, unknown>)[r.id]) task = r.id as TaskId;
    else if (r.id.startsWith('event:')) task = eventTask(r.id.slice(6) as EventId);
    if (!task || finished(s, task)) continue;
    const parent = TASKS[task].owner === 'parent' || !!TASKS[task].supervised;
    out.push({ r, task, time: remaining(s, task, true) + (task === 'shoesOn' && !isDone(s, 'shoesFound') ? 6 : 0), parent });
  }
  return out;
}

/** Leave once what is left isn't worth the lateness it would cost. */
function shouldLeave(s: GameState): boolean {
  const items = fixable(s).sort((a, b) => SEVERITY_COST[b.r.severity] / b.time - SEVERITY_COST[a.r.severity] / a.time);
  if (!items.length) return true;
  const spare = leaveNowProjection(s).spare;
  let tc = 0;
  let tp = 0;
  let value = 0;
  for (const it of items) {
    if (it.parent) tp += it.time;
    if (!it.parent || TASKS[it.task].supervised) tc += it.time;
    value += SEVERITY_COST[it.r.severity];
    const t = Math.max(tc, tp) + 0.5;
    const late = Math.max(0, t - Math.max(0, spare));
    let cost = 4 * late;
    if (spare - t < -GATE_CLOSES_AFTER) cost += 20;
    if (s.wave && s.minute + t >= s.wave.at) cost += (late > 0 ? 8 : 3) * s.wave.size;
    if (value > cost) return false;
  }
  return true;
}

function strongStep(wakeAt: number | null) {
  return (s: GameState): Action => {
    if (currentIncident(s)) return respondStrong(s);
    const a = strongCore(s);
    // Breakfast: make what the clue says; once she's up, ask her first.
    if (a.type === 'startParent' && a.task === 'breakfastMade') {
      if (s.childAwake && !s.flags.includes('askedBreakfast')) return { type: 'askBreakfast' };
      return { ...a, variant: breakfastGuess(s) };
    }
    return a;
  };

  /** Everything but breakfast's menu: wake, intel, both lanes, and when to leave. */
  function strongCore(s: GameState): Action {
    if (!s.childAwake) {
      if (!s.day.eventKnown && s.fate > 0) return { type: 'favor' };
      if (wakeAt !== null && s.minute >= wakeAt) return { type: 'wakeNow' };
      if (!s.parentActivity) {
        if (offered(s, 'email')) return { type: 'startParent', task: 'email' };
        if (offered(s, 'window') && s.day.rainChance > 0.1 && !s.day.lookedOutside) return { type: 'startParent', task: 'window' };
        const t = parentPlan(s, true)[0];
        if (t) return { type: 'startParent', task: t };
      }
      return { type: 'wait' };
    }

    if (shouldLeave(s)) return { type: 'leave' };

    // Her lane: the next task in plan order that can run. Supervised tasks take you too, so only start
    // them when your own list is empty or time is short. Shoes wait until they are found.
    const plan = childPlan(s);
    const myList = parentPlan(s, false).filter((t) => t !== 'tea');
    const spare = leaveNowProjection(s).spare;
    const short = spare - childLaneLeft(s) < 4;
    const ca = s.childActivity;
    const childBusy = ca && s.objectives[ca].status === 'active';
    if (!childBusy) {
      for (const t of plan) {
        if (childTaskBlocker(s, t)) continue;
        if (TASKS[t].supervised && myList.length && !short) continue;
        if (t === 'shoesOn' && !isDone(s, 'shoesFound')) continue;
        if (t === 'breakfastEaten' && !isDone(s, 'breakfastMade') && s.parentActivity === 'breakfastMade') continue;
        return { type: 'assignChild', task: t };
      }
    }

    // Your lane.
    if (!s.parentActivity) {
      // Shoes first if she's about to need them.
      const needShoes = !isDone(s, 'shoesFound') && plan.filter((t) => t !== 'coat')[0] === 'shoesOn';
      if (needShoes && !parentTaskBlocker(s, 'shoesFound')) return { type: 'startParent', task: 'shoesFound' };
      const sup = plan.find((t) => TASKS[t].supervised && !childTaskBlocker(s, t));
      if (short && childBusy) return { type: 'help' };
      const t = myList[0];
      if (t) return { type: 'startParent', task: t };
      if (childBusy) return { type: 'help' };
      if (sup) return { type: 'assignChild', task: sup };
    }
    if (!childBusy && !s.parentActivity) return { type: 'leave' }; // nothing left that can move
    return { type: 'wait' };
  }
}

/** What she'll want for breakfast, as far as the player knows. */
function breakfastGuess(s: GameState): Breakfast {
  if (s.flags.includes('askedBreakfast')) return s.breakfastWant;
  const clue = [...s.intel].reverse().find((i) => i.text.includes('for breakfast'));
  const named = clue && BREAKFAST_ORDER.find((b) => clue.text.toLowerCase().includes(BREAKFASTS[b].name.toLowerCase()));
  return named ?? 'toast';
}

// --- evening card picks ------------------------------------------------------
const STRONG_CARDS: CardId[] = ['promise', 'lunch', 'clothes', 'bedtime', 'bag', 'kettle', 'shoes', 'newsletter', 'project'];
const strongEvening = (run: RunState) => [...run.offer].sort((a, b) => STRONG_CARDS.indexOf(a) - STRONG_CARDS.indexOf(b)).slice(0, 2);
const firstTwo = (run: RunState) => run.offer.slice(0, 2);

const POLICIES: Policy[] = [
  { name: 'legacy', step: legacyStep, evening: firstTwo },
  { name: 'mediocre', step: mediocreStep, evening: firstTwo },
  { name: 'strong', step: strongStep(NATURAL_WAKE - 10), evening: strongEvening },
  { name: 'strong-early', step: strongStep(NATURAL_WAKE - 20), evening: strongEvening },
  { name: 'strong-natural', step: strongStep(null), evening: strongEvening },
  ...[25, 30].map((m) => ({ name: `strong-wake-${m}`, step: strongStep(NATURAL_WAKE - m), evening: strongEvening })),
  { name: 'strong-nocards', step: strongStep(NATURAL_WAKE - 10), evening: () => [] },
];

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

type Sample = {
  margin: number; // school start − arrival
  gate: boolean;
  severe: number;
  misses: number;
  allDone: boolean;
  minorOnly13: boolean; // 1–3 misses, none serious (the "let something go" morning)
  waves: number;
  score: number;
  event: boolean;
  rain: boolean;
  week?: number;
  tendency: string;
  condition: string;
  departed: number;
  missedEvent: boolean;
  severeIds: string[];
};

function playMorning(s: GameState, p: Policy): GameState {
  for (let i = 0; i < 600 && !s.ended; i++) {
    const next = reduce(s, p.step(s));
    s = next === s && !s.ended ? reduce(s, s.childAwake ? { type: 'leave' } : { type: 'wakeNow' }) : next;
  }
  return s;
}

function sample(s: GameState): Sample {
  const r = results(s);
  return {
    margin: -r.lateness,
    gate: r.misses.some((m) => m.id === 'gate'),
    severe: r.severeMisses,
    misses: r.misses.length,
    allDone: r.misses.length === 0,
    minorOnly13: r.misses.length >= 1 && r.misses.length <= 3 && r.misses.every((m) => m.severity === 'minor'),
    waves: s.waves,
    score: r.score,
    event: !!s.day.event,
    rain: s.day.weather === 'rain',
    departed: r.departed,
    missedEvent: r.misses.some((m) => m.id.startsWith('event:')),
    severeIds: r.misses.filter((m) => m.severity === 'severe').map((m) => m.id),
    tendency: s.childTendency,
    condition: s.morningCondition,
  };
}

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(0)}%` : '-').padStart(5);
function quantile(xs: number[], q: number) {
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(q * a.length))];
}

const HEADER =
  'policy           slice      n     dep   med  p10  p90  ontime close  >5sp  late1-5 gate  sev/m  0miss 1-3min  evMiss waves  score';
function row(name: string, slice: string, xs: Sample[]) {
  if (!xs.length) return;
  const n = xs.length;
  const m = xs.map((x) => x.margin);
  const cnt = (f: (x: Sample) => boolean) => xs.filter(f).length;
  const ev = xs.filter((x) => x.event);
  console.log(
    `${name.padEnd(16)} ${slice.padEnd(8)} ${String(n).padStart(5)}  ${formatClock(xs.reduce((a, x) => a + x.departed, 0) / n)}` +
      ` ${String(quantile(m, 0.5)).padStart(4)} ${String(quantile(m, 0.1)).padStart(4)} ${String(quantile(m, 0.9)).padStart(4)}` +
      ` ${pct(cnt((x) => x.margin >= 0), n)}  ${pct(cnt((x) => x.margin >= 0 && x.margin <= 3), n)} ${pct(cnt((x) => x.margin > 5), n)}` +
      `    ${pct(cnt((x) => x.margin <= -1 && x.margin >= -5), n)} ${pct(cnt((x) => x.gate), n)}` +
      `  ${(xs.reduce((a, x) => a + x.severe, 0) / n).toFixed(2)}  ${pct(cnt((x) => x.allDone), n)}  ${pct(cnt((x) => x.minorOnly13), n)}` +
      `   ${pct(ev.filter((x) => x.missedEvent).length, ev.length)}  ${(xs.reduce((a, x) => a + x.waves, 0) / n).toFixed(2)}` +
      `   ${(xs.reduce((a, x) => a + x.score, 0) / n).toFixed(0).padStart(3)}`,
  );
}

function report(name: string, xs: Sample[]) {
  row(name, 'all', xs);
  row('', 'ordinary', xs.filter((x) => !x.event));
  row('', 'event', xs.filter((x) => x.event));
  row('', 'rain', xs.filter((x) => x.rain));
  if (args.includes('--severe')) {
    // Which serious misses, per morning: what to look at when sev/m is high.
    const c: Record<string, number> = {};
    for (const x of xs) for (const id of x.severeIds) c[id] = (c[id] ?? 0) + 1;
    console.log('                 severe:  ' + Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / xs.length).toFixed(3)}`).join('  '));
  }
  if (args.includes('--slices')) {
    for (const t of ['independent', 'dawdler', 'picky', 'cheerful']) row('', t.slice(0, 8), xs.filter((x) => x.tendency === t));
    for (const c of ['ordinary', 'lateBedtime', 'shoesByDoor', 'noBread', 'earlyBird']) row('', c.slice(0, 8), xs.filter((x) => x.condition === c));
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

declare const process: { argv: string[]; exit(code: number): never }; // no @types/node in this repo
const args = process.argv.slice(2);
const arg = (k: string, d: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const N = Number(arg('n', '1500'));
const RUNS = Number(arg('runs', '100'));
const WEEKS = Number(arg('weeks', '4'));
const only = arg('only', '');
const mode = arg('mode', 'both');
const policies = POLICIES.filter((p) => !only || p.name === only);
const trace = arg('trace', '');

if (trace) {
  // Print one morning's log for a policy: --trace <seed> [--only strong] [--week] (week = day 6 of that run)
  const p = policies[0];
  let g: GameState;
  if (args.includes('--week')) {
    let run = newRun(Number(trace));
    for (let day = 0; day < 6; day++) {
      const s = playMorning(startMorning(run), p);
      run = finishMorning(run, s);
      if (run.phase === 'weekly') run = choosePerk(run, run.perkOffer[0]);
      if (run.phase === 'evening') run = chooseCards(run, p.evening(run));
    }
    console.log('cards:', run.picks.join(', '));
    g = startMorning(run);
  } else g = createGame(Number(trace));
  g = playMorning(g, p);
  for (const h of g.history) console.log(formatClock(h.minute), h.text);
  const r = results(g);
  console.log(`margin ${-r.lateness}  misses: ${r.misses.map((m) => `${m.label} (${m.severity})`).join(', ')}`);
  process.exit(0);
}

if (mode !== 'week') {
  console.log(`\n== Single mornings (Tuesday, nothing prepared, no fate), ${N} seeds ==`);
  console.log('margin = school start − arrival; close = 0–3 min spare; >5sp = more than 5 min spare; sev/m = severe misses per morning;');
  console.log('0miss = nothing left behind; 1-3min = 1–3 things left behind, all minor; evMiss = event days missing the event item');
  console.log(HEADER);
  for (const p of policies) {
    const xs: Sample[] = [];
    for (let seed = 1; seed <= N; seed++) xs.push(sample(playMorning(createGame(seed), p)));
    report(p.name, xs);
    if (args.includes('--by-week')) for (let w = 1; w <= WEEKS; w++) row('', `week ${w}`, xs.filter((x) => x.week === w));
  }
}

if (mode !== 'morning') {
  console.log(`\n== Full weeks via run.ts (evening cards, fate, mood carry-over), ${RUNS} runs × ${WEEKS} weeks ==`);
  console.log(HEADER);
  for (const p of policies) {
    const xs: Sample[] = [];
    for (let seed = 1; seed <= RUNS; seed++) {
      let run = newRun(seed);
      for (let day = 0; day < WEEKS * 5; day++) {
        const s = playMorning(startMorning(run), p);
        xs.push({ ...sample(s), week: run.week });
        run = finishMorning(run, s);
        if (run.phase === 'weekly') run = choosePerk(run, run.perkOffer[0]);
        if (run.phase === 'evening') run = chooseCards(run, p.evening(run));
      }
    }
    report(p.name, xs);
    if (args.includes('--by-week')) for (let w = 1; w <= WEEKS; w++) row('', `week ${w}`, xs.filter((x) => x.week === w));
  }
}
