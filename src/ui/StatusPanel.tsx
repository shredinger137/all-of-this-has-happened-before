import { CHECKLIST, CONDITIONS, MOOD_LABELS, TASKS, TENDENCIES } from '../sim/content';
import { formatClock } from '../sim/constants';
import { childRate, childStalled, isGroggy, taskDuration } from '../sim/engine';
import type { GameState, TaskId } from '../sim/types';

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
  const label = TASKS[id].label;
  switch (o.status) {
    case 'done':
      return { glyph: '✓', gClass: 'green', label, value: 'Done', vClass: 'muted' };
    case 'skipped':
      return { glyph: '–', gClass: 'muted', label, value: 'Skipped', vClass: 'amber' };
    case 'blocked':
      return { glyph: '◐', gClass: 'amber', label, value: 'Paused', vClass: 'amber' };
    case 'active':
      return { glyph: '◐', gClass: 'amber', label, value: 'In progress', vClass: '' };
    default:
      return o.progress > 0
        ? { glyph: '◔', gClass: 'muted', label, value: 'Part done', vClass: 'muted' }
        : { glyph: '○', gClass: 'muted', label, value: 'Not started', vClass: 'muted' };
  }
}

export function activityText(s: GameState, who: 'parent' | 'child'): string {
  if (who === 'child') {
    if (!s.childAwake) return 'Asleep';
    const ca = s.childActivity;
    if (!ca) return 'Free';
    const o = s.objectives[ca];
    if (o.status === 'blocked') return `${TASKS[ca].doing} · Paused`;
    if (childStalled(s, ca)) return `${TASKS[ca].doing} · Needs you`;
    const left = Math.max(1, Math.ceil((taskDuration(s, ca) - o.progress) / childRate(s)));
    return `${TASKS[ca].doing} · ~${left}m`;
  }
  const pa = s.parentActivity;
  if (!pa) return 'Available';
  if (pa === 'help') return 'Helping her';
  return TASKS[pa].doing;
}

export function StatusPanel({ s }: { s: GameState }) {
  const done = CHECKLIST.filter((t) => s.objectives[t].status === 'done').length;
  const mood = s.householdMood;
  const groggy = isGroggy(s);
  return (
    <div className="panel">
      <div className="sectionhead">
        <span className="sectitle">At home</span>
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
      <div className="row" style={{ marginBottom: 4 }}>
        <span className="k">Household mood</span>
        <span className={`v ${mood <= 1 ? 'red' : mood === 2 ? 'amber' : 'green'}`}>{MOOD_LABELS[mood]}</span>
      </div>
      <MoodBar mood={mood} />
      {s.coffeeBuffer && <div className="small" style={{ marginTop: 8 }}>☕ Coffee in hand. You'll stay calm once.</div>}

      <div className="sectionhead spaced">
        <span className="sectitle">Morning checklist</span>
        <span className={`status ${done === CHECKLIST.length ? 'green' : 'amber'}`}>
          {done} of {CHECKLIST.length}
        </span>
      </div>
      {CHECKLIST.map((id) => {
        const r = objectiveRow(s, id);
        return (
          <div className="row" key={id}>
            <span className="k">
              <span className={`glyph ${r.gClass}`}>{r.glyph}</span>
              {r.label}
            </span>
            <span className={`v ${r.vClass}`}>{r.value}</span>
          </div>
        );
      })}
      <div className="row">
        <span className="k">
          <span className={`glyph ${s.objectives.shoesFound.status === 'done' ? 'green' : 'muted'}`}>
            {s.objectives.shoesFound.status === 'done' ? '✓' : '○'}
          </span>
          Shoes
        </span>
        <span className="v muted">{s.objectives.shoesFound.status === 'done' ? 'Found' : 'Not checked'}</span>
      </div>

      {s.childAwake && (
        <>
          <div className="sectionhead spaced">
            <span className="sectitle">Activities</span>
            <span className="status">2 slots</span>
          </div>
          <div className="two-stat">
            <div className="mini">
              <div className="eyebrow">You</div>
              <strong>{activityText(s, 'parent')}</strong>
            </div>
            <div className="mini">
              <div className="eyebrow">Your daughter</div>
              <strong>{activityText(s, 'child')}</strong>
            </div>
          </div>
        </>
      )}

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
