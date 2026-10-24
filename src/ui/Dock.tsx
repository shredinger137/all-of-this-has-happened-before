import { useEffect, useRef, useState } from 'react';
import { CHILD_TASKS, TASKS } from '../sim/content';
import { formatClock, SAFETY_CUTOFF } from '../sim/constants';
import { currentIncident, earliness } from '../sim/engine';
import type { Action, GameState } from '../sim/types';

function leaveWarning(s: GameState): string {
  const missing = CHILD_TASKS.concat(['lunch', 'parentReady'])
    .filter((t) => s.objectives[t].status !== 'done')
    .map((t) => TASKS[t].missing.toLowerCase());
  if (missing.length === 0) return 'Everything important is done.';
  return `Not done: ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? '…' : '.'}`;
}

function wakeWarning(s: GameState): string {
  const e = earliness(s);
  return `More time together. ${e > 0.66 ? 'Likely to be very tired.' : e > 0.33 ? "She'll probably be tired." : 'Slightly early.'}`;
}

/**
 * The commit key: a hinged cover over a lit button, like the guarded switches on a CIC console.
 * Lifting the cover is free and shows what you are committing to; pressing the key acts.
 */
function GuardedSwitch(props: {
  label: string;
  keyLabel: string;
  tone: 'red' | 'amber';
  armed: boolean;
  disabled: boolean;
  onArm: (armed: boolean) => void;
  onCommit: () => void;
}) {
  const keyRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (props.armed) keyRef.current?.focus();
  }, [props.armed]);
  return (
    <div className={`guard ${props.tone} ${props.armed ? 'armed' : ''} ${props.disabled ? 'off' : ''}`}>
      <button ref={keyRef} className="guard-key" tabIndex={props.armed ? 0 : -1} disabled={!props.armed || props.disabled} onClick={props.onCommit}>
        {props.keyLabel}
      </button>
      <button
        className="guard-cover"
        aria-expanded={props.armed}
        disabled={props.disabled}
        onClick={() => props.onArm(!props.armed)}
        onKeyDown={(e) => e.key === 'Escape' && props.onArm(false)}
      >
        <span className="guard-label">{props.label}</span>
        <span className="guard-hint">{props.armed ? 'Close' : 'Lift cover'}</span>
      </button>
    </div>
  );
}

/** Sticky strip along the bottom of the console: latest log line, clock, and the commit switch. */
export function Dock({ s, act }: { s: GameState; act: (a: Action) => void }) {
  const [armed, setArmed] = useState(false);
  // Any change to the morning drops the cover again.
  useEffect(() => setArmed(false), [s]);

  const inc = currentIncident(s);
  const leaving = s.childAwake;
  // You can walk out on most problems, but not the one at the door; waking her waits for quiet.
  const disabled = !!inc && (!leaving || inc.id === 'bathroom');
  const left = s.departureDeadline - s.minute;
  const last = s.history[s.history.length - 1];

  return (
    <div className={`dock frame screen ${armed ? `armed ${leaving ? 'tone-red' : 'tone-amber'}` : ''}`}>
      <div className="dock-time">
        <span className={left < 0 ? 'red' : 'amber'}>{formatClock(s.minute)}</span>
        <span className="micro">{left >= 0 ? `${left} min to leave` : `${-left} min over`}</span>
      </div>
      <div className="dock-text" aria-live="polite">
        {armed ? (
          <>
            <span className="warning">{leaving ? leaveWarning(s) : wakeWarning(s)}</span>{' '}
            <button className="naked" onClick={() => setArmed(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <strong>{formatClock(last.minute)}</strong> &nbsp; {last.text}
            {s.minute >= SAFETY_CUTOFF - 15 && ' It is getting very late.'}
          </>
        )}
      </div>
      <GuardedSwitch
        label={leaving ? 'Leave' : 'Wake her'}
        keyLabel={leaving ? 'Leave now' : 'Wake her'}
        tone={leaving ? 'red' : 'amber'}
        armed={armed}
        disabled={disabled}
        onArm={setArmed}
        onCommit={() => act(leaving ? { type: 'leave' } : { type: 'wakeNow' })}
      />
    </div>
  );
}
