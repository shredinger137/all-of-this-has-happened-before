import {
  BASE_DISTRACTION,
  BATHROOM_AFTER_BREAKFAST,
  BATHROOM_AFTER_WAKING,
  CRUNCH_DISTRACTION,
  CRUNCH_MINUTES,
  FOCUS_CAP,
  FOCUS_STEP,
  HUNGRY_AFTER_BREAKFAST,
  HUNGRY_AFTER_WAKING,
  MOOD_EFFECTS,
  MOOD_TAKES,
  LOOK_SETTLES,
  LOOK_SETTLES_LATE,
  ASK_RIGHT,
  HAIR,
  HAIR_CLUE_CHANCE,
  HAIR_WANTS,
  CAR_STUFFY_CHANCE,
  BREAKFAST_CLUE_CHANCE,
  BREAKFAST_CLUE_RIGHT,
  BREAKFAST_ORDER,
  BREAKFASTS,
  TEA_MINUTES,
  TEA_SPEED,
  CALENDAR_RIGHT,
  CHECKLIST,
  COLD_CHANCE,
  COLLAPSE_LEAD,
  COMPOUND_MINUTES,
  ENDGAME_POOL,
  GATE_CLOSES_AFTER,
  EARLY_START_MINUTES,
  EVENT_CHANCE,
  WEEKLY_EVENT_CHANCE,
  WEEKLY_INCIDENT_CHANCE,
  EVENT_POOL,
  EVENTS,
  INCIDENTS,
  JOKES,
  LIBRARY_CHANCE,
  RAIN_CHANCES,
  RAIN_DRIVE_MINUTES,
  ROLL_ORDER,
  TASKS,
  WAVE_WARNING,
  type ResolveCtx,
} from './content';
import {
  COMMUTE_MINUTES,
  DEPARTURE_DEADLINE,
  formatClock,
  IDLE_WAIT_MINUTES,
  NATURAL_WAKE,
  SAFETY_CUTOFF,
  SCHOOL_START,
  START_MINUTE,
  START_MOOD,
} from './constants';
import { nextRandom } from './rng';
import type {
  Action,
  Breakfast,
  Outcome,
  ChildTendency,
  EventId,
  Flag,
  GameState,
  Intel,
  IncidentId,
  Mood,
  MorningCondition,
  Objective,
  OpenIncident,
  PerkId,
  Span,
  TaskId,
} from './types';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const CONDITION_POOL: MorningCondition[] = ['ordinary', 'ordinary', 'lateBedtime', 'shoesByDoor', 'noBread', 'earlyBird'];
const TENDENCY_POOL: ChildTendency[] = ['independent', 'dawdler', 'picky', 'cheerful'];
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

/** What the run hands a morning: yesterday's consequences and last night's preparations. */
export type MorningSetup = {
  weekday?: number; // 0 = Monday; a standalone drill picks Tuesday
  week?: number; // later weeks are busier
  label?: string;
  mood?: Mood; // carried over from yesterday
  fate?: number;
  perks?: PerkId[];
  prepared?: TaskId[]; // done the night before
  readNewsletter?: boolean; // today's event is known from the start
  forceEvent?: EventId | null; // overdue book makes it a library day; null = no event
  notEvent?: EventId; // yesterday's event doesn't repeat
  meeting?: boolean; // the principal wants a word
  earlyBedtime?: boolean; // no late bedtime, and she starts in a better mood
  kettleReady?: boolean;
};

export function createGame(seed: number, setup: MorningSetup = {}): GameState {
  const objectives = {} as Record<TaskId, Objective>;
  for (const id of Object.keys(TASKS) as TaskId[]) {
    objectives[id] = { status: 'todo', progress: 0, extra: 0, rolled: false };
  }
  const weekday = setup.weekday ?? 1;
  const s: GameState = {
    seed,
    rng: seed,
    minute: START_MINUTE,
    departureDeadline: DEPARTURE_DEADLINE,
    wakeMinute: NATURAL_WAKE,
    childAwake: false,
    groggyLevel: 0,
    householdMood: setup.mood ?? START_MOOD,
    kettleReady: !!setup.kettleReady,
    objectives,
    incidents: [],
    firedIncidents: [],
    nextUid: 1,
    flags: [],
    morningCondition: 'ordinary',
    childTendency: 'independent',
    day: {
      label: setup.label ?? WEEKDAYS[weekday],
      weekday,
      weather: 'clear',
      rainChance: 0,
      eventKnown: false,
      weatherKnown: false,
      schoolStart: SCHOOL_START,
      meeting: !!setup.meeting,
    },
    intel: [],
    waves: 0,
    breakfastWant: 'toast',
    hairWant: 'down',
    carStuffyWant: false,
    fate: setup.fate ?? 0,
    perks: setup.perks ?? [],
    week: setup.week ?? 1,
    history: [],
    spans: [],
    ended: false,
  };
  s.morningCondition = CONDITION_POOL[Math.floor(rand(s) * CONDITION_POOL.length)];
  s.childTendency = TENDENCY_POOL[Math.floor(rand(s) * TENDENCY_POOL.length)];
  if (setup.earlyBedtime && s.morningCondition === 'lateBedtime') s.morningCondition = 'ordinary';
  rollDay(s, setup);
  rollPreferences(s);

  if (s.morningCondition === 'earlyBird') s.wakeMinute = NATURAL_WAKE - 5;
  const rackHelps = s.perks.includes('shoeRack') && rand(s) < 0.5;
  if (s.morningCondition === 'shoesByDoor' || rackHelps) {
    s.objectives.shoesFound.status = 'done';
    s.objectives.shoesFound.progress = TASKS.shoesFound.duration(s);
  }
  if (setup.mood === undefined && s.childTendency === 'cheerful') s.householdMood = 4;
  if (setup.earlyBedtime) changeMood(s, 1);

  for (const t of setup.prepared ?? []) {
    s.objectives[t].status = 'done';
    s.objectives[t].progress = TASKS[t].duration(s);
    if (t === 'bagChecked') packedBag(s);
  }

  log(s, "You're awake. She's still asleep.");
  return s;
}

