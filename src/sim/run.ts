// The run: mornings roll on, Monday to Friday, week after week. No game over; a bad week has
// consequences next week instead. Pure and seeded, like the morning engine.
import { PERKS } from './content';
import { START_MOOD } from './constants';
import { createGame, results, WEEKDAYS, type MorningSetup } from './engine';
import { nextRandom } from './rng';
import type { EventId, GameState, Mood, PerkId, TaskId } from './types';

export type CardId = 'clothes' | 'bag' | 'lunch' | 'shoes' | 'bedtime' | 'newsletter' | 'coffee' | 'project' | 'promise';

/** Evening preparations: pick two of four each night. */
export const CARDS: Record<CardId, { name: string; note: string; prepares?: TaskId }> = {
  clothes: { name: 'Lay out her clothes', note: 'Dressing goes faster, with fewer arguments.', prepares: 'clothesOut' },
  bag: { name: 'Pack the school bag', note: 'Any forms or books in it are found tonight.', prepares: 'bagChecked' },
  lunch: { name: 'Make lunch tonight', note: 'One less job in the morning.', prepares: 'lunch' },
  shoes: { name: 'Find her shoes', note: 'By the door, where they belong.', prepares: 'shoesFound' },
  bedtime: { name: 'Early bedtime', note: 'She wakes rested and in a better mood.' },
  newsletter: { name: 'Read the newsletter', note: "You'll know what's on at school tomorrow." },
  coffee: { name: 'Set the coffee timer', note: 'Coffee is ready when you are. Keeps you calm once.' },
  project: { name: 'Finish the leaf project', note: 'Ten minutes tonight, if it turns out to be due.', prepares: 'project' },
  promise: { name: 'Keep your promise', note: 'You said you would. She remembers.' },
};
const CARD_POOL: CardId[] = ['clothes', 'bag', 'lunch', 'shoes', 'bedtime', 'newsletter', 'coffee', 'project'];
export const CARDS_PER_EVENING = 2;
export const MAX_FATE = 3;
export const LATE_MARKS_FOR_MEETING = 3;

export type PromiseId = 'dress' | 'bug';
export const PROMISE_TEXT: Record<PromiseId, string> = {
  dress: 'the yellow dress',
  bug: 'looking at the bug after school',
};

export type DaySummary = {
  label: string;
  lateness: number;
  score: number;
  grade: string;
  severeMisses: number;
  event?: EventId;
};

export type RunState = {
  version: 1;
  seed: number;
  rng: number;
  week: number; // 1-based
  weekday: number; // 0 = Monday … 4 = Friday
  daysPlayed: number;
  phase: 'morning' | 'evening' | 'weekly';
  fate: number;
  lateMarks: number; // this week
  mood: Mood; // carried into tomorrow
  perks: PerkId[];
  promises: PromiseId[];
  overdueBook: boolean;
  meetingMonday: boolean;
  lastEvent?: EventId;
  weekLog: DaySummary[];
  offer: CardId[]; // tonight's evening cards
  picks: CardId[]; // chosen for tomorrow morning
  perkOffer: PerkId[];
  totalScore: number;
};

function rand(run: RunState): number {
  const [v, next] = nextRandom(run.rng);
  run.rng = next;
  return v;
}

function draw<T>(run: RunState, pool: T[], n: number): T[] {
  const left = [...pool];
  const out: T[] = [];
  while (out.length < n && left.length) out.push(left.splice(Math.floor(rand(run) * left.length), 1)[0]);
  return out;
}

export function newRun(seed: number): RunState {
  return {
    version: 1,
    seed,
    rng: seed ^ 0x5bd1e995,
    week: 1,
    weekday: 0,
    daysPlayed: 0,
    phase: 'morning',
    fate: 1,
    lateMarks: 0,
    mood: START_MOOD,
    perks: [],
    promises: [],
    overdueBook: false,
    meetingMonday: false,
    weekLog: [],
    offer: [],
    picks: [],
    perkOffer: [],
    totalScore: 0,
  };
}

/** Each morning of a run gets its own seed. */
export function morningSeed(run: RunState): number {
  return (Math.imul(run.seed + 1, 2654435761) ^ Math.imul(run.daysPlayed + 1, 40503)) >>> 0;
}

