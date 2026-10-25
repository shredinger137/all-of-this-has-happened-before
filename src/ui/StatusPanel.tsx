import type { ReactNode } from 'react';
import { CONDITIONS, EVENTS, MOOD_EFFECTS, MOOD_LABELS, TASKS, TENDENCIES } from '../sim/content';
import { formatClock } from '../sim/constants';
import { childRate, childStalled, isGroggy, parentRate, requirements, taskDuration } from '../sim/engine';
import type { GameState, TaskId } from '../sim/types';
import { Ring } from './MorningPlot';

export function MoodBar({ mood }: { mood: number }) {
  return (
    <div className={`mood ${mood <= 2 ? 'low' : ''}`} aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <i key={n} className={n <= mood ? 'on' : ''} />
      ))}
    </div>
  );
}

/** What her mood is doing to the morning, for the tooltip. */
function moodEffect(mood: number): string {
  const e = MOOD_EFFECTS[mood];
  if (e.speed === 1) return 'No effect either way.';
  const pct = Math.round((e.speed - 1) * 100);
  const trouble = Math.round(e.trouble * 100);
  return `She works ${Math.abs(pct)}% ${pct > 0 ? 'faster' : 'slower'}; problems ${trouble > 0 ? 'more' : 'less'} likely (${trouble > 0 ? '+' : ''}${trouble} pts).`;
}

const LOOSE_ENDS = new Set(['noSocks', 'wellies', 'stainedShirt', 'messyKitchen', 'smellyKit', 'stuffyDamp', 'mood']);
const DONE_ROW = { node: 'done', value: 'Done', vClass: 'muted' };
const TODO_ROW = { node: '', value: 'Not yet', vClass: 'muted' };

function objectiveRow(s: GameState, id: TaskId) {
  const o = s.objectives[id];
  switch (o.status) {
    case 'done':
      return { node: 'done', value: 'Done', vClass: 'muted' };
    case 'skipped':
      return { node: 'skipped', value: 'Skipped', vClass: 'amber' };
    case 'blocked':
      return { node: 'blocked', value: 'Stopped', vClass: 'amber' };
    case 'active':
      return { node: 'active', value: 'In progress', vClass: '' };
    default:
      return o.progress > 0
        ? { node: 'part', value: 'Part done', vClass: 'muted' }
        : { node: '', value: 'Not started', vClass: 'muted' };
  }
}

type Activity = { text: string; progress: number; paused: boolean; ring: string };

export function activity(s: GameState, who: 'parent' | 'child'): Activity {
  const idle = (text: string): Activity => ({ text, progress: 0, paused: false, ring: '—' });
  if (who === 'child') {
    if (!s.childAwake) return idle('Asleep');
    const ca = s.childActivity;
    if (!ca) return idle('Free');
    const o = s.objectives[ca];
    const progress = o.progress / taskDuration(s, ca);
    if (o.status === 'blocked') return { text: `${TASKS[ca].doing} · Stopped`, progress, paused: true, ring: '!!' };
    if (childStalled(s, ca)) return { text: `${TASKS[ca].doing} · Needs you`, progress, paused: true, ring: '··' };
    const left = Math.max(1, Math.ceil((taskDuration(s, ca) - o.progress) / childRate(s)));
    return { text: TASKS[ca].doing, progress, paused: false, ring: `${left}m` };
  }
  const pa = s.parentActivity;
  if (!pa) return idle('Available');
  if (pa === 'help') {
    const ca = s.childActivity;
    const progress = ca ? s.objectives[ca].progress / taskDuration(s, ca) : 0;
    return { text: 'Helping her', progress, paused: false, ring: 'w/' };
  }
  const o = s.objectives[pa];
  const left = Math.max(1, Math.ceil((taskDuration(s, pa) - o.progress) / parentRate(s)));
  return { text: TASKS[pa].doing, progress: o.progress / taskDuration(s, pa), paused: false, ring: `${left}m` };
}

function ActivityCard({ s, who }: { s: GameState; who: 'parent' | 'child' }) {
  const a = activity(s, who);
  return (
    <div className="mini frame">
      <Ring value={a.progress} paused={a.paused} label={a.ring} />
      <div style={{ minWidth: 0 }}>
        <div className="eyebrow">{who === 'parent' ? 'You' : 'Your daughter'}</div>
        <strong>{a.text}</strong>
      </div>
    </div>
  );
}

/** Checklist items done, out of those known so far: shown on the tab. */
export function checklistCount(s: GameState): { done: number; total: number } {
  const needed = requirements(s).filter((r) => r.known && !LOOSE_ENDS.has(r.id));
  return { done: needed.filter((r) => r.met).length, total: needed.length };
}

