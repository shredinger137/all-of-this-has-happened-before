// Smoke test: render every panel across many randomly played mornings.
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CHILD_TASKS, INCIDENTS, PARENT_TASKS } from '../sim/content';
import { childTaskBlocker, createGame, currentIncident, parentTaskBlocker, reduce, results } from '../sim/engine';
import { nextRandom } from '../sim/rng';
import type { Action, GameState } from '../sim/types';
import { ActionPanel } from './ActionPanel';
import { Debrief } from './Debrief';
import { StatusPanel } from './StatusPanel';

function legalActions(s: GameState): Action[] {
  const inc = currentIncident(s);
  if (inc) {
    const acts: Action[] = INCIDENTS[inc.id].responses
      .filter((r) => !r.available || r.available(s, inc))
      .map((r) => ({ type: 'respond', response: r.id }));
    if (INCIDENTS[inc.id].deferrable) acts.push({ type: 'defer' });
    return acts;
  }
  const acts: Action[] = [{ type: 'wait' }];
  for (const t of PARENT_TASKS) if (!parentTaskBlocker(s, t)) acts.push({ type: 'startParent', task: t });
  for (const t of CHILD_TASKS) if (!childTaskBlocker(s, t)) acts.push({ type: 'assignChild', task: t });
  for (const i of s.incidents) if (i.status === 'deferred') acts.push({ type: 'reopen', uid: i.uid });
  if (!s.childAwake) acts.push({ type: 'wakeNow' });
  if (s.childActivity) acts.push({ type: 'help' });
  if (s.childAwake && s.minute > 450) acts.push({ type: 'leave' });
  return acts;
}

const act = () => {};

describe('UI renders every reachable state', () => {
  it('plays 200 random mornings without render errors', () => {
    let rng = 99;
    let states = 0;
    for (let seed = 1; seed <= 200; seed++) {
      let s = createGame(seed);
      for (let step = 0; step < 300 && !s.ended; step++) {
        renderToString(<StatusPanel s={s} />);
        renderToString(<ActionPanel s={s} act={act} />);
        states++;
        const options = legalActions(s);
        const [r, next] = nextRandom(rng);
        rng = next;
        s = reduce(s, options[Math.floor(r * options.length)]);
      }
      expect(s.ended).toBe(true);
      const html = renderToString(<Debrief r={results(s)} onRetry={act} onReplay={act} />);
      expect(html).toContain('Left home');
    }
    expect(states).toBeGreaterThan(1000);
  });
});