export function dayLabel(run: RunState): string {
  return `Week ${run.week} · ${WEEKDAYS[run.weekday]}`;
}

export function morningSetup(run: RunState): MorningSetup {
  const picks = run.picks;
  const kept = picks.includes('promise');
  // A broken promise costs a little mood; a kept one buys some.
  const moodShift = kept ? 1 : -run.promises.length;
  return {
    weekday: run.weekday,
    label: dayLabel(run),
    mood: Math.max(0, Math.min(5, run.mood + moodShift)) as Mood,
    fate: run.fate,
    perks: run.perks,
    prepared: picks.map((c) => CARDS[c].prepares).filter((t): t is TaskId => !!t),
    readNewsletter: picks.includes('newsletter'),
    earlyBedtime: picks.includes('bedtime'),
    coffeeTimer: picks.includes('coffee'),
    forceEvent: run.overdueBook ? 'library' : undefined,
    notEvent: run.lastEvent,
    meeting: run.weekday === 0 && run.meetingMonday,
  };
}

export function startMorning(run: RunState): GameState {
  return createGame(morningSeed(run), morningSetup(run));
}

/** Fold a finished morning into the run, and set up the evening (or the weekly report). */
export function finishMorning(prev: RunState, game: GameState): RunState {
  if (!game.ended || prev.phase !== 'morning') return prev;
  const run = structuredClone(prev);
  const r = results(game);
  const onTime = r.lateness <= 0;

  run.fate = Math.min(MAX_FATE, game.fate + (onTime && r.severeMisses === 0 ? 1 : 0));
  if (!onTime) run.lateMarks += 1;
  // Tomorrow starts somewhere between today's end and calm.
  run.mood = Math.round((game.householdMood + START_MOOD) / 2) as Mood;
  run.promises = [];
  if (game.flags.includes('promisedDress')) run.promises.push('dress');
  if (game.flags.includes('promisedBug')) run.promises.push('bug');
  if (game.day.event === 'library') run.overdueBook = !game.flags.includes('bookFound');
  run.lastEvent = game.day.event;
  if (game.day.meeting) run.meetingMonday = false;
  run.weekLog.push({
    label: WEEKDAYS[run.weekday],
    lateness: r.lateness,
    score: r.score,
    grade: r.grade,
    severeMisses: r.severeMisses,
    event: game.day.event,
  });
  run.totalScore += r.score;
  run.daysPlayed += 1;
  run.picks = [];

  if (run.weekday === 4) {
    run.phase = 'weekly';
    run.meetingMonday = run.lateMarks >= LATE_MARKS_FOR_MEETING;
    const unowned = (Object.keys(PERKS) as PerkId[]).filter((p) => !run.perks.includes(p));
    run.perkOffer = draw(run, unowned, 3);
  } else {
    run.phase = 'evening';
    run.offer = eveningOffer(run);
  }
  return run;
}

function eveningOffer(run: RunState): CardId[] {
  const offer = draw(run, CARD_POOL, 4);
  if (run.promises.length) offer[3] = 'promise';
  return offer;
}

/** Tonight's preparations; the next morning begins. */
export function chooseCards(prev: RunState, picks: CardId[]): RunState {
  if (prev.phase !== 'evening') return prev;
  const valid = picks.filter((c, i) => prev.offer.includes(c) && picks.indexOf(c) === i).slice(0, CARDS_PER_EVENING);
  const run = structuredClone(prev);
  run.picks = valid;
  run.weekday = (run.weekday + 1) % 5;
  run.phase = 'morning';
  return run;
}

/** End of the week: keep one household improvement, then Sunday evening. */
export function choosePerk(prev: RunState, perk?: PerkId): RunState {
  if (prev.phase !== 'weekly') return prev;
  const run = structuredClone(prev);
  if (perk && run.perkOffer.includes(perk)) run.perks.push(perk);
  run.perkOffer = [];
  run.week += 1;
  run.weekday = 4; // Sunday night: the evening before Monday
  run.lateMarks = 0;
  run.weekLog = [];
  run.phase = 'evening';
  run.offer = eveningOffer(run);
  return run;
}
