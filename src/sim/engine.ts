import {
  ASK_RIGHT,
  BATHROOM_CHANCE,
  CALENDAR_RIGHT,
  CHECKLIST,
  COLD_CHANCE,
  EARLY_START_MINUTES,
  EVENT_CHANCE,
  EVENT_POOL,
  EVENTS,
  INCIDENTS,
  LIBRARY_CHANCE,
  PE_LAUNDRY_CHANCE,
  RAIN_CHANCES,
  RAIN_WALK_MINUTES,
  ROLL_ORDER,
  TASKS,
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
  label?: string;
  mood?: Mood; // carried over from yesterday
  fate?: number;
  perks?: PerkId[];
  prepared?: TaskId[]; // done the night before
  readNewsletter?: boolean; // today's event is known from the start
  forceEvent?: EventId | null; // overdue book makes it a library day; null = no event
  notEvent?: EventId; // yesterday's event doesn't repeat
  meeting?: boolean; // the head teacher wants a word
  earlyBedtime?: boolean; // no late bedtime, and she starts in a better mood
  coffeeTimer?: boolean;
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
    coffeeBuffer: !!setup.coffeeTimer,
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
    fate: setup.fate ?? 0,
    perks: setup.perks ?? [],
    history: [],
    spans: [],
    ended: false,
  };
  s.morningCondition = CONDITION_POOL[Math.floor(rand(s) * CONDITION_POOL.length)];
  s.childTendency = TENDENCY_POOL[Math.floor(rand(s) * TENDENCY_POOL.length)];
  if (setup.earlyBedtime && s.morningCondition === 'lateBedtime') s.morningCondition = 'ordinary';
  rollDay(s, setup);

  if (s.morningCondition === 'earlyBird') s.wakeMinute = NATURAL_WAKE - 10;
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
  else if (rand(s) < EVENT_CHANCE) {
    const pool = EVENT_POOL.filter((e) => e !== setup.notEvent);
    d.event = pool[Math.floor(rand(s) * pool.length)];
  }
  if (d.meeting) {
    d.schoolStart -= EARLY_START_MINUTES;
    s.departureDeadline -= EARLY_START_MINUTES;
  }
  if (d.event === 'trip') d.schoolStart = SCHOOL_START - EARLY_START_MINUTES;

  const temp = d.weather === 'cold' ? '2°C' : rain ? '9°C' : '12°C';
  addIntel(s, 'Forecast', `Rain ${Math.round(d.rainChance * 100)}% · ${temp}`, 'B2');

  if (d.meeting) addIntel(s, 'Letter from school', 'The head teacher would like a word. Please arrive by 07:50.', 'A1');

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
    else if (d.event) claim = r < CALENDAR_RIGHT ? d.event : r < 0.8 ? otherEvent(s, d.event) : 'none';
    else claim = r < 0.75 ? 'none' : otherEvent(s);
    const grade = s.perks.includes('calendar') ? 'A2' : 'C3';
    addIntel(s, 'Fridge calendar', claim === 'none' ? 'Nothing written for today.' : `"${EVENTS[claim].calendar}" scrawled on today.`, grade, claim);
  }
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
  if (s.day.event === 'trip') {
    s.departureDeadline = Math.min(s.departureDeadline, DEPARTURE_DEADLINE - EARLY_START_MINUTES);
    log(s, `The coach leaves at 07:50. You need to leave by ${formatClock(s.departureDeadline)}.`, true);
  }
}

/** The bag was packed the night before: notes and books in it are already known. */
function packedBag(s: GameState) {
  const e = s.day.event;
  if (e === 'trip') setFlag(s, 'slipFound');
  if (e === 'library') setFlag(s, 'bookFound');
  if (e === 'trip' || e === 'pe' || e === 'library') {
    addIntel(s, 'School bag', bagNote(e), 'A1', e);
    confirmEvent(s);
  }
}

function bagNote(e: EventId): string {
  if (e === 'trip') return 'Permission slip in the bag. Unsigned. Trip today.';
  if (e === 'pe') return 'A note in the bag: PE today, kit please.';
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
    case 'peKit':
      return sus.includes('pe');
    case 'costume':
      return sus.includes('dressUp');
    case 'slip':
      return sus.includes('trip') || hasFlag(s, 'slipFound');
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
  return s.childAwake ? 0.8 : 1;
}

