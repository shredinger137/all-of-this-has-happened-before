// Bot playtests for tuning. Run: npm run balance
// Each strategy plays the same seeds with a simple sensible policy.
import { CHILD_TASKS, INCIDENTS } from '../src/sim/content';
import { formatClock } from '../src/sim/constants';
import { childTaskBlocker, createGame, currentIncident, offered, parentTaskBlocker, reduce, results } from '../src/sim/engine';
import type { GameState, TaskId } from '../src/sim/types';

const PARENT_PRIORITY: TaskId[] = ['breakfastMade', 'clothesOut', 'shoesFound', 'lunch', 'slip', 'peKit', 'parentReady', 'bagChecked', 'coffee'];
const READY: TaskId[] = [...CHILD_TASKS, 'lunch', 'parentReady', 'slip', 'peKit'];

// intel: 'trust' acts on whatever the calendar says; 'email' reads the school email first.
type Strategy = { name: string; wakeAt: number | null; careful: boolean; intel: 'trust' | 'email' };

function step(s: GameState, strat: Strategy): GameState {
  const inc = currentIncident(s);
  if (inc) {
    const options = INCIDENTS[inc.id].responses.filter((r) => !r.available || r.available(s, inc));
    // careful: first (stable) option; hasty: quickest option
    const pick = strat.careful ? options[0] : [...options].sort((a, b) => a.minutes - b.minutes)[0];
    return reduce(s, { type: 'respond', response: pick.id });
  }
  if (!s.childAwake && strat.wakeAt !== null && s.minute >= strat.wakeAt) return reduce(s, { type: 'wakeNow' });
  if (s.childAwake) {
    const ready = READY.filter((t) => offered(s, t)).every((t) => ['done', 'skipped'].includes(s.objectives[t].status));
    if (ready || s.minute >= s.departureDeadline + 30) return reduce(s, { type: 'leave' });
    if (!s.childActivity) {
      const t = CHILD_TASKS.find((c) => offered(s, c) && !childTaskBlocker(s, c));
      if (t) return reduce(s, { type: 'assignChild', task: t });
    }
  }
  if (!s.parentActivity) {
    if (strat.intel === 'email' && offered(s, 'email')) return reduce(s, { type: 'startParent', task: 'email' });
    const t = PARENT_PRIORITY.find((p) => offered(s, p) && !parentTaskBlocker(s, p));
    if (t) return reduce(s, { type: 'startParent', task: t });
    if (s.childActivity && s.objectives[s.childActivity].status === 'active') return reduce(s, { type: 'help' });
  }
  return reduce(s, { type: 'wait' });
}

const strategies: Strategy[] = [
  { name: 'wake 06:45, careful, trust', wakeAt: 405, careful: true, intel: 'trust' },
  { name: 'wake 06:45, careful, email', wakeAt: 405, careful: true, intel: 'email' },
  { name: 'natural,    careful, trust', wakeAt: null, careful: true, intel: 'trust' },
  { name: 'natural,    careful, email', wakeAt: null, careful: true, intel: 'email' },
  { name: 'wake 06:30, hasty,   trust', wakeAt: 390, careful: false, intel: 'trust' },
  { name: 'natural,    hasty,   email', wakeAt: null, careful: false, intel: 'email' },
];

const N = 500;
for (const strat of strategies) {
  let dep = 0, late = 0, onTime = 0, score = 0, severe = 0, eventDays = 0, eventMissed = 0, mood = 0;
  for (let seed = 1; seed <= N; seed++) {
    let s = createGame(seed);
    for (let i = 0; i < 400 && !s.ended; i++) s = step(s, strat);
    const r = results(s);
    dep += r.departed;
    late += Math.max(0, r.lateness);
    if (r.lateness <= 0) onTime++;
    score += r.score;
    severe += r.severeMisses;
    if (s.day.event) {
      eventDays++;
      if (r.misses.some((m) => m.id.startsWith('event:'))) eventMissed++;
    }
    mood += r.mood;
  }
  console.log(
    `${strat.name}  depart ${formatClock(Math.round(dep / N))}  on-time ${((100 * onTime) / N).toFixed(0).padStart(3)}%` +
      `  avg late ${(late / N).toFixed(1).padStart(4)}m  severe ${(severe / N).toFixed(2)}` +
      `  event missed ${((100 * eventMissed) / Math.max(1, eventDays)).toFixed(0).padStart(3)}%  mood ${(mood / N).toFixed(1)}  score ${(score / N).toFixed(0)}`,
  );
}
