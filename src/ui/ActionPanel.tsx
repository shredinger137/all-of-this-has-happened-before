import { CHILD_TASKS, INCIDENTS, PARENT_TASKS, TASKS } from '../sim/content';
import { formatClock } from '../sim/constants';
import {
  childRate,
  childTaskBlocker,
  currentIncident,
  childStalled,
  earliness,
  nothingRunning,
  parentRate,
  parentTaskBlocker,
  taskDuration,
} from '../sim/engine';
import type { Action, GameState, OpenIncident, TaskId } from '../sim/types';

type Props = { s: GameState; act: (a: Action) => void };

function ChoiceButton(props: {
  label: string;
  sub?: string;
  cost?: string;
  risky?: boolean;
  tag?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button className="btnline" disabled={props.disabled} onClick={props.onClick}>
      <span>
        <span className="label">
          {props.label}
          {props.tag && <span className="tag">{props.tag}</span>}
        </span>
        {props.sub && <span className={`sub ${props.risky ? 'risky' : ''}`}>{props.sub}</span>}
      </span>
      {props.cost && <span className="cost">{props.cost}</span>}
    </button>
  );
}

/** Clock minutes a parent task will take from here. */
function remaining(s: GameState, t: TaskId) {
  return Math.max(1, Math.ceil((taskDuration(s, t) - s.objectives[t].progress) / parentRate(s) - 1e-6));
}

function ParentTaskButtons({ s, act }: Props) {
  return (
    <>
      {PARENT_TASKS.filter((t) => s.objectives[t].status !== 'done').map((t) => {
        const blocker = parentTaskBlocker(s, t);
        const o = s.objectives[t];
        const resumed = o.progress > 0;
        return (
          <ChoiceButton
            key={t}
            label={resumed ? `Finish: ${TASKS[t].action.toLowerCase()}` : TASKS[t].action}
            sub={blocker ?? TASKS[t].hint(s)}
            cost={`${remaining(s, t)} MIN`}
            disabled={!!blocker}
            onClick={() => act({ type: 'startParent', task: t })}
          />
        );
      })}
    </>
  );
}

function leaveWarning(s: GameState): string {
  const missing = CHILD_TASKS.concat(['lunch', 'parentReady'])
    .filter((t) => s.objectives[t].status !== 'done')
    .map((t) => TASKS[t].missing.toLowerCase());
  if (missing.length === 0) return 'Everything important is done.';
  return `Not done: ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? '…' : ''}.`;
}

function minutesToLeave(s: GameState) {
  return s.departureDeadline - s.minute;
}

// ---------------------------------------------------------------------------

function QuietView({ s, act }: Props) {
  const e = earliness(s);
  const warning = e > 0.66 ? 'Likely to be very tired.' : e > 0.33 ? "She'll probably be tired." : 'Slightly early.';
  return (
    <>
      <div className="sectionhead">
        <span className="sectitle">What will you do?</span>
        <span className="status">{s.wakeMinute - s.minute} min until she wakes</span>
      </div>
      <p className="summary">
        You have some uninterrupted time. You won't manage everything. You can also wake her earlier if you think
        you'll need the time.
      </p>
      <ParentTaskButtons s={s} act={act} />
      <p className="small" style={{ margin: '4px 0 0' }}>Prep is quicker while she sleeps.</p>
      <div className="callout">
        <span>
          <div className="label">Wake her now</div>
          <div className="sub">More time together. {warning}</div>
        </span>
        <button className="primary" onClick={() => act({ type: 'wakeNow' })}>
          WAKE HER
        </button>
      </div>
      <div className="right">
        <span className="small">Your actions move the clock. Reading and deciding don't.</span>
        <button className="naked" onClick={() => act({ type: 'wait' })}>
          Wait until she wakes →
        </button>
      </div>
    </>
  );
}

