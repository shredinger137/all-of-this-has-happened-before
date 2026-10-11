import { CHILD_TASKS, INCIDENTS, PARENT_TASKS, TASKS, type ResponseDef } from '../sim/content';
import { formatClock } from '../sim/constants';
import {
  childRate,
  childStalled,
  childTaskBlocker,
  currentIncident,
  earliness,
  escalationChance,
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
    <button className="btnline frame" disabled={props.disabled} onClick={props.onClick}>
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
        const resumed = s.objectives[t].progress > 0;
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

// ---------------------------------------------------------------------------

function QuietView({ s, act }: Props) {
  const e = earliness(s);
  const warning = e > 0.66 ? 'Likely to be very tired.' : e > 0.33 ? "She'll probably be tired." : 'Slightly early.';
  return (
    <div className="panel frame screen actions">
      <div className="sectionhead">
        <span className="sectitle">What will you do?</span>
        <span className="status">{s.wakeMinute - s.minute} min until she wakes</span>
      </div>
      <p className="summary">
        You have some uninterrupted time. You won't manage everything. You can also wake her earlier if you think
        you'll need the time.
      </p>
      <ParentTaskButtons s={s} act={act} />
      <p className="small" style={{ margin: '4px 0 0' }}>
        Prep is quicker while she sleeps.
      </p>
      <div className="callout frame">
        <span>
          <div className="label">Wake her now</div>
          <div className="sub">More time together. {warning}</div>
        </span>
        <button className="primary frame" onClick={() => act({ type: 'wakeNow' })}>
          WAKE HER
        </button>
      </div>
      <div className="right">
        <span className="small">Your actions move the clock. Reading and deciding don't.</span>
        <button className="naked" onClick={() => act({ type: 'wait' })}>
          Wait until she wakes →
        </button>
      </div>
    </div>
  );
}

function ActiveView({ s, act }: Props) {
  const ca = s.childActivity;
  const childBusy = !!ca && s.objectives[ca].status === 'active';
  const stalled = childBusy && !!ca && childStalled(s, ca);
  const deferred = s.incidents.filter((i) => i.status === 'deferred');
  const left = s.departureDeadline - s.minute;
  const idle = nothingRunning(s);

  return (
    <div className="panel frame screen actions">
      <div className="sectionhead">
        <span className="sectitle">What next?</span>
        <span className={`status ${left < 0 ? 'red' : left <= 10 ? 'amber' : ''}`}>
          {left >= 0 ? `${left} min to leave` : `${-left} min past leaving time`}
        </span>
      </div>

      <div className="eyebrow group-label">Your daughter</div>
      {childBusy && ca ? (
        <div className="mini frame" style={{ margin: '8px 0', display: 'block' }}>
          <strong>
            {stalled
              ? `${TASKS[ca].doing} · waiting for you`
              : `${TASKS[ca].doing} · about ${Math.max(1, Math.ceil((taskDuration(s, ca) - s.objectives[ca].progress) / childRate(s)))} min left`}
          </strong>
          <div className={`progress ${stalled ? 'paused' : ''}`}>
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

      <div className="callout frame">
        <span>
          <div className="label">Leave for school</div>
          <div className="sub">{leaveWarning(s)}</div>
        </span>
        <button className="primary frame" onClick={() => act({ type: 'leave' })}>
          LEAVE NOW
        </button>
      </div>
    </div>
  );
}

/** Risk band shown before choosing, from the live escalation chance. */
function riskBand(s: GameState, r: ResponseDef): { label: string; cls: string } {
  if (!r.risky) return { label: 'None', cls: 'risk-none' };
  if (s.coffeeBuffer) return { label: 'Low', cls: 'risk-low' }; // coffee absorbs one escalation
  const p = escalationChance(s, r.riskBase);
  if (p < 0.3) return { label: 'Low', cls: 'risk-low' };
  if (p < 0.5) return { label: 'Some', cls: 'risk-moderate' };
  return { label: 'High', cls: 'risk-high' };
}

function ResponseCard({ s, r, onClick }: { s: GameState; r: ResponseDef; onClick: () => void }) {
  const risk = riskBand(s, r);
  return (
    <button className="btnline frame choice" onClick={onClick}>
      <span className="what">
        <span className="label">
          {r.label}
          {r.both && <span className="tag">You both</span>}
        </span>
        <span className={`sub ${r.risky ? 'risky' : ''}`}>{r.hint}</span>
        {r.tags && (
          <span className="outcomes">
            {r.tags.map((t) => (
              <span key={t.text} className={`outcome ${t.tone}`}>
                {t.text}
              </span>
            ))}
          </span>
        )}
      </span>
      <span className="readouts">
        <span className="readout duration">
          Time <b>{r.minutes}m</b>
        </span>
        <span className={`readout ${risk.cls}`}>
          Risk <b>{risk.label}</b>
        </span>
      </span>
    </button>
  );
}

function IncidentView({ s, act, inc }: Props & { inc: OpenIncident }) {
  const def = INCIDENTS[inc.id];
  const urgent = s.minute >= s.departureDeadline;
  const stuck = s.minute - inc.minute;
  return (
    <div className={`crisis frame actions ${urgent ? 'urgent' : ''}`}>
      <div className="crisis-head">
        <span className="tri" aria-hidden>
          ▲
        </span>
        <span className="title">{def.title}</span>
        <span className="code">INC-{String(inc.uid).padStart(2, '0')}</span>
      </div>
      <div className="crisis-body">
        <div className="message">
          <div className="context">{def.context}</div>
          <h2>{def.headline(s)}</h2>
          <p>{inc.note ?? def.detail(s)}</p>
        </div>
        {def.responses
          .filter((r) => !r.available || r.available(s, inc))
          .map((r) => (
            <ResponseCard key={r.id} s={s} r={r} onClick={() => act({ type: 'respond', response: r.id })} />
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
      </div>
      <div className="crisis-foot">
        <span className="micro">
          Logged <b>{formatClock(inc.minute)}</b>
        </span>
        <span className="micro">
          {stuck > 0 ? (
            <>
              Waiting <b>{stuck} min</b>
            </>
          ) : (
            <b>Needs attention</b>
          )}
        </span>
      </div>
    </div>
  );
}

export function ActionPanel({ s, act }: Props) {
  const inc = currentIncident(s);
  if (inc) return <IncidentView s={s} act={act} inc={inc} />;
  return s.childAwake ? <ActiveView s={s} act={act} /> : <QuietView s={s} act={act} />;
}