/** Today's weather, school event and the intel you start with. */
function rollDay(s: GameState, setup: MorningSetup) {
  const d = s.day;
  d.rainChance = RAIN_CHANCES[Math.floor(rand(s) * RAIN_CHANCES.length)];
  const rain = rand(s) < d.rainChance;
  const cold = rand(s) < COLD_CHANCE;
  d.weather = rain ? 'rain' : cold ? 'cold' : 'clear';

  if (setup.forceEvent !== undefined) d.event = setup.forceEvent ?? undefined;
  else if (rand(s) < Math.min(0.6, EVENT_CHANCE + WEEKLY_EVENT_CHANCE * (s.week - 1))) {
    const pool = EVENT_POOL.filter((e) => e !== setup.notEvent);
    d.event = pool[Math.floor(rand(s) * pool.length)];
  }
  if (d.meeting) {
    d.schoolStart -= EARLY_START_MINUTES;
    s.departureDeadline -= EARLY_START_MINUTES;
  }
  const earlier = d.event ? (EVENTS[d.event].earlier ?? 0) : 0;
  if (earlier) d.schoolStart = Math.min(d.schoolStart, SCHOOL_START - earlier);

  const temp = d.weather === 'cold' ? '36°F' : rain ? '48°F' : '54°F';
  addIntel(s, 'Forecast', `Rain ${Math.round(d.rainChance * 100)}% · ${temp}`, 'B2');

  if (d.meeting) addIntel(s, 'Letter from school', 'The principal would like a word. Please arrive by 07:50.', 'A1');

  if (setup.forceEvent === 'library') {
    addIntel(s, 'Overdue notice', 'The library book is overdue. It has to go back today.', 'A1', 'library');
    confirmEvent(s);
  } else if (setup.readNewsletter) {
    addIntel(s, 'Newsletter (last night)', d.event ? EVENTS[d.event].email : 'Nothing special on today.', 'A1', d.event ?? 'none');
    confirmEvent(s);
  } else {
    // The fridge calendar is usually right. Usually.
    let claim: EventId | 'none';
    const r = rand(s);
    if (s.perks.includes('calendar')) claim = d.event ?? 'none';
    else if (d.event) claim = r < CALENDAR_RIGHT ? d.event : r < 0.75 ? otherEvent(s, d.event) : 'none';
    else claim = r < 0.75 ? 'none' : otherEvent(s);
    const grade = s.perks.includes('calendar') ? 'A2' : 'C3';
    addIntel(s, 'Fridge calendar', claim === 'none' ? 'Nothing written for today.' : `"${EVENTS[claim].calendar}" scrawled on today.`, grade, claim);
  }
}

/** What she'll want today: breakfast and hair. Hidden, with a clue now and then. */
function rollPreferences(s: GameState) {
  s.breakfastWant = BREAKFAST_ORDER[Math.floor(rand(s) * BREAKFAST_ORDER.length)];
  if (rand(s) < BREAKFAST_CLUE_CHANCE) {
    const said: Breakfast =
      rand(s) < BREAKFAST_CLUE_RIGHT ? s.breakfastWant : BREAKFAST_ORDER.filter((b) => b !== s.breakfastWant)[Math.floor(rand(s) * 3)];
    addIntel(s, 'Last night', `She asked for ${BREAKFASTS[said].name.toLowerCase()} for breakfast.`, 'C3');
  }
  // A different opinion about her hair most days. Sometimes she announced it at bedtime.
  let r = rand(s);
  s.hairWant = HAIR_WANTS.find(([, p]) => (r -= p) < 0)?.[0] ?? 'down';
  if (s.hairWant !== 'down' && rand(s) < HAIR_CLUE_CHANCE) addIntel(s, 'Bedtime', `She wants ${HAIR[s.hairWant].name} tomorrow.`, 'C3');
  s.carStuffyWant = rand(s) < CAR_STUFFY_CHANCE;
}

function otherEvent(s: GameState, not?: EventId): EventId {
  const pool = EVENT_POOL.filter((e) => e !== not);
  return pool[Math.floor(rand(s) * pool.length)];
}

function addIntel(s: GameState, source: string, text: string, grade: string, claims?: Intel['claims']) {
  s.intel.push({ id: s.intel.length + 1, source, text, grade, claims, minute: s.minute });
}

/** Today's event (or the lack of one) is now certain. A trip moves the departure time. */
function confirmEvent(s: GameState) {
  if (s.day.eventKnown) return;
  s.day.eventKnown = true;
  const earlier = s.day.event ? (EVENTS[s.day.event].earlier ?? 0) : 0;
  if (earlier) {
    s.departureDeadline = Math.min(s.departureDeadline, DEPARTURE_DEADLINE - earlier);
    log(s, `${EVENTS[s.day.event!].name} starts early. You need to leave by ${formatClock(s.departureDeadline)}.`, true);
  }
}

/** The bag was packed the night before: notes and books in it are already known. */
function packedBag(s: GameState) {
  const e = s.day.event;
  if (e === 'paperwork') setFlag(s, 'formFound');
  if (e === 'library') setFlag(s, 'bookFound');
  if (e === 'paperwork' || e === 'library') {
    addIntel(s, 'Backpack', bagNote(e), 'A1', e);
    confirmEvent(s);
  }
}

function bagNote(e: EventId): string {
  if (e === 'paperwork') return 'A health form in the bag. Due back today, signed.';
  return 'Library book in the bag, due back today.';
}

/** Events the intel so far points at (or the confirmed one). */
export function suspectedEvents(s: GameState): EventId[] {
  if (s.day.eventKnown) return s.day.event ? [s.day.event] : [];
  const out: EventId[] = [];
  for (const i of s.intel) if (i.claims && i.claims !== 'none' && !out.includes(i.claims)) out.push(i.claims);
  return out;
}