function ActiveView({ s, act }: Props) {
  const ca = s.childActivity;
  const childBusy = ca && s.objectives[ca].status === 'active';
  const stalled = !!ca && childBusy && childStalled(s, ca);
  const deferred = s.incidents.filter((i) => i.status === 'deferred');
  const left = minutesToLeave(s);
  const idle = nothingRunning(s);

  return (
    <>
      <div className="sectionhead">
        <span className="sectitle">What next?</span>
        <span className={`status ${left < 0 ? 'red' : left <= 10 ? 'amber' : ''}`}>
          {left >= 0 ? `${left} min to leave` : `${-left} min past leaving time`}
        </span>
      </div>

      <div className="eyebrow group-label">Your daughter</div>
      {childBusy && ca ? (
        <div className="mini" style={{ margin: '8px 0' }}>
          <strong>
            {TASKS[ca].doing} · about {Math.max(1, Math.ceil((taskDuration(s, ca) - s.objectives[ca].progress) / childRate(s)))} min left
          </strong>
          <div className="progress">
            <span style={{ width: `${Math.min(100, (100 * s.objectives[ca].progress) / taskDuration(s, ca))}%` }} />
          </div>
          {s.parentActivity !== 'help' && (
            <ChoiceButton
              label={stalled ? 'Carry on with her' : 'Help her'}
              sub={stalled ? "This needs you. It won't happen otherwise" : 'Faster together, but you do nothing else'}
              cost="UNTIL DONE"
              onClick={() => act({ type: 'help' })}
            />
          )}
        </div>
      ) : (
        <p className="summary" style={{ margin: '6px 0 0' }}>
          She's free. Giving her something to do takes no time.
        </p>
      )}
      {CHILD_TASKS.filter((t) => !['done', 'skipped'].includes(s.objectives[t].status) && t !== ca).map((t) => {
        const blocker = childTaskBlocker(s, t);
        const rate = TASKS[t].supervised ? childRate({ ...s, parentActivity: 'help' }) : childRate(s);
        const est = Math.ceil((taskDuration(s, t) - s.objectives[t].progress) / rate);
        return (
          <ChoiceButton
            key={t}
            label={childBusy ? `Switch to: ${TASKS[t].action.toLowerCase()}` : TASKS[t].action}
            sub={blocker ?? TASKS[t].hint(s)}
            cost={`~${est} MIN`}
            tag={TASKS[t].supervised ? 'You both' : undefined}
            disabled={!!blocker}
            onClick={() => act({ type: 'assignChild', task: t })}
          />
        );
      })}

      {deferred.length > 0 && (
        <>
          <div className="eyebrow group-label">Put off</div>
          {deferred.map((inc) => (
            <ChoiceButton
              key={inc.uid}
              label={`Deal with: ${INCIDENTS[inc.id].title.toLowerCase()}`}
              sub={inc.note ?? INCIDENTS[inc.id].headline(s)}
              cost={formatClock(inc.minute)}
              onClick={() => act({ type: 'reopen', uid: inc.uid })}
            />
          ))}
        </>
      )}

      <div className="eyebrow group-label">You</div>
      {s.parentActivity && s.parentActivity !== 'help' && (
        <p className="small" style={{ margin: '6px 0' }}>
          Currently: {TASKS[s.parentActivity].doing.toLowerCase()}.
        </p>
      )}
      <ParentTaskButtons s={s} act={act} />
      <ChoiceButton
        label={idle ? 'Wait a few minutes' : 'Carry on'}
        sub={idle ? 'Nothing is happening. Time still passes' : 'Until something needs you'}
        cost={idle ? '5 MIN' : '…'}
        onClick={() => act({ type: 'wait' })}
      />

      <div className="callout">
        <span>
          <div className="label">Leave for school</div>
          <div className="sub">{leaveWarning(s)}</div>
        </span>
        <button className="primary" onClick={() => act({ type: 'leave' })}>
          LEAVE NOW
        </button>
      </div>
    </>
  );
}

function IncidentView({ s, act, inc }: Props & { inc: OpenIncident }) {
  const def = INCIDENTS[inc.id];
  return (
    <>
      <div className="sectionhead">
        <span className="sectitle">Current situation</span>
        <span className="risk">NEEDS ATTENTION</span>
      </div>
      <div className="situation">
        <div className="eyebrow">{def.context}</div>
        <h2>{def.headline(s)}</h2>
        <p>{inc.note ?? def.detail(s)}</p>
      </div>
      {def.responses
        .filter((r) => !r.available || r.available(s, inc))
        .map((r) => (
          <ChoiceButton
            key={r.id}
            label={r.label}
            sub={r.hint}
            risky={r.risky}
            tag={r.both ? 'You both' : undefined}
            cost={`${r.minutes} MIN`}
            onClick={() => act({ type: 'respond', response: r.id })}
          />
        ))}
      <div className="right">
        {def.deferrable ? (
          <button className="naked" onClick={() => act({ type: 'defer' })}>
            Deal with it later
          </button>
        ) : (
          <span />
        )}
        {inc.id !== 'bathroom' && (
          <button className="naked" onClick={() => act({ type: 'leave' })}>
            Leave for school →
          </button>
        )}
      </div>
    </>
  );
}

export function ActionPanel({ s, act }: Props) {
  const inc = currentIncident(s);
  return (
    <div className="panel actions">
      {inc ? <IncidentView s={s} act={act} inc={inc} /> : s.childAwake ? <ActiveView s={s} act={act} /> : <QuietView s={s} act={act} />}
    </div>
  );
}
