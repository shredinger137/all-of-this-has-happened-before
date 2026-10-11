import { CHECKLIST, CONDITIONS, MOOD_LABELS, TASKS, TENDENCIES } from '../sim/content';
import { formatClock } from '../sim/constants';
import { childRate, childStalled, isGroggy, parentRate, taskDuration } from '../sim/engine';
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

export function StatusPanel({ s }: { s: GameState }) {
  const done = CHECKLIST.filter((t) => s.objectives[t].status === 'done').length;
  const mood = s.householdMood;
  const groggy = isGroggy(s);
  return (
    <div className="panel frame screen">
      <div className="sectionhead">
        <span className="sectitle">
          <span className="num">01</span>At home
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
        <span className={`v ${mood <= 1 ? 'red' : mood === 2 ? 'amber' : 'green'}`}>{MOOD_LABELS[mood]}</span>
      </div>
      <MoodBar mood={mood} />
      {s.coffeeBuffer && <div className="small" style={{ marginTop: 8 }}>Coffee in hand. You'll keep your cool once.</div>}

      {s.childAwake && (
        <>
          <div className="sectionhead spaced">
            <span className="sectitle">
              <span className="num">02</span>Activities
            </span>
            <span className="status">2 slots</span>
          </div>
          <div className="two-stat">
            <ActivityCard s={s} who="parent" />
            <ActivityCard s={s} who="child" />
          </div>
        </>
      )}

      <div className="sectionhead spaced">
        <span className="sectitle">
          <span className="num">{s.childAwake ? '03' : '02'}</span>Morning checklist
        </span>
        <span className={`status ${done === CHECKLIST.length ? 'green' : 'amber'}`}>
          {done} of {CHECKLIST.length}
        </span>
      </div>
      {CHECKLIST.map((id) => {
        const r = objectiveRow(s, id);
        return (
          <div className="row" key={id}>
            <span className="k">
              <span className={`node ${r.node}`} />
              {TASKS[id].label}
            </span>
            <span className={`v ${r.vClass}`}>{r.value}</span>
          </div>
        );
      })}
      <div className="row">
        <span className="k">
          <span className={`node ${s.objectives.shoesFound.status === 'done' ? 'done' : ''}`} />
          Shoes
        </span>
        <span className="v muted">{s.objectives.shoesFound.status === 'done' ? 'Found' : 'Not checked'}</span>
      </div>

      <div className="thin" />
      <details>
        <summary>
          <span className="sectitle">Morning log</span>
        </summary>
        <ul className="log" style={{ marginTop: 10 }}>
          {[...s.history].reverse().map((h, i) => (
            <li key={s.history.length - i} className={h.notable ? 'notable' : ''}>
              <span className="t">{formatClock(h.minute)}</span>
              <span>{h.text}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
