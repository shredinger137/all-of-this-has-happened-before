import {
  BATHROOM_CHANCE,
  CHILD_TASKS,
  INCIDENTS,
  LIBRARY_CHANCE,
  PARENT_TASKS,
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
  Flag,
  GameState,
  IncidentId,
  Mood,
  MorningCondition,
  Objective,
  OpenIncident,
  TaskId,
} from './types';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const CONDITION_POOL: MorningCondition[] = ['ordinary', 'ordinary', 'lateBedtime', 'shoesByDoor', 'noBread', 'earlyBird'];
const TENDENCY_POOL: ChildTendency[] = ['independent', 'dawdler', 'picky', 'cheerful'];

export function createGame(seed: number): GameState {
  const objectives = {} as Record<TaskId, Objective>;
  for (const id of Object.keys(TASKS) as TaskId[]) {
    objectives[id] = { status: 'todo', progress: 0, extra: 0, rolled: false };
  }
  const s: GameState = {
    seed,
    rng: seed,
    minute: START_MINUTE,
    departureDeadline: DEPARTURE_DEADLINE,
    wakeMinute: NATURAL_WAKE,
    childAwake: false,
    groggyLevel: 0,
    householdMood: START_MOOD,
    coffeeBuffer: false,
    objectives,
    incidents: [],
    firedIncidents: [],
    nextUid: 1,
    flags: [],
    morningCondition: 'ordinary',
    childTendency: 'independent',
    history: [],
    ended: false,
  };
  s.morningCondition = CONDITION_POOL[Math.floor(rand(s) * CONDITION_POOL.length)];
  s.childTendency = TENDENCY_POOL[Math.floor(rand(s) * TENDENCY_POOL.length)];

  if (s.morningCondition === 'earlyBird') s.wakeMinute = NATURAL_WAKE - 10;
  if (s.morningCondition === 'shoesByDoor') {
    s.objectives.shoesFound.status = 'done';
    s.objectives.shoesFound.progress = TASKS.shoesFound.duration(s);
  }
  if (s.childTendency === 'cheerful') s.householdMood = 4;

  log(s, "You're awake. She's still asleep.");
  return s;
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
  log(s, `${TASKS[task].label}.`);
  if (task === 'bagChecked') {
    if (rand(s) < LIBRARY_CHANCE) openIncident(s, 'library');
    else {
      setFlag(s, 'bookFound');
      log(s, 'Library book is in the bag.');
    }
  }
}

/**
 * Advance one simulated minute. Returns true if something happened that the
 * player should look at. `engaged` marks who is tied up resolving an incident.
 */
function tick(s: GameState, engaged: { parent: boolean; child: boolean }): boolean {
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
      if (open || TASKS[task].owner !== 'parent' || parentTaskBlocker(s, task)) return prev;
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
      if (open || TASKS[task].owner !== 'child' || childTaskBlocker(s, task)) return prev;
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

      spend(s, resp.minutes, !!resp.both);
      let kept: string | undefined;
      const ctx: ResolveCtx = {
        s,
        incident: open,
        roll: () => rand(s),
        log: (text, notable) => log(s, text, notable),
        mood: (d) => changeMood(s, d),
        flag: (f) => setFlag(s, f),
        escalate: ({ base = 0.4, extra = 3 } = {}) => {
          let chance = base;
          if (isGroggy(s)) chance += 0.3 * s.groggyLevel;
          if (s.householdMood <= 1) chance += 0.15;
          if (s.householdMood >= 4) chance -= 0.1;
          if (rand(s) >= chance) return false;
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

    case 'leave': {
      // Leaving mid-incident is allowed: the problem simply goes unresolved.
      if (open?.id === 'bathroom' || !s.childAwake) return prev;
      if (open) open.status = 'deferred';
      if (!s.firedIncidents.includes('bathroom') && rand(s) < BATHROOM_CHANCE) {
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

export type Results = {
  departed: number;
  arrived: number;
  lateness: number; // minutes after school start; negative = early
  completed: string[];
  leftBehind: string[];
  mood: Mood;
  notes: { minute: number; text: string }[];
  score: number;
  grade: string;
  summary: string;
};

export function results(s: GameState): Results {
  const departed = s.departedAt ?? s.minute;
  const arrived = departed + COMMUTE_MINUTES;
  const lateness = arrived - SCHOOL_START;

  const scored = [...PARENT_TASKS, ...CHILD_TASKS].filter((t) => TASKS[t].scored);
  const completed = scored.filter((t) => s.objectives[t].status === 'done').map((t) => TASKS[t].label);
  const missingScored = scored.filter((t) => s.objectives[t].status !== 'done').map((t) => TASKS[t].missing);

  const extras: string[] = [];
  if (hasFlag(s, 'noSocks')) extras.push('Socks');
  if (hasFlag(s, 'wellies')) extras.push('Proper shoes');
  if (hasFlag(s, 'stainedShirt')) extras.push('A clean top');
  if (hasFlag(s, 'messyKitchen')) extras.push('A clean kitchen');
  if (hasFlag(s, 'bookLeft') || s.incidents.some((i) => i.id === 'library')) extras.push('Library book');
  if (s.householdMood <= 1) extras.push('A peaceful morning');
  const leftBehind = [...missingScored, ...extras];

  const late = Math.max(0, lateness);
  const raw = 100 - 3 * late - 8 * missingScored.length - 3 * extras.length + 4 * (s.householdMood - 3);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const grade = score >= 85 ? 'Textbook' : score >= 65 ? 'Acceptable' : score >= 40 ? 'Messy' : 'Rough';

  const notes = s.history.filter((h) => h.notable).slice(-5);

  let summary: string;
  if (lateness <= 0 && leftBehind.length === 0) summary = 'On time, with everything done. Suspiciously smooth.';
  else if (lateness <= 0) summary = `On time. ${leftBehind[0]} can wait until tomorrow.`;
  else if (lateness <= 5 && missingScored.length <= 1) summary = `${lateness} minutes late, with most things finished.`;
  else if (missingScored.length >= 3) summary = `${lateness} minutes late and only partly ready. Tomorrow is another morning.`;
  else summary = `${lateness} minutes late. She got there.`;

  return { departed, arrived, lateness, completed, leftBehind, mood: s.householdMood, notes, score, grade, summary };
}
