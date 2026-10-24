// Smoke test: render every panel across many randomly played mornings, and a few whole weeks.
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BREAKFAST_ORDER, CHILD_TASKS, INCIDENTS, INTEL_TASKS, PARENT_TASKS } from '../sim/content';
import { childTaskBlocker, createGame, currentIncident, offered, parentTaskBlocker, reduce, results } from '../sim/engine';
import { nextRandom } from '../sim/rng';
import { chooseCards, choosePerk, finishMorning, newRun, startMorning, type RunState } from '../sim/run';
import type { Action, GameState } from '../sim/types';
import { Debrief } from './Debrief';
import { GameScreen } from './GameScreen';
import { RunScreen } from './RunScreen';

function legalActions(s: GameState): Action[] {
  const inc = currentIncident(s);
  if (inc) {
    const acts: Action[] = INCIDENTS[inc.id].responses
      .filter((r) => !r.available || r.available(s, inc))
      .flatMap((r): Action[] => {
        const a: Action = { type: 'respond', response: r.id };
        return r.risky && s.fate > 0 ? [a, { ...a, fate: true }] : [a];
      });
    if (INCIDENTS[inc.id].deferrable) acts.push({ type: 'defer' });
    return acts;
  }
  if (s.outcome) return [{ type: 'ack' }];
  const acts: Action[] = [{ type: 'wait' }];
  for (const t of [...PARENT_TASKS, ...INTEL_TASKS]) if (offered(s, t) && !parentTaskBlocker(s, t)) acts.push({ type: 'startParent', task: t });
  for (const b of BREAKFAST_ORDER) if (!parentTaskBlocker(s, 'breakfastMade')) acts.push({ type: 'startParent', task: 'breakfastMade', variant: b });
  if (s.childAwake) acts.push({ type: 'askBreakfast' });
  for (const t of CHILD_TASKS) if (offered(s, t) && !childTaskBlocker(s, t)) acts.push({ type: 'assignChild', task: t });
  for (const i of s.incidents) if (i.status === 'deferred') acts.push({ type: 'reopen', uid: i.uid });
  if (!s.childAwake) acts.push({ type: 'wakeNow' });
  if (s.childAwake) acts.push({ type: 'ask' });
  if (s.fate > 0) acts.push({ type: 'favor' });
  if (s.childActivity) acts.push({ type: 'help' });
  if (s.childAwake && s.minute > 450) acts.push({ type: 'leave' });
  return acts;
}

const noop = () => {};

function playRandomly(s: GameState, rng: number, render: (g: GameState) => void): [GameState, number] {
  for (let step = 0; step < 300 && !s.ended; step++) {
    render(s);
    const options = legalActions(s);
    const [r, next] = nextRandom(rng);
    rng = next;
    s = reduce(s, options[Math.floor(r * options.length)]);
  }
  return [s, rng];
}

describe('UI renders every reachable state', () => {
  it('plays 200 random mornings without render errors', () => {
    let rng = 99;
    let states = 0;
    for (let seed = 1; seed <= 200; seed++) {
      let s = createGame(seed, { fate: seed % 3 });
      [s, rng] = playRandomly(s, rng, (g) => {
        renderToString(<GameScreen game={g} seed={seed} act={noop} onNext={noop} onRetry={noop} onReplay={noop} />);
        states++;
      });
      expect(s.ended).toBe(true);
      const html = renderToString(<GameScreen game={s} seed={seed} act={noop} onNext={noop} onRetry={noop} onReplay={noop} />);
      expect(html).toContain('Door shut'); // the departure plays first
      expect(renderToString(<Debrief r={results(s)} seed={seed} label={s.day.label} />)).toContain('Left home');
    }
    expect(states).toBeGreaterThan(1000);
  });

  it('plays three whole weeks, rendering mornings, evenings and week reports', () => {
    let run: RunState = newRun(42);
    let rng = 7;
    let screens = 0;
    while (run.week <= 3) {
      if (run.phase === 'morning') {
        let s = startMorning(run);
        [s, rng] = playRandomly(s, rng, (g) => {
          if (g.minute % 5 === 0) renderToString(<GameScreen game={g} seed={g.seed} act={noop} run={run} onNext={noop} onRetry={noop} onReplay={noop} />);
        });
        renderToString(<GameScreen game={s} seed={s.seed} act={noop} run={run} onNext={noop} onRetry={noop} onReplay={noop} />);
        run = finishMorning(run, s);
      } else {
        renderToString(<RunScreen run={run} onCards={noop} onPerk={noop} />);
        screens++;
        run = run.phase === 'evening' ? chooseCards(run, run.offer.slice(0, 2)) : choosePerk(run, run.perkOffer[0]);
      }
    }
    expect(screens).toBeGreaterThan(12);
    expect(run.perks.length).toBe(3);
  });
});