/** `head` is the fixed strip above the scrolling body (the tab strip on wide screens). */
export function StatusPanel({ s, head }: { s: GameState; head?: ReactNode }) {
  const reqs = requirements(s);
  // Things to get done (known ones), versus loose ends left by how the morning went.
  const needed = reqs.filter((r) => r.known && !LOOSE_ENDS.has(r.id));
  const looseEnds = reqs.filter((r) => LOOSE_ENDS.has(r.id));
  const done = needed.filter((r) => r.met).length;
  const mood = s.householdMood;
  const groggy = isGroggy(s);
  return (
    <div className="panel frame screen">
      {head}
      <div className="panel-body">
        <div className="sectionhead">
          <span className="sectitle">
            <span className="num">01</span>Morning checklist
          </span>
          <span className={`status ${done === needed.length ? 'green' : 'amber'}`}>
            {done} of {needed.length}
          </span>
        </div>
        {needed.map((r) => {
          const task = r.id.startsWith('event:') ? (s.day.event && EVENTS[s.day.event].task) : (r.id as TaskId);
          const row = task && TASKS[task] ? objectiveRow(s, task) : r.met ? DONE_ROW : TODO_ROW;
          return (
            <div className="row" key={r.id}>
              <span className="k">
                <span className={`node ${row.node}`} />
                {r.label}
                {r.severity === 'severe' && <span className="tag must">Must</span>}
              </span>
              <span className={`v ${row.vClass}`}>{r.met && !task ? 'OK' : row.value}</span>
            </div>
          );
        })}
        {!s.day.eventKnown && (
          <div className="row unknown">
            <span className="k">
              <span className="node unknown" />
              School event?
            </span>
            <span className="v amber">Unconfirmed</span>
          </div>
        )}
        {!s.day.weatherKnown && s.day.weather !== 'cold' && (
          <div className="row unknown">
            <span className="k">
              <span className="node unknown" />
              Coat?
            </span>
            <span className="v amber">{Math.round(s.day.rainChance * 100)}% rain</span>
          </div>
        )}
        {looseEnds.length > 0 && (
          <>
            <div className="eyebrow group-label">Loose ends</div>
            {looseEnds.map((r) => (
              <div className="row" key={r.id}>
                <span className="k">
                  <span className="node skipped" />
                  {r.missing}
                </span>
                <span className="v amber">{r.severity}</span>
              </div>
            ))}
          </>
        )}
        <div className="eyebrow group-label">Prep</div>
        <div className="row">
          <span className="k">
            <span className={`node ${objectiveRow(s, 'breakfastMade').node}`} />
            Breakfast
          </span>
          <span className="v muted">
            {{ done: 'Made', active: 'Making it' }[s.objectives.breakfastMade.status as string] ?? 'Not made'}
          </span>
        </div>
        <div className="row">
          <span className="k">
            <span className={`node ${s.objectives.shoesFound.status === 'done' ? 'done' : ''}`} />
            Shoes
          </span>
          <span className="v muted">{s.objectives.shoesFound.status === 'done' ? 'Found' : 'Not checked'}</span>
        </div>
        <div className="sectionhead spaced">
          <span className="sectitle">
            <span className="num">02</span>At home
          </span>
          <span className={`status ${s.childAwake ? 'amber' : 'green'}`}>{s.childAwake ? 'Active' : 'Quiet'}</span>
        </div>
        <div className="row">
          <span className="k">Your daughter</span>
          <span className="v">{s.childAwake ? (groggy ? 'Awake · groggy' : 'Awake') : 'Asleep'}</span>
        </div>
        {!s.childAwake && (
          <div className="row">
            <span className="k">Usually wakes</span>
            <span className="v">{formatClock(s.wakeMinute)}</span>
          </div>
        )}
        <div className="row">
          <span className="k">Today</span>
          <span className="v" title={CONDITIONS[s.morningCondition].note}>
            {CONDITIONS[s.morningCondition].label}
          </span>
        </div>
        <div className="row">
          <span className="k">She is</span>
          <span className="v" title={TENDENCIES[s.childTendency].note}>
            {TENDENCIES[s.childTendency].label}
          </span>
        </div>
        <div className="row" style={{ marginBottom: 5 }}>
          <span className="k">Household mood</span>
          <span className={`v ${mood <= 1 ? 'red' : mood === 2 ? 'amber' : 'green'}`} title={moodEffect(mood)}>
            {MOOD_LABELS[mood]} · {MOOD_EFFECTS[mood].seen}
          </span>
        </div>
        <MoodBar mood={mood} />
        {(s.caffeinatedUntil ?? 0) > s.minute && (
          <div className="small" style={{ marginTop: 8 }}>
            {`Tea: you're working faster until ${formatClock(s.caffeinatedUntil!)}.`}
          </div>
        )}

        {s.childAwake && (
          <>
            <div className="sectionhead spaced">
              <span className="sectitle">
                <span className="num">03</span>Activities
              </span>
              <span className="status">2 slots</span>
            </div>
            <div className="two-stat">
              <ActivityCard s={s} who="parent" />
              <ActivityCard s={s} who="child" />
            </div>
          </>
        )}

      </div>
    </div>
  );
}

export function LogPanel({ s, head }: { s: GameState; head?: ReactNode }) {
  return (
    <div className="panel frame screen">
      {head}
      <div className="panel-body">
        <div className="sectionhead">
          <span className="sectitle">Morning log</span>
          <span className="status">{s.history.length} entries</span>
        </div>
        <ul className="log">
          {[...s.history].reverse().map((h, i) => (
            <li key={s.history.length - i} className={h.notable ? 'notable' : ''}>
              <span className="t">{formatClock(h.minute)}</span>
              <span>{h.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