/** Whether a task makes sense to offer today, given what you know. */
export function offered(s: GameState, t: TaskId): boolean {
  const sus = suspectedEvents(s);
  switch (t) {
    case 'coat':
      return s.day.weather === 'cold' || !(s.day.weatherKnown && s.day.weather === 'clear');
    case 'stuffy':
      return sus.includes('stuffy');
    case 'festivalClothes':
      return sus.includes('festival');
    case 'carStuffy':
      return s.carStuffyWant && s.childAwake;
    case 'project':
      return sus.includes('project');
    case 'paperwork':
      return sus.includes('paperwork') || hasFlag(s, 'formFound');
    case 'email':
      return !s.day.eventKnown;
    case 'window':
      return !s.day.weatherKnown;
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function rand(s: GameState): number {
  const [value, next] = nextRandom(s.rng);
  s.rng = next;
  return value;
}

function log(s: GameState, text: string, notable = false) {
  s.history.push({ minute: s.minute, text, notable });
}

// Progress accumulates fractional rates (0.8, 1.15, ...); compare with a tolerance.
const EPS = 1e-6;

function hasFlag(s: GameState, f: Flag) {
  return s.flags.includes(f);
}

function setFlag(s: GameState, f: Flag) {
  if (!s.flags.includes(f)) s.flags.push(f);
}

function changeMood(s: GameState, delta: number) {
  s.householdMood = Math.max(0, Math.min(5, s.householdMood + delta)) as Mood;
}

export function isGroggy(s: GameState): boolean {
  return s.groggyUntil !== undefined && s.minute < s.groggyUntil;
}

export function taskDuration(s: GameState, task: TaskId): number {
  return TASKS[task].duration(s) + s.objectives[task].extra;
}

export function currentIncident(s: GameState): OpenIncident | undefined {
  return s.incidents.find((i) => i.status === 'open');
}

/** Prep is quicker while she sleeps: once she's up, she keeps needing you. */
export function parentRate(s: GameState): number {
  const tea = s.caffeinatedUntil !== undefined && s.minute < s.caffeinatedUntil ? TEA_SPEED : 1;
  return (s.childAwake ? 0.8 : 1) * tea;
}

/** Supervised tasks stall unless you are helping. */
export function childStalled(s: GameState, task: TaskId): boolean {
  return !!TASKS[task].supervised && s.parentActivity !== 'help';
}

export function childRate(s: GameState): number {
  let rate = 1;
  if (isGroggy(s)) rate *= 1 - 0.35 * s.groggyLevel;
  rate *= MOOD_EFFECTS[s.householdMood].speed;
  if (s.childTendency === 'independent') rate *= 1.07;
  if (s.perks.includes('chart')) rate *= 1.1;
  if (s.parentActivity === 'help') rate *= 1.5;
  return rate;
}

function incidentModifier(s: GameState): number {
  let m = Math.min(0.12, WEEKLY_INCIDENT_CHANCE * (s.week - 1));
  if (isGroggy(s)) m += 0.35 * s.groggyLevel;
  m += MOOD_EFFECTS[s.householdMood].trouble;
  m += BASE_DISTRACTION + Math.min(FOCUS_CAP, FOCUS_STEP * (s.focus ?? 0));
  const crunch = (s.minute - (s.departureDeadline - CRUNCH_MINUTES)) / CRUNCH_MINUTES;
  m += CRUNCH_DISTRACTION * Math.max(0, Math.min(1, crunch));
  return m;
}

/** Chance a risky response backfires right now. Shown to the player as a band. */
export function escalationChance(s: GameState, base = 0.4): number {
  let chance = base;
  if (isGroggy(s)) chance += 0.3 * s.groggyLevel;
  chance += MOOD_EFFECTS[s.householdMood].backfire;
  return Math.max(0, Math.min(1, chance));
}

/** How early a wake-up would be right now: 0 = natural, 1 = as early as possible. */
export function earliness(s: GameState): number {
  const window = s.wakeMinute - START_MINUTE;
  return Math.max(0, Math.min(1, (s.wakeMinute - s.minute) / window));
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

function wake(s: GameState, natural: boolean) {
  s.childAwake = true;
  s.wokenAt = s.minute;
  s.bathroomAt = s.minute + BATHROOM_AFTER_WAKING;
  s.hungryAt = s.minute + HUNGRY_AFTER_WAKING;
  if (s.carStuffyWant) log(s, 'First thing she says: a stuffy has to come in the car today.', true);
  if (natural) {
    if (s.morningCondition === 'lateBedtime') {
      s.groggyLevel = 0.4;
      s.groggyUntil = s.minute + 15;
      log(s, "She's awake, but tired after a late night.", true);
    } else {
      log(s, "She's awake.");
    }
    return;
  }
  const e = earliness(s);
  s.groggyLevel = 0.4 + 0.6 * e;
  s.groggyUntil = s.minute + 15 + Math.round(20 * e);
  // Waking her well before she's ready costs more than speed: she starts the day cross.
  if (e > 0.4) changeMood(s, -1);
  log(s, e > 0.5 ? 'You woke her early. She is very tired, and not happy about it.' : 'You woke her a little early.', true);
}

function openIncident(s: GameState, id: IncidentId, task?: TaskId, front = false) {
  const inc: OpenIncident = { uid: s.nextUid++, id, task, minute: s.minute, status: 'open' };
  if (id === 'joke') {
    inc.joke = Math.floor(rand(s) * JOKES.length);
    inc.stage = 0;
    inc.note = JOKES[inc.joke].lines[0].her;
  }
  if (front) s.incidents.unshift(inc);
  else s.incidents.push(inc);
  if (!s.firedIncidents.includes(id)) s.firedIncidents.push(id);
  if (s.parentActivity === 'help') s.parentActivity = undefined;
  log(s, INCIDENTS[id].headline(s), true);
}

function removeIncident(s: GameState, uid: number) {
  s.incidents = s.incidents.filter((i) => i.uid !== uid);
}

function unblock(s: GameState, task?: TaskId) {
  if (!task) return;
  const o = s.objectives[task];
  if (o.status === 'blocked') o.status = s.childActivity === task || s.parentActivity === task ? 'active' : 'todo';
}

function completeTask(s: GameState, task: TaskId) {
  const o = s.objectives[task];
  o.status = 'done';
  o.progress = taskDuration(s, task);
  o.pending = undefined;
  if (s.childActivity === task) {
    s.childActivity = undefined;
    if (s.parentActivity === 'help') s.parentActivity = undefined;
  }
  if (s.parentActivity === task) s.parentActivity = undefined;

  if (task === 'coat' && s.day.weather !== 'cold') setFlag(s, 'wellies');
  if (task === 'tea') s.caffeinatedUntil = s.minute + TEA_MINUTES;
  // Festival clothes are getting dressed, as far as anyone at school is concerned.
  if (task === 'festivalClothes' && s.objectives.dressed.status !== 'done') {
    if (s.childActivity === 'dressed') s.childActivity = undefined;
    s.objectives.dressed.status = 'done';
    s.objectives.dressed.pending = undefined;
  }
  if (task === 'shoesFound') {
    // Finding the shoes settles a deferred "missing shoes" problem.
    for (const inc of s.incidents.filter((i) => i.id === 'shoesMissing')) {
      removeIncident(s, inc.uid);
      unblock(s, inc.task);
    }
  }
}

function skipTask(s: GameState, task: TaskId) {
  const o = s.objectives[task];
  o.status = 'skipped';
  o.pending = undefined;
  if (s.childActivity === task) {
    s.childActivity = undefined;
    if (s.parentActivity === 'help') s.parentActivity = undefined;
  }
}

/** Decide once, when a child task starts, whether (and where) it will be interrupted. */
function rollIncident(s: GameState, task: TaskId) {
  const o = s.objectives[task];
  if (o.rolled) return;
  o.rolled = true;
  const dur = taskDuration(s, task);
  for (const id of ROLL_ORDER) {
    const def = INCIDENTS[id];
    if (!def.tasks?.includes(task) || s.firedIncidents.includes(id)) continue;
    // A chance of exactly 0 means it can't happen today (a perk, the wrong breakfast, the wrong mood).
    const base = def.chance?.(s) ?? 0;
    if (base === 0) continue;
    const p = Math.max(0, Math.min(0.9, base + (def.external ? 0 : incidentModifier(s))));
    if (rand(s) < p) {
      const lo = Math.max(o.progress + 0.5, 1);
      const hi = Math.max(lo, dur - 1);
      o.pending = { incidentId: id, at: lo + rand(s) * (hi - lo) };
      s.firedIncidents.push(id); // reserve it so it can't happen twice
      return;
    }
  }
}

function onParentComplete(s: GameState, task: TaskId) {
  if (!TASKS[task].intel) log(s, `${TASKS[task].label}.`);
  const e = s.day.event;
  switch (task) {
    case 'bagChecked':
      if (e === 'paperwork') {
        setFlag(s, 'formFound');
        addIntel(s, 'Backpack', bagNote('paperwork'), 'A1', 'paperwork');
        confirmEvent(s);
      } else if (e === 'library') {
        if (hasFlag(s, 'bookFound')) log(s, 'Library book back in the bag.');
        else if (rand(s) < LIBRARY_CHANCE) {
          addIntel(s, 'Backpack', 'A library reminder in the bag. No book.', 'A1', 'library');
          confirmEvent(s);
          openIncident(s, 'library');
        } else {
          setFlag(s, 'bookFound');
          addIntel(s, 'Backpack', bagNote('library'), 'A1', 'library');
          confirmEvent(s);
        }
      } else log(s, 'Nothing unusual in the bag.');
      break;
    case 'paperwork':
      setFlag(s, 'formFound');
      break;
    case 'email':
      addIntel(s, 'School email', e ? EVENTS[e].email : 'Nothing special on today.', 'A1', e ?? 'none');
      confirmEvent(s);
      log(s, e ? `School email: ${EVENTS[e].name.toLowerCase()}.` : 'School email: nothing special today.', true);
      break;
    case 'window': {
      // The window shows now, not 07:45. Later looks are more likely to settle it.
      const d = s.day;
      const late = Math.max(0, Math.min(1, (s.minute - START_MINUTE) / (s.departureDeadline - START_MINUTE)));
      if (d.weather === 'cold' || rand(s) < LOOK_SETTLES + LOOK_SETTLES_LATE * late) {
        d.weatherKnown = true;
        d.lookedOutside = undefined;
        const w = d.weather === 'rain' ? 'Raining.' : d.weather === 'cold' ? 'Dry, and cold.' : 'Clear sky. It will stay dry.';
        addIntel(s, 'Out of the window', w, 'A1');
        log(s, `You looked outside. ${w}`, true);
      } else {
        // The same gray sky whether or not it's coming: you can look again later.
        const w = 'Gray, and dry for now. Clouds to the west.';
        d.lookedOutside = `${formatClock(s.minute)}: dry for now`;
        addIntel(s, 'Out of the window', w, 'B3');
        log(s, `You looked outside. ${w}`, true);
        const o = s.objectives.window;
        o.status = 'todo';
        o.progress = 0;
      }
      break;
    }
  }
}

/** Extend the current span for a lane, or start a new one. */
function record(s: GameState, lane: Span['lane'], kind: Span['kind'] | undefined, task: TaskId | undefined, start: number) {
  if (!kind) return;
  const last = [...s.spans].reverse().find((sp) => sp.lane === lane);
  if (last && last.end === start && last.kind === kind && last.task === task) last.end = start + 1;
  else s.spans.push({ lane, kind, task, start, end: start + 1 });
}

/** What each lane is doing during the coming minute. */
function laneState(s: GameState, engaged: { parent: boolean; child: boolean }) {
  const pa = s.parentActivity;
  const parent: [Span['kind'] | undefined, TaskId | undefined] = engaged.parent
    ? ['incident', undefined]
    : pa === 'help'
      ? ['help', s.childActivity]
      : pa
        ? ['task', pa]
        : [undefined, undefined];
  const ca = s.childActivity;
  let child: [Span['kind'] | undefined, TaskId | undefined] = [undefined, undefined];
  if (s.childAwake) {
    if (engaged.child) child = ['incident', undefined];
    else if (ca && s.objectives[ca].status === 'blocked') child = ['blocked', ca];
    else if (ca && s.objectives[ca].status === 'active' && !childStalled(s, ca)) child = ['task', ca];
  }
  return { parent, child };
}

/**
 * Advance one simulated minute. Returns true if something happened that the
 * player should look at. `engaged` marks who is tied up resolving an incident.
 */
function tick(s: GameState, engaged: { parent: boolean; child: boolean; door?: boolean }): boolean {
  const lanes = laneState(s, engaged);
  record(s, 'parent', lanes.parent[0], lanes.parent[1], s.minute);
  record(s, 'child', lanes.child[0], lanes.child[1], s.minute);
  s.minute += 1;
  let event = false;

  if (!s.childAwake && s.minute >= s.wakeMinute) {
    wake(s, true);
    event = true;
  }

  const pa = s.parentActivity;
  if (!engaged.parent && pa && pa !== 'help' && s.objectives[pa].status === 'active') {
    const o = s.objectives[pa];
    o.progress += parentRate(s);
    if (o.pending && o.progress >= o.pending.at - EPS) {
      // The phone, the door: the outside world interrupts you, not her.
      o.progress = o.pending.at;
      const id = o.pending.incidentId;
      o.pending = undefined;
      o.status = 'blocked';
      openIncident(s, id, pa);
      event = true;
    } else if (o.progress >= taskDuration(s, pa) - EPS) {
      completeTask(s, pa);
      onParentComplete(s, pa);
      event = true;
    }
  }

  const ca = s.childActivity;
  if (!engaged.child && s.childAwake && ca && s.objectives[ca].status === 'active' && !childStalled(s, ca)) {
    const o = s.objectives[ca];
    o.progress += childRate(s);
    if (o.pending && o.progress >= o.pending.at - EPS) {
      o.progress = o.pending.at;
      const id = o.pending.incidentId;
      o.pending = undefined;
      o.status = 'blocked';
      s.focus = 0;
      openIncident(s, id, ca);
      event = true;
    } else if (o.progress >= taskDuration(s, ca) - EPS) {
      completeTask(s, ca);
      log(s, `${TASKS[ca].label}.`);
      s.focus = (s.focus ?? 0) + 1;
      if (s.focus === 2) log(s, 'She has been on task for a while.');
      if (ca === 'breakfastEaten') {
        s.bathroomAt = s.minute + BATHROOM_AFTER_BREAKFAST[0] + Math.round(rand(s) * (BATHROOM_AFTER_BREAKFAST[1] - BATHROOM_AFTER_BREAKFAST[0]));
        s.hungryAt = s.minute + HUNGRY_AFTER_BREAKFAST;
      }
      event = true;
    }
  }

  // The bathroom and hunger come due on their own schedule, once each, while nothing else is open.
  if (!engaged.door && s.childAwake && !s.ended && !s.incidents.some((i) => i.status === 'open')) {
    const need: IncidentId | undefined =
      s.bathroomAt !== undefined && s.minute >= s.bathroomAt && !s.firedIncidents.includes('bathroom')
        ? 'bathroom'
        : s.hungryAt !== undefined && s.minute >= s.hungryAt && !s.firedIncidents.includes('hungryAgain')
          ? 'hungryAgain'
          : undefined;
    if (need) {
      const c = s.childActivity;
      if (c && s.objectives[c].status === 'active') s.objectives[c].status = 'blocked';
      s.firedIncidents.push(need);
      s.focus = 0;
      openIncident(s, need, c && s.objectives[c].status === 'blocked' ? c : undefined);
      event = true;
    }
  }

  // The endgame. A wave is announced, then lands: each contact becomes a problem to deal with.
  if (engaged.door) {
    // Coats on, at the door: the house can't reach you now.
  } else if (s.wave && s.minute >= s.wave.at) {
    landWave(s);
    event = true;
  } else if (!s.wave && s.childAwake && !s.ended && s.minute >= collapseStart(s) && s.minute >= (s.nextWaveAt ?? 0)) {
    const size = Math.min(3, 1 + s.waves);
    s.wave = { at: s.minute + WAVE_WARNING, size, announced: s.minute };
    log(s, `${size === 1 ? 'A crisis is' : `${size} crises are`} on the way. About ${WAVE_WARNING} minutes.`, true);
    event = true;
  }

  // Problems put off too long come back, worse.
  for (const inc of s.incidents) {
    if (inc.status !== 'deferred' || inc.worse || inc.deferredAt === undefined) continue;
    if (s.minute - inc.deferredAt < COMPOUND_MINUTES) continue;
    inc.worse = true;
    inc.status = 'open';
    inc.note = INCIDENTS[inc.id].worse ?? "It hasn't gone away.";
    changeMood(s, -1);
    log(s, `${INCIDENTS[inc.id].title}: it's back, and worse.`, true);
    event = true;
  }

  if (!hasFlag(s, 'deadlinePassed') && s.minute >= s.departureDeadline) {
    setFlag(s, 'deadlinePassed');
    log(s, `It's ${formatClock(s.departureDeadline)}. Time to leave.`, true);
    event = true;
  }
  return event;
}

/** Minutes the shoes would take at the door, if you left now. */
export function shoesAtDoorMinutes(s: GameState): number {
  if (!s.childAwake || s.objectives.shoesOn.status === 'done') return 0;
  const find = s.objectives.shoesFound.status === 'done' ? 0 : TASKS.shoesFound.duration(s);
  const on = Math.ceil((taskDuration(s, 'shoesOn') - s.objectives.shoesOn.progress) / childRate({ ...s, parentActivity: 'help' }));
  return find + Math.max(1, on);
}

/** If you left this minute: when you'd arrive and how early (+) or late (−), using only what you know. */
export function leaveNowProjection(s: GameState): { arrive: number; spare: number; gateShut: boolean } {
  const d = s.day;
  const walk = COMMUTE_MINUTES + (d.weatherKnown && d.weather === 'rain' ? RAIN_DRIVE_MINUTES : 0);
  const early = d.eventKnown && d.event && EVENTS[d.event].earlier;
  const start = d.meeting || early ? d.schoolStart : SCHOOL_START;
  const arrive = s.minute + walk + shoesAtDoorMinutes(s);
  return { arrive, spare: start - arrive, gateShut: start - arrive < -GATE_CLOSES_AFTER };
}

export function nothingRunning(s: GameState): boolean {
  const parentBusy = s.parentActivity !== undefined && s.parentActivity !== 'help';
  const ca = s.childActivity;
  const childBusy = s.childAwake && ca !== undefined && s.objectives[ca].status === 'active' && !childStalled(s, ca);
  return !parentBusy && !childBusy;
}

/** Run the clock to the next meaningful event. */
function advance(s: GameState) {
  const idle = nothingRunning(s) && s.childAwake;
  let n = 0;
  while (s.minute < SAFETY_CUTOFF) {
    const event = tick(s, { parent: false, child: false });
    n++;
    if (event || currentIncident(s)) break;
    if (idle && n >= IDLE_WAIT_MINUTES) break;
  }
  checkCutoff(s);
}

/** Spend minutes on an incident response; other work continues around it. */
function spend(s: GameState, minutes: number, both: boolean, door = false) {
  for (let i = 0; i < minutes && s.minute < SAFETY_CUTOFF; i++) {
    tick(s, { parent: true, child: both, door });
  }
}

function checkCutoff(s: GameState) {
  if (!s.ended && s.minute >= SAFETY_CUTOFF) {
    log(s, 'You give up on the rest and leave.', true);
    endMorning(s);
  }
}

/**
 * When the house starts sending contacts: ten minutes before leaving time, sooner if problems
 * have been put off or she's already upset.
 */
export function collapseStart(s: GameState): number {
  const deferred = s.incidents.filter((i) => i.status === 'deferred').length;
  return s.departureDeadline - COLLAPSE_LEAD - 2 * deferred - MOOD_EFFECTS[s.householdMood].collapse;
}

/** Something finished comes undone: back on the list, without a second incident on top. */
function reopenTask(s: GameState, t: TaskId) {
  const o = s.objectives[t];
  o.status = 'todo';
  o.progress = 0;
  o.pending = undefined;
  o.rolled = true;
}

/** A wave lands: up to `size` contacts, each one something it can undo, each once per morning. */
function landWave(s: GameState) {
  const wave = s.wave!;
  s.wave = undefined;
  s.waves += 1;
  s.nextWaveAt = s.minute + Math.max(2, 6 - 2 * s.waves); // closer together each time
  let pool = ENDGAME_POOL.filter((id) => !s.firedIncidents.includes(id) && (INCIDENTS[id].endgame?.(s) ?? true));
  if (!pool.length && INCIDENTS.wobble.endgame!(s)) pool = ['wobble'];
  if (!pool.length) {
    log(s, 'The crisis passed without doing any damage.', true);
    return;
  }
  for (let i = 0; i < wave.size && pool.length; i++) {
    const id = pool.splice(Math.floor(rand(s) * pool.length), 1)[0];
    openIncident(s, id);
  }
}

/** Nobody goes to school barefoot: shoes not on yet go on at the door, on your time. */
function shoesAtTheDoor(s: GameState) {
  if (s.objectives.shoesOn.status === 'done') return;
  s.parentActivity = undefined;
  s.childActivity = undefined;
  if (s.objectives.shoesFound.status !== 'done') {
    log(s, 'Hunting for her shoes at the door.', true);
    spend(s, TASKS.shoesFound.duration(s), true, true);
    completeTask(s, 'shoesFound');
  }
  const o = s.objectives.shoesOn;
  const minutes = Math.max(1, Math.ceil((taskDuration(s, 'shoesOn') - o.progress) / childRate({ ...s, parentActivity: 'help' })));
  log(s, 'Shoes on at the door.', true);
  spend(s, minutes, true, true);
  completeTask(s, 'shoesOn');
}

function endMorning(s: GameState) {
  s.ended = true; // a wave still inbound never lands: you left
  s.departedAt = s.minute;
  s.parentActivity = undefined;
  s.childActivity = undefined;
  log(s, 'Everyone left the house.', true);
}

const FLAG_RESULT: Partial<Record<Flag, [string, boolean]>> = {
  stainedShirt: ['Top stained', false],
  messyKitchen: ['Kitchen left as it is', false],
  noSocks: ['No socks', false],
  wellies: ['Rain boots', false],
  hungry: ['She will be hungry later', false],
  stuffyDamp: ['Damp stuffy', false],
  bookFound: ['Library book found', true],
  bookLeft: ['Library book stays home', false],
  promisedDress: ['A promise: the yellow dress', true],
  promisedBug: ['A promise: the bug, after school', true],
  promisedBraids: ['A promise: braids on Saturday', true],
};

/** The result of a choice, from what actually changed: shown before the next thing happens. */
function outcomeOf(a: GameState, b: GameState, title: string, choice: string): Outcome {
  const costs: string[] = [];
  let good = true;
  const minutes = b.minute - a.minute;
  costs.push(minutes > 0 ? `${minutes} min` : 'No time');
  const mood = b.householdMood - a.householdMood;
  if (mood > 0) costs.push('Mood ↑');
  if (mood < 0) {
    costs.push('Mood ↓');
    good = false;
  }
  if (b.fate < a.fate) costs.push('Fate point spent');
  for (const f of b.flags) {
    if (a.flags.includes(f) || !FLAG_RESULT[f]) continue;
    const [text, ok] = FLAG_RESULT[f]!;
    costs.push(text);
    if (!ok) good = false;
  }
  for (const t of Object.keys(b.objectives) as TaskId[]) {
    const from = a.objectives[t].status;
    const to = b.objectives[t].status;
    if (from === to) continue;
    if (to === 'done') costs.push(`${TASKS[t].label} ✓`);
    else if (to === 'skipped') {
      costs.push(`${TASKS[t].label}: skipped`);
      good = false;
    } else if (from === 'done') {
      costs.push(`${TASKS[t].label}: undone`);
      good = false;
    }
  }
  const extra = (Object.keys(b.objectives) as TaskId[]).reduce((n, t) => n + b.objectives[t].extra - a.objectives[t].extra, 0);
  if (extra > 0) costs.push(`+${extra} min later`);
  if (b.incidents.some((i) => i.id === 'upset' && !a.incidents.some((x) => x.uid === i.uid))) good = false;
  const lines = b.history.slice(a.history.length).map((h) => h.text);
  return { title, choice, lines, costs, good };
}

// ---------------------------------------------------------------------------
// Availability (shared by reducer guards and UI)
// ---------------------------------------------------------------------------

export function parentTaskBlocker(s: GameState, task: TaskId): string | undefined {
  const st = s.objectives[task].status;
  if (st === 'done' || st === 'skipped') return 'Done';
  return TASKS[task].unavailable?.(s);
}

export function childTaskBlocker(s: GameState, task: TaskId): string | undefined {
  if (!s.childAwake) return 'Asleep';
  const st = s.objectives[task].status;
  if (st === 'done') return 'Done';
  if (st === 'skipped') return 'Skipped';
  if (st === 'blocked') return 'Waiting on you';
  if (s.childActivity === task) return 'Doing it';
  // Clothes first: no coat over pajamas, no shoes before trousers.
  if ((task === 'coat' || task === 'shoesOn') && s.objectives.dressed.status !== 'done') return 'Dressed first';
  return undefined;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function reduce(prev: GameState, action: Action): GameState {
  if (prev.ended) return prev;
  const s = structuredClone(prev);
  const open = currentIncident(s);
  if (action.type !== 'respond') s.outcome = undefined;

  switch (action.type) {
    case 'ack':
      return prev.outcome ? s : prev;

    case 'startParent': {
      const { task } = action;
      if (open || TASKS[task].owner !== 'parent' || !offered(s, task) || parentTaskBlocker(s, task)) return prev;
      const was = s.parentActivity;
      if (was && was !== 'help' && was !== task) s.objectives[was].status = 'todo';
      if (task === 'breakfastMade') {
        // Changing your mind about breakfast starts it again.
        const variant = action.variant ?? s.breakfastChoice ?? 'toast';
        if (s.breakfastChoice && s.breakfastChoice !== variant) s.objectives.breakfastMade.progress = 0;
        s.breakfastChoice = variant;
      }
      s.parentActivity = task;
      s.objectives[task].status = 'active';
      if (s.childAwake) rollIncident(s, task);
      advance(s);
      return s;
    }

    case 'askBreakfast': {
      // Ask her what she wants. Once she's up, she knows. Today.
      if (open || !s.childAwake || hasFlag(s, 'askedBreakfast')) return prev;
      setFlag(s, 'askedBreakfast');
      spend(s, 1, true);
      const want = BREAKFASTS[s.breakfastWant].name.toLowerCase();
      addIntel(s, 'Her, at breakfast time', `"${want[0].toUpperCase()}${want.slice(1)}. Definitely ${want}."`, 'A2');
      log(s, `You asked her about breakfast. ${BREAKFASTS[s.breakfastWant].name}.`);
      checkCutoff(s);
      return s;
    }

    case 'help': {
      const ca = s.childActivity;
      if (open || !ca || s.objectives[ca].status !== 'active') return prev;
      const was = s.parentActivity;
      if (was && was !== 'help') s.objectives[was].status = 'todo';
      s.parentActivity = 'help';
      advance(s);
      return s;
    }

    case 'assignChild': {
      const { task } = action;
      if (open || TASKS[task].owner !== 'child' || !offered(s, task) || childTaskBlocker(s, task)) return prev;
      const was = s.childActivity;
      if (was && s.objectives[was].status === 'active') s.objectives[was].status = 'todo';
      if (s.parentActivity === 'help') s.parentActivity = undefined;
      s.childActivity = task;

      if (task === 'shoesOn' && s.objectives.shoesFound.status !== 'done') {
        s.objectives.shoesOn.status = 'blocked';
        openIncident(s, 'shoesMissing', 'shoesOn');
        return s;
      }
      if (hasFlag(s, 'sulking')) {
        s.objectives[task].status = 'blocked';
        openIncident(s, 'closedDoor', task);
        return s;
      }
      const made = s.objectives.breakfastMade.status === 'done';
      if (task === 'breakfastEaten' && made && s.breakfastChoice !== s.breakfastWant && !s.firedIncidents.includes('wrongBreakfast')) {
        s.objectives.breakfastEaten.status = 'blocked';
        openIncident(s, 'wrongBreakfast', 'breakfastEaten');
        return s;
      }
      if (task === 'hair' && s.hairWant !== 'down' && !s.firedIncidents.includes('hairdo')) {
        s.objectives.hair.status = 'blocked';
        openIncident(s, 'hairdo', 'hair');
        return s;
      }
      s.objectives[task].status = 'active';
      // How she takes it shows her mood. Picked without the RNG so it doesn't shift the morning.
      const takes = MOOD_TAKES[s.householdMood];
      if (takes.length) log(s, `${TASKS[task].doing}. ${takes[(s.minute + task.length) % takes.length]}`);
      rollIncident(s, task);
      if (TASKS[task].supervised) {
        // Supervised tasks take you too, so they run the clock like a parent task.
        const pa = s.parentActivity;
        if (pa) s.objectives[pa].status = 'todo';
        s.parentActivity = 'help';
        advance(s);
      }
      return s; // otherwise assigning is free; the clock stays paused
    }

    case 'wakeNow': {
      if (s.childAwake || open) return prev;
      wake(s, false);
      return s;
    }

    case 'wait': {
      if (open) return prev;
      advance(s);
      return s;
    }

    case 'respond': {
      if (!open) return prev;
      const def = INCIDENTS[open.id];
      const resp = def.responses.find((r) => r.id === action.response);
      if (!resp || (resp.available && !resp.available(s, open))) return prev;

      // Fate: a risky call that is certain to go your way.
      const charmed = !!action.fate && !!resp.risky && s.fate > 0;
      if (action.fate && !charmed) return prev;
      const before = structuredClone(s);
      if (charmed) {
        s.fate -= 1;
        log(s, 'You spent a fate point. This one goes your way.', true);
      }
      spend(s, resp.minutesFor?.(s) ?? resp.minutes, !!resp.both);
      let kept: string | undefined;
      let later = false;
      const ctx: ResolveCtx = {
        s,
        incident: open,
        roll: () => rand(s),
        log: (text, notable) => log(s, text, notable),
        mood: (d) => changeMood(s, d),
        flag: (f) => setFlag(s, f),
        escalate: ({ base = resp.riskBase ?? 0.4, extra = 3 } = {}) => {
          if (charmed || rand(s) >= escalationChance(s, base)) return false;
          // It went badly, and that's a problem of its own.
          changeMood(s, -1);
          if (open.task) s.objectives[open.task].extra += extra;
          log(s, 'She got upset.', true);
          if (!s.incidents.some((i) => i.id === 'upset' && i.status === 'open')) openIncident(s, 'upset', undefined, true);
          return true;
        },
        addExtra: (m) => {
          if (open.task) s.objectives[open.task].extra += m;
        },
        completeTask: (t) => completeTask(s, t),
        skipTask: (t) => skipTask(s, t),
        keepOpen: (note) => {
          kept = note;
        },
        spend: (m) => spend(s, m, !!resp.both),
        reopen: (task) => reopenTask(s, task),
        followUp: (id) => openIncident(s, id, undefined, true),
        later: () => {
          later = true;
        },
        learnEvent: (source) => {
          const e = s.day.event;
          addIntel(s, source, e ? EVENTS[e].email : 'Nothing special on today.', 'A2', e ?? 'none');
          confirmEvent(s);
          log(s, e ? `The group chat settles it: ${EVENTS[e].name.toLowerCase()}.` : 'The group chat settles it: nothing special today.', true);
        },
        unflag: (f) => {
          s.flags = s.flags.filter((x) => x !== f);
        },
      };
      resp.apply(ctx);

      if (kept !== undefined) {
        const inc = s.incidents.find((i) => i.uid === open.uid);
        if (inc) inc.note = kept;
      } else if (later) {
        const inc = s.incidents.find((i) => i.uid === open.uid)!;
        inc.status = 'deferred';
        inc.deferredAt = s.minute;
        unblock(s, open.task);
      } else {
        removeIncident(s, open.uid);
        unblock(s, open.task);
      }
      if (kept === undefined) s.outcome = outcomeOf(before, s, def.title, resp.labelFor?.(before, open) ?? resp.label);
      checkCutoff(s);
      return s;
    }

    case 'defer': {
      if (!open || !INCIDENTS[open.id].deferrable) return prev;
      const inc = s.incidents.find((i) => i.uid === open.uid)!;
      inc.status = 'deferred';
      inc.deferredAt = s.minute;
      if (inc.task && s.childActivity === inc.task) s.childActivity = undefined;
      log(s, `${INCIDENTS[inc.id].title}: put off for now.`);
      return s;
    }

    case 'reopen': {
      if (open) return prev;
      const inc = s.incidents.find((i) => i.uid === action.uid);
      if (!inc) return prev;
      inc.status = 'open';
      return s;
    }

    case 'ask': {
      // Ask her what's on today. She'll answer with total confidence.
      if (open || !s.childAwake || s.day.eventKnown || hasFlag(s, 'askedHer')) return prev;
      setFlag(s, 'askedHer');
      spend(s, 1, true);
      const truth = s.day.event;
      const claim: EventId | 'none' = rand(s) < ASK_RIGHT ? (truth ?? 'none') : rand(s) < 0.5 ? 'none' : otherEvent(s, truth);
      const said = claim === 'none' ? 'Nothing. Just school.' : EVENTS[claim].ask;
      addIntel(s, 'Her', `"${said}"`, 'E5', claim);
      log(s, `You asked her about today. "${said}"`);
      checkCutoff(s);
      return s;
    }

    case 'favor': {
      // Message another parent. Costs a fate point, not minutes.
      if (open || s.day.eventKnown || s.fate <= 0) return prev;
      s.fate -= 1;
      const e = s.day.event;
      addIntel(s, 'Another parent', e ? EVENTS[e].email : 'Nothing on today, as far as they know.', 'A2', e ?? 'none');
      confirmEvent(s);
      log(s, 'You messaged another parent. Fate point spent.', true);
      return s;
    }

    case 'leave': {
      // Leaving is final. Whatever is still open stays behind, unresolved.
      if (!s.childAwake) return prev;
      if (open) open.status = 'deferred';
      shoesAtTheDoor(s);
      endMorning(s);
      return s;
    }
  }
}

// ---------------------------------------------------------------------------
// Debrief
// ---------------------------------------------------------------------------

export type Severity = 'minor' | 'moderate' | 'severe';
export const SEVERITY_COST: Record<Severity, number> = { minor: 5, moderate: 10, severe: 20 };

/** Something today needs. `known` is false while the intel hasn't confirmed it. */
export type Requirement = { id: string; label: string; missing: string; severity: Severity; met: boolean; known: boolean };

const BASE_SEVERITY: Partial<Record<TaskId, Severity>> = {
  parentReady: 'minor',
  lunch: 'minor', // she can buy lunch
  bagChecked: 'minor',
  breakfastEaten: 'moderate',
  dressed: 'severe',
  teeth: 'minor',
  face: 'minor',
  hair: 'minor',
  shoesOn: 'severe',
};

export function requirements(s: GameState): Requirement[] {
  const d = s.day;
  const isDone = (t: TaskId) => s.objectives[t].status === 'done';
  const picture = d.event === 'picture';
  const reqs: Requirement[] = CHECKLIST.map((t) => ({
    id: t,
    label: TASKS[t].label,
    missing: TASKS[t].missing,
    severity: t === 'hair' && picture ? 'severe' : BASE_SEVERITY[t] ?? 'minor',
    met: isDone(t),
    known: t !== 'hair' || !picture || d.eventKnown,
  }));

  if (s.carStuffyWant) {
    reqs.push({
      id: 'carStuffy',
      label: 'Car stuffy',
      missing: 'A stuffy for the car',
      severity: 'minor',
      met: isDone('carStuffy') || isDone('stuffy'),
      known: s.childAwake,
    });
  }

  if (d.weather !== 'clear') {
    reqs.push({
      id: 'coat',
      label: d.weather === 'rain' ? 'Rain gear on' : 'Coat on',
      missing: d.weather === 'rain' ? 'Rain gear (she got soaked between the car and the door)' : 'Her coat (it was cold)',
      severity: 'moderate',
      met: isDone('coat'),
      known: d.weather === 'cold' || d.weatherKnown,
    });
  }

  const e = d.event;
  if (e) {
    const ev = EVENTS[e];
    const met =
      e === 'library'
        ? hasFlag(s, 'bookFound')
        : e === 'picture' || e === 'assembly'
          ? !hasFlag(s, 'stainedShirt')
          : isDone(ev.task!);
    const severity = e === 'assembly' ? 'moderate' : 'severe';
    reqs.push({ id: `event:${e}`, label: ev.name, missing: ev.missing, severity, met, known: d.eventKnown });
  }

  // Loose ends from how things went.
  const extra = (id: string, missing: string, severity: Severity = 'minor') =>
    reqs.push({ id, label: missing, missing, severity, met: false, known: true });
  if (hasFlag(s, 'noSocks')) extra('noSocks', 'Socks');
  if (hasFlag(s, 'wellies') && d.weather !== 'rain') extra('wellies', 'Real shoes');
  if (hasFlag(s, 'stainedShirt') && d.event !== 'picture' && d.event !== 'assembly') extra('stainedShirt', 'A clean top');
  if (hasFlag(s, 'messyKitchen')) extra('messyKitchen', 'A clean kitchen');
  if (hasFlag(s, 'stuffyDamp')) extra('stuffyDamp', 'A dry stuffy');
  if (s.householdMood <= 1) extra('mood', 'A peaceful morning', 'moderate');
  if (hasFlag(s, 'hungry') && s.objectives.breakfastEaten.status === 'done') extra('hungry', 'A breakfast that lasted', 'minor');
  return reqs;
}

export type Results = {
  departed: number;
  arrived: number;
  lateness: number; // minutes after school start; negative = early
  completed: string[];
  leftBehind: string[];
  misses: Requirement[];
  severeMisses: number;
  mood: Mood;
  notes: { minute: number; text: string }[];
  revealed: string[]; // what the day turned out to be
  score: number;
  grade: string;
  summary: string;
};

export function results(s: GameState): Results {
  const d = s.day;
  const departed = s.departedAt ?? s.minute;
  const arrived = departed + COMMUTE_MINUTES + (d.weather === 'rain' ? RAIN_DRIVE_MINUTES : 0);
  const lateness = arrived - d.schoolStart;

  const reqs = requirements(s);
  if (lateness > GATE_CLOSES_AFTER) {
    reqs.push({ id: 'gate', label: 'Tardy', missing: 'On time for class (signed in tardy)', severity: 'severe', met: false, known: true });
  }
  const completed = reqs.filter((r) => r.met).map((r) => r.label);
  const misses = reqs.filter((r) => !r.met);
  const leftBehind = misses.map((r) => r.missing);
  const severeMisses = misses.filter((r) => r.severity === 'severe').length;

  const late = Math.max(0, lateness);
  const cost = misses.reduce((n, r) => n + SEVERITY_COST[r.severity], 0);
  const raw = 100 - 4 * late - cost + 4 * (s.householdMood - 3);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const grade = score >= 90 ? 'Made it' : score >= 70 ? 'Got there' : score >= 45 ? 'Hectic' : 'Hard morning';

  const notes = s.history.filter((h) => h.notable).slice(-5);

  const revealed: string[] = [];
  if (d.event) revealed.push(`${EVENTS[d.event].reveal}${d.eventKnown ? '' : ' You never confirmed it.'}`);
  else if (!d.eventKnown) revealed.push('Nothing special on at school, as it turned out.');
  if (d.weather === 'rain') revealed.push('It rained, and traffic was slow.');
  if (d.meeting) revealed.push('The principal was waiting at 07:50.');
  if (s.wave) revealed.push(`You got out ${s.wave.at - departed} min before ${s.wave.size === 1 ? 'another crisis' : `${s.wave.size} more crises`} hit.`);

  let summary: string;
  if (lateness <= 0 && misses.length === 0) summary = 'On time, with everything done.';
  else if (lateness <= 0 && severeMisses === 0) summary = `On time. Left behind: ${leftBehind.join(', ').toLowerCase()}.`;
  else if (lateness <= 0) summary = `On time, but without ${leftBehind.find((_, i) => misses[i].severity === 'severe')!.toLowerCase()}.`;
  else if (lateness <= 5 && misses.length <= 1) summary = `${lateness} minutes late, with most things finished.`;
  else if (misses.length >= 4) summary = `${lateness} minutes late, with a few things left at home. She got there, and the day went fine.`;
  else summary = `${lateness} minutes late. She got there, and the day went fine.`;

  return {
    departed,
    arrived,
    lateness,
    completed,
    leftBehind,
    misses,
    severeMisses,
    mood: s.householdMood,
    notes,
    revealed,
    score,
    grade,
    summary,
  };
}
