import { formatClock, SAFETY_CUTOFF } from '../sim/constants';
import { currentIncident, earliness, isGroggy, leaveNowProjection, requirements, type Results } from '../sim/engine';
import type { RunState } from '../sim/run';
import type { Action, GameState, TaskId } from '../sim/types';

const ORDER = { severe: 0, moderate: 1, minor: 2 };

function leaveWarning(s: GameState): string {
  // Known, unfinished things, the ones that matter most first. Loose ends are already lost.
  const missing = requirements(s)
    .filter((r) => r.known && !r.met && (s.objectives[r.id as TaskId] || r.id.startsWith('event:') || r.id === 'coat'))
    .sort((a, b) => ORDER[a.severity] - ORDER[b.severity])
    .map((r) => (r.severity === 'severe' ? `${r.missing.toUpperCase()}` : r.missing.toLowerCase()));
  const unsure = !s.day.eventKnown ? ' School event unconfirmed.' : '';
  if (missing.length === 0) return `Everything known is done.${unsure}`;
  return `Not done: ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? '…' : '.'}${unsure}`;
}

function wakeWarning(s: GameState): string {
  const e = earliness(s);
  return e > 0.66 ? 'She will be very tired.' : e > 0.33 ? "She'll probably be tired." : 'A little early.';
}

/** Indicator lamps on the console housing. */
function Lamps({ s }: { s: GameState }) {
  const lamps = [
    { label: s.childAwake ? 'Awake' : 'Asleep', on: s.childAwake, tone: 'green' },
    { label: 'Groggy', on: isGroggy(s), tone: 'amber' },
    { label: 'Tea', on: (s.caffeinatedUntil ?? 0) > s.minute, tone: 'amber' },
    { label: 'Problem', on: !!currentIncident(s), tone: 'alarm' },
    { label: 'Late', on: s.minute >= s.departureDeadline, tone: 'alarm' },
    { label: 'Incoming', on: !!s.wave, tone: 'alarm' },
  ];
  return (
    <div className="lamps" aria-hidden>
      {lamps.map((l) => (
        <span key={l.label} className={`lamp ${l.on ? `on ${l.tone}` : ''}`}>
          <i />
          {l.label}
        </span>
      ))}
    </div>
  );
}

/** What leaving this minute means: the one number that matters, always in view. */
function Projection({ s }: { s: GameState }) {
  const { arrive, spare, gateShut } = leaveNowProjection(s);
  const tone = spare < 0 ? 'red' : spare <= 5 ? 'amber' : 'green';
  return (
    <div className={`projection ${tone}`}>
      Leave now: in by {formatClock(arrive)} ·{' '}
      {spare >= 0 ? `${spare} min to spare` : `${-spare} min late`}
      {gateShut && ' · gate shut: sign in at the office'}
    </div>
  );
}

/** DRADIS: the next wave, how big, and when it lands. */
function WaveWarning({ s }: { s: GameState }) {
  if (!s.wave) return null;
  const left = s.wave.at - s.minute;
  return (
    <div className="wave-warning">
      {s.wave.size === 1 ? 'Crisis incoming' : `${s.wave.size} crises incoming`} · {left <= 0 ? 'now' : `${left} min`}
    </div>
  );
}

type Props = {
  s: GameState;
  r?: Results;
  act: (a: Action) => void;
  run?: RunState;
  onNext: () => void;
  onRetry: () => void;
  onReplay: () => void;
  departing?: boolean; // the departure sequence is showing; the report is one press away
  onReport?: () => void;
};

/** Status bar along the bottom of the console: lamps, latest message, and the leave (or wake) key. */
export function Dock({ s, r, act, run, onNext, onRetry, onReplay, departing, onReport }: Props) {
  if (r && departing) {
    return (
      <div className="dock frame screen ended">
        <div className="dock-text">
          <div className="dock-log">
            <strong>{formatClock(r.departed)}</strong> &nbsp; Out the door.
          </div>
        </div>
        <button className="dock-key tone-amber" onClick={onReport}>
          Report →
        </button>
      </div>
    );
  }
  if (r) {
    return (
      <div className="dock frame screen ended">
        <div className="dock-text">
          <div className="dock-log">
            <strong>{formatClock(r.arrived)}</strong> &nbsp;{' '}
            {r.lateness > 0 ? 'Morning over. School has begun.' : 'Morning over. The bell has not gone yet.'}
          </div>
        </div>
        {run ? (
          <button className="dock-key tone-amber" onClick={onNext}>
            {s.day.weekday === 4 ? 'Week report →' : 'Evening →'}
          </button>
        ) : (
          <div className="dock-keys">
            <button className="dock-key tone-salmon" onClick={onReplay} title="Same surprises, if you make the same choices">
              Same again
            </button>
            <button className="dock-key tone-amber" onClick={onRetry} title="New seed, new surprises">
              New morning
            </button>
          </div>
        )}
      </div>
    );
  }

  const inc = currentIncident(s);
  const leaving = s.childAwake;
  // You can walk out on most problems, but not the one at the door; waking her waits for quiet.
  const disabled = !!inc && (!leaving || inc.id === 'bathroom');
  const last = s.history[s.history.length - 1];

  return (
    <div className="dock frame screen">
      <Lamps s={s} />
      <div className="dock-text" aria-live="polite">
        <div className="dock-log">
          <strong>{formatClock(last.minute)}</strong> &nbsp; {last.text}
          {s.minute >= SAFETY_CUTOFF - 15 && ' It is getting very late.'}
        </div>
        <WaveWarning s={s} />
        {leaving && <Projection s={s} />}
        <div className="warning">{leaving ? leaveWarning(s) : wakeWarning(s)}</div>
      </div>
      <button
        className={`dock-key ${leaving ? 'tone-red' : 'tone-amber'}`}
        disabled={disabled}
        onClick={() => act(leaving ? { type: 'leave' } : { type: 'wakeNow' })}
      >
        {leaving ? 'Leave now' : 'Wake her'}
      </button>
    </div>
  );
}