/** Supervised tasks stall unless you are helping. */
export function childStalled(s: GameState, task: TaskId): boolean {
  return !!TASKS[task].supervised && s.parentActivity !== 'help';
}

export function childRate(s: GameState): number {
  let rate = 1;
  if (isGroggy(s)) rate *= 1 - 0.35 * s.groggyLevel;
  if (s.householdMood <= 1) rate *= 0.8;
  if (s.childTendency === 'independent') rate *= 1.15;
  if (s.perks.includes('chart')) rate *= 1.1;
  if (s.parentActivity === 'help') rate *= 1.5;
  return rate;
}

function incidentModifier(s: GameState): number {
  let m = 0;
  if (isGroggy(s)) m += 0.35 * s.groggyLevel;
  if (s.householdMood <= 1) m += 0.15;
  if (s.householdMood >= 4) m -= 0.1;
  return m;
}

/** Chance a risky response backfires right now (before coffee). Shown to the player as a band. */
export function escalationChance(s: GameState, base = 0.4): number {
  let chance = base;
  if (isGroggy(s)) chance += 0.3 * s.groggyLevel;
  if (s.householdMood <= 1) chance += 0.15;
  if (s.householdMood >= 4) chance -= 0.1;
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
  log(s, e > 0.5 ? 'You woke her early. She is very tired.' : 'You woke her a little early.', true);
}

function openIncident(s: GameState, id: IncidentId, task?: TaskId) {
  s.incidents.push({ uid: s.nextUid++, id, task, minute: s.minute, status: 'open' });
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
  if (o.status === 'blocked') o.status = s.childActivity === task ? 'active' : 'todo';
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

  if (task === 'coffee') s.coffeeBuffer = true;
  // A costume is getting dressed, as far as anyone at school is concerned.
  if (task === 'costume' && s.objectives.dressed.status !== 'done') {
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
    const p = Math.max(0, Math.min(0.9, (def.chance?.(s) ?? 0) + incidentModifier(s)));
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
      if (e === 'trip') {
        setFlag(s, 'slipFound');
        addIntel(s, 'School bag', bagNote('trip'), 'A1', 'trip');
        confirmEvent(s);
      } else if (e === 'pe') {
        addIntel(s, 'School bag', bagNote('pe'), 'A1', 'pe');
        confirmEvent(s);
      } else if (e === 'library') {
        if (rand(s) < LIBRARY_CHANCE) {
          addIntel(s, 'School bag', 'A library reminder in the bag. No book.', 'A1', 'library');
          confirmEvent(s);
          openIncident(s, 'library');
        } else {
          setFlag(s, 'bookFound');
          addIntel(s, 'School bag', bagNote('library'), 'A1', 'library');
          confirmEvent(s);
        }
      } else log(s, 'Nothing unusual in the bag.');
      break;
    case 'peKit':
      if (rand(s) < PE_LAUNDRY_CHANCE) {
        s.objectives.peKit.status = 'todo';
        s.objectives.peKit.progress = 0;
        openIncident(s, 'peLaundry');
      }
      break;
    case 'slip':
      setFlag(s, 'slipFound');
      break;
    case 'email':
      addIntel(s, 'School email', e ? EVENTS[e].email : 'Nothing special on today.', 'A1', e ?? 'none');
      confirmEvent(s);
      log(s, e ? `School email: ${EVENTS[e].name.toLowerCase()}.` : 'School email: nothing special today.', true);
      break;
    case 'window': {
      s.day.weatherKnown = true;
      const w = s.day.weather === 'rain' ? 'Raining.' : s.day.weather === 'cold' ? 'Dry, and cold.' : 'Dry.';
      addIntel(s, 'Out of the window', w, 'A1');
      log(s, `You looked outside. ${w}`);
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
function tick(s: GameState, engaged: { parent: boolean; child: boolean }): boolean {
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
  if (!engaged.parent && pa && pa !== 'help') {
    const o = s.objectives[pa];
    o.progress += parentRate(s);
    if (o.progress >= taskDuration(s, pa) - EPS) {
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
      openIncident(s, id, ca);
      event = true;
    } else if (o.progress >= taskDuration(s, ca) - EPS) {
      completeTask(s, ca);
      log(s, `${TASKS[ca].label}.`);
      event = true;
    }
  }

  if (!hasFlag(s, 'deadlinePassed') && s.minute >= s.departureDeadline) {
    setFlag(s, 'deadlinePassed');
    log(s, `It's ${formatClock(s.departureDeadline)}. Time to leave.`, true);
    event = true;
  }
  return event;
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
function spend(s: GameState, minutes: number, both: boolean) {
  for (let i = 0; i < minutes && s.minute < SAFETY_CUTOFF; i++) {
    tick(s, { parent: true, child: both });
  }
}

function checkCutoff(s: GameState) {
  if (!s.ended && s.minute >= SAFETY_CUTOFF) {
    log(s, 'You give up on the rest and leave.', true);
    endMorning(s);
  }
}

/** Coats on at the door: whatever either of you was doing stops here. */
function downTools(s: GameState) {
  for (const t of [s.parentActivity, s.childActivity]) {
    if (t && t !== 'help' && s.objectives[t].status === 'active') s.objectives[t].status = 'todo';
  }
  s.parentActivity = undefined;
  s.childActivity = undefined;
}

function endMorning(s: GameState) {
  s.ended = true;
  s.departedAt = s.minute;
  s.parentActivity = undefined;
  s.childActivity = undefined;
  log(s, 'Everyone left the house.', true);
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
  return undefined;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function reduce(prev: GameState, action: Action): GameState {
  if (prev.ended) return prev;
  const s = structuredClone(prev);
  const open = currentIncident(s);

  switch (action.type) {
    case 'startParent': {
      const { task } = action;
      if (open || TASKS[task].owner !== 'parent' || !offered(s, task) || parentTaskBlocker(s, task)) return prev;
      const was = s.parentActivity;
      if (was && was !== 'help' && was !== task) s.objectives[was].status = 'todo';
      s.parentActivity = task;
      s.objectives[task].status = 'active';
      advance(s);
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
      s.objectives[task].status = 'active';
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
      if (charmed) {
        s.fate -= 1;
        log(s, 'You spent a fate point. This one goes your way.', true);
      }
      spend(s, resp.minutes, !!resp.both);
      let kept: string | undefined;
      const ctx: ResolveCtx = {
        s,
        incident: open,
        roll: () => rand(s),
        log: (text, notable) => log(s, text, notable),
        mood: (d) => changeMood(s, d),
        flag: (f) => setFlag(s, f),
        escalate: ({ base = resp.riskBase ?? 0.4, extra = 3 } = {}) => {
          if (charmed || rand(s) >= escalationChance(s, base)) return false;
          if (s.coffeeBuffer) {
            s.coffeeBuffer = false;
            log(s, 'It nearly went badly. The coffee helped; you stayed calm.', true);
            return false;
          }
          changeMood(s, -1);
          if (open.task) s.objectives[open.task].extra += extra;
          spend(s, 2, true);
          log(s, 'She got upset. It took a while to settle her.', true);
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
      };
      resp.apply(ctx);

      if (kept !== undefined) {
        const inc = s.incidents.find((i) => i.uid === open.uid);
        if (inc) inc.note = kept;
      } else {
        removeIncident(s, open.uid);
        unblock(s, open.task);
      }
      if (open.id === 'bathroom') {
        setFlag(s, 'bathroomDone');
        endMorning(s);
      }
      checkCutoff(s);
      return s;
    }

    case 'defer': {
      if (!open || !INCIDENTS[open.id].deferrable) return prev;
      const inc = s.incidents.find((i) => i.uid === open.uid)!;
      inc.status = 'deferred';
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

    case 'favour': {
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
      // Leaving mid-incident is allowed: the problem simply goes unresolved.
      if (open?.id === 'bathroom' || !s.childAwake) return prev;
      if (open) open.status = 'deferred';
      if (!s.firedIncidents.includes('bathroom') && rand(s) < BATHROOM_CHANCE) {
        downTools(s);
        openIncident(s, 'bathroom');
        return s;
      }
      endMorning(s);
      return s;
    }
  }
}

// ---------------------------------------------------------------------------
// Debrief
// ---------------------------------------------------------------------------

export type Severity = 'minor' | 'moderate' | 'severe';
export const SEVERITY_COST: Record<Severity, number> = { minor: 4, moderate: 8, severe: 16 };

/** Something today needs. `known` is false while the intel hasn't confirmed it. */
export type Requirement = { id: string; label: string; missing: string; severity: Severity; met: boolean; known: boolean };

const BASE_SEVERITY: Partial<Record<TaskId, Severity>> = {
  parentReady: 'minor',
  lunch: 'minor', // she can buy lunch
  bagChecked: 'minor',
  breakfastEaten: 'moderate',
  dressed: 'severe',
  teeth: 'minor',
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

  if (d.weather !== 'clear') {
    reqs.push({
      id: 'coat',
      label: 'Coat on',
      missing: d.weather === 'rain' ? 'Her coat (it rained)' : 'Her coat (it was cold)',
      severity: 'moderate',
      met: isDone('coat'),
      known: d.weather === 'cold' || d.weatherKnown,
    });
  }

  const e = d.event;
  if (e) {
    const ev = EVENTS[e];
    const met =
      e === 'library' ? hasFlag(s, 'bookFound') : e === 'picture' ? !hasFlag(s, 'stainedShirt') : isDone(ev.task!);
    reqs.push({ id: `event:${e}`, label: ev.name, missing: ev.missing, severity: 'severe', met, known: d.eventKnown });
  }

  // Loose ends from how things went.
  const extra = (id: string, missing: string, severity: Severity = 'minor') =>
    reqs.push({ id, label: missing, missing, severity, met: false, known: true });
  if (hasFlag(s, 'noSocks')) extra('noSocks', 'Socks');
  if (hasFlag(s, 'wellies') && d.weather !== 'rain') extra('wellies', 'Proper shoes');
  if (hasFlag(s, 'stainedShirt') && !picture) extra('stainedShirt', 'A clean top');
  if (hasFlag(s, 'messyKitchen')) extra('messyKitchen', 'A clean kitchen');
  if (hasFlag(s, 'smellyKit')) extra('smellyKit', 'A clean PE kit');
  if (hasFlag(s, 'stuffyDamp')) extra('stuffyDamp', 'A dry stuffy');
  if (s.householdMood <= 1) extra('mood', 'A peaceful morning', 'moderate');
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
  const arrived = departed + COMMUTE_MINUTES + (d.weather === 'rain' ? RAIN_WALK_MINUTES : 0);
  const lateness = arrived - d.schoolStart;

  const reqs = requirements(s);
  const completed = reqs.filter((r) => r.met).map((r) => r.label);
  const misses = reqs.filter((r) => !r.met);
  const leftBehind = misses.map((r) => r.missing);
  const severeMisses = misses.filter((r) => r.severity === 'severe').length;

  const late = Math.max(0, lateness);
  const cost = misses.reduce((n, r) => n + SEVERITY_COST[r.severity], 0);
  const raw = 100 - 3 * late - cost + 4 * (s.householdMood - 3);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const grade = score >= 85 ? 'Textbook' : score >= 65 ? 'Acceptable' : score >= 40 ? 'Messy' : 'Rough';

  const notes = s.history.filter((h) => h.notable).slice(-5);

  const revealed: string[] = [];
  if (d.event) revealed.push(`${EVENTS[d.event].reveal}${d.eventKnown ? '' : ' You never confirmed it.'}`);
  else if (!d.eventKnown) revealed.push('Nothing special on at school, as it turned out.');
  if (d.weather === 'rain') revealed.push('It rained on the way.');
  if (d.meeting) revealed.push('The head teacher was waiting at 07:50.');

  let summary: string;
  if (lateness <= 0 && misses.length === 0) summary = 'On time, with everything done. Suspiciously smooth.';
  else if (lateness <= 0 && severeMisses === 0) summary = `On time. Left behind: ${leftBehind.join(', ').toLowerCase()}.`;
  else if (lateness <= 0) summary = `On time, but without ${leftBehind.find((_, i) => misses[i].severity === 'severe')!.toLowerCase()}.`;
  else if (lateness <= 5 && misses.length <= 1) summary = `${lateness} minutes late, with most things finished.`;
  else if (misses.length >= 4) summary = `${lateness} minutes late and only partly ready. Tomorrow is another morning.`;
  else summary = `${lateness} minutes late. She got there.`;

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
