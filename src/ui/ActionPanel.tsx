import { useState } from 'react';
import { BREAKFAST_ORDER, BREAKFASTS, CHILD_TASKS, INCIDENTS, INTEL_TASKS, PARENT_TASKS, TASKS, type ResponseDef } from '../sim/content';
import { formatClock } from '../sim/constants';
import {
  childRate,
  childStalled,
  childTaskBlocker,
  currentIncident,
  escalationChance,
  nothingRunning,
  offered,
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

/** What to make. She has a preference today; you may only have a clue. */
function BreakfastChooser({ s, act, close }: Props & { close: () => void }) {
  const asked = s.flags.includes('askedBreakfast');
  return (
    <div className="chooser frame">
      <div className="chooser-head">
        <span>Make breakfast: what?</span>
        <button className="naked" onClick={close}>
          Cancel
        </button>
      </div>
      <div className="bank">
        {BREAKFAST_ORDER.map((b) => (
          <ChoiceButton
            key={b}
            label={BREAKFASTS[b].name}
            sub={asked && b === s.breakfastWant ? 'What she asked for' : b === 'pancakes' ? 'Slow. A treat' : b === 'cereal' ? 'Quick. Slower to eat' : 'A safe bet?'}
            cost={`${Math.max(1, Math.ceil(BREAKFASTS[b].minutes / parentRate(s)))} MIN`}
            onClick={() => {
              close();
              act({ type: 'startParent', task: 'breakfastMade', variant: b });
            }}
          />
        ))}
        {s.childAwake && !asked && (
          <ChoiceButton label="Ask her first" sub="She knows exactly what she wants. Takes you both" cost="1 MIN" onClick={() => act({ type: 'askBreakfast' })} />
        )}
      </div>
    </div>
  );
}

function ParentTaskButtons({ s, act }: Props) {
  const [choosing, setChoosing] = useState(false);
  if (choosing) return <BreakfastChooser s={s} act={act} close={() => setChoosing(false)} />;
  return (
    <>
      {[...PARENT_TASKS, ...INTEL_TASKS].filter((t) => offered(s, t) && s.objectives[t].status !== 'done').map((t) => {
        const blocker = parentTaskBlocker(s, t);
        const resumed = s.objectives[t].progress > 0;
        if (t === 'breakfastMade' && !resumed) {
          return (
            <ChoiceButton
              key={t}
              label="Make breakfast…"
              sub={blocker ?? 'Choose what. She may want something else'}
              cost="2–12 MIN"
              disabled={!!blocker}
              onClick={() => setChoosing(true)}
            />
          );
        }
        return (
          <ChoiceButton
            key={t}
            label={resumed ? `Finish: ${TASKS[t].action.toLowerCase()}` : TASKS[t].action}
            sub={blocker ?? TASKS[t].hint(s)}
            cost={`${remaining(s, t)} MIN`}
            tag={TASKS[t].intel ? 'Intel' : undefined}
            disabled={!!blocker}
            onClick={() => act({ type: 'startParent', task: t })}
          />
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------

function QuietView({ s, act }: Props) {
  return (
    <div className="panel frame screen actions">
      <div className="sectionhead">
        <span className="sectitle">What will you do?</span>
        <span className="status">{s.wakeMinute - s.minute} min until she wakes</span>
      </div>
      <div className="panel-body">
        <p className="summary">
          You have some uninterrupted time. You won't manage everything. You can also wake her earlier if you think
          you'll need the time.
        </p>
        <div className="bank">
          <ParentTaskButtons s={s} act={act} />
        </div>
        <p className="small" style={{ margin: '4px 0 0' }}>
          Prep is quicker while she sleeps. To wake her early, use the key in the status bar.
        </p>
        <div className="right">
          <span className="small">Your actions move the clock. Reading and deciding don't.</span>
          <button className="naked" onClick={() => act({ type: 'wait' })}>
            Wait until she wakes →
          </button>
        </div>
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
      <div className="panel-body">

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
        <div className="bank">
          {CHILD_TASKS.filter((t) => offered(s, t) && !['done', 'skipped'].includes(s.objectives[t].status) && t !== ca).map((t) => {
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
        </div>

        {deferred.length > 0 && (
          <>
            <div className="eyebrow group-label">Put off</div>
            <div className="bank">
              {deferred.map((inc) => (
                <ChoiceButton
                  key={inc.uid}
                  label={`Deal with: ${INCIDENTS[inc.id].title.toLowerCase()}`}
                  sub={inc.note ?? INCIDENTS[inc.id].headline(s)}
                  cost={formatClock(inc.minute)}
                  onClick={() => act({ type: 'reopen', uid: inc.uid })}
                />
              ))}
            </div>
          </>
        )}

        <div className="eyebrow group-label">You</div>
        {s.parentActivity && s.parentActivity !== 'help' && (
          <p className="small" style={{ margin: '6px 0' }}>
            Currently: {TASKS[s.parentActivity].doing.toLowerCase()}.
          </p>
        )}
        <div className="bank">
          <ParentTaskButtons s={s} act={act} />
          <ChoiceButton
            label={idle ? 'Wait a few minutes' : 'Carry on'}
            sub={idle ? 'Nothing is happening. Time still passes' : 'Until something needs you'}
            cost={idle ? '5 MIN' : '…'}
            onClick={() => act({ type: 'wait' })}
          />
        </div>
      </div>
    </div>
  );
}

/** Chance a response upsets her, from the live escalation model. Coffee or fate takes it to zero. */
function riskBand(s: GameState, r: ResponseDef, fated: boolean): { label: string; cls: string } {
  if (!r.risky) return { label: '—', cls: 'risk-none' };
  if (fated) return { label: 'Fate', cls: 'risk-fate' };
  if (s.coffeeBuffer) return { label: 'Coffee', cls: 'risk-low' }; // coffee absorbs one escalation
  const p = escalationChance(s, r.riskBase);
  const label = `${Math.round(p * 100)}%`;
  if (p < 0.3) return { label, cls: 'risk-low' };
  if (p < 0.5) return { label, cls: 'risk-moderate' };
  return { label, cls: 'risk-high' };
}

function ResponseCard({ s, inc, r, fated, onClick }: { s: GameState; inc: OpenIncident; r: ResponseDef; fated: boolean; onClick: () => void }) {
  const risk = riskBand(s, r, fated && !!r.risky);
  return (
    <button className="btnline frame choice" onClick={onClick}>
      <span className="what">
        <span className="label">
          {r.labelFor ? r.labelFor(s, inc) : r.label}
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
          Time <b>{r.minutesFor?.(s) ?? r.minutes}m</b>
        </span>
        <span className={`readout ${risk.cls}`}>
          Upset <b>{risk.label}</b>
        </span>
      </span>
    </button>
  );
}

function IncidentView({ s, act, inc }: Props & { inc: OpenIncident }) {
  const def = INCIDENTS[inc.id];
  const urgent = s.minute >= s.departureDeadline;
  const stuck = s.minute - inc.minute;
  // Fate: arm it, then pick a risky response. It is certain to go your way.
  const [fated, setFated] = useState(false);
  const options = def.responses.filter((r) => !r.available || r.available(s, inc));
  const anyRisky = options.some((r) => r.risky);
  const waiting = s.incidents.filter((i) => i.status === 'open').length - 1;
  return (
    <div className={`crisis frame actions ${urgent || inc.worse ? 'urgent' : ''}`}>
      <div className="crisis-head">
        <span className="tri" aria-hidden>
          ▲
        </span>
        <span className="title">
          {def.title}
          {inc.worse && ' · worse'}
        </span>
        {waiting > 0 && <span className="queue">+{waiting} waiting</span>}
        <span className="code">INC-{String(inc.uid).padStart(2, '0')}</span>
      </div>
      <div className="crisis-body">
        <div className="message">
          <div className="context">{inc.worse ? 'Put off. Now back' : def.context}</div>
          {def.speaks ? (
            <>
              <h2>“{inc.note ?? def.detail(s)}”</h2>
              <p>{def.headline(s)}</p>
            </>
          ) : (
            <>
              <h2>{def.headline(s)}</h2>
              <p>{inc.note ?? def.detail(s)}</p>
            </>
          )}
        </div>
        {options.map((r) => (
          <ResponseCard
            key={r.id}
            s={s}
            inc={inc}
            r={r}
            fated={fated}
            onClick={() => act({ type: 'respond', response: r.id, fate: fated && !!r.risky })}
          />
        ))}
        {anyRisky && s.fate > 0 && (
          <button className={`fate-toggle ${fated ? 'on' : ''}`} aria-pressed={fated} onClick={() => setFated(!fated)}>
            <i />
            {fated ? 'Fate armed: the next risky choice goes your way' : `Spend a fate point (${s.fate} left) on a risky choice`}
          </button>
        )}
        <div className="right">
          {def.deferrable ? (
            <button className="naked" onClick={() => act({ type: 'defer' })}>
              Deal with it later
            </button>
          ) : (
            <span />
          )}
          {inc.id !== 'bathroom' && <span className="small">Or leave it and go: the key in the status bar still works.</span>}
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

/** What your choice did. Stays until you carry on, so every choice has a visible result. */
function OutcomeView({ s, act }: Props) {
  const o = s.outcome!;
  const next = currentIncident(s);
  return (
    <div className={`crisis frame actions outcome ${o.good ? 'good' : 'bad'}`}>
      <div className="crisis-head">
        <span className="tri" aria-hidden>
          ■
        </span>
        <span className="title">Result · {o.title}</span>
      </div>
      <div className="crisis-body">
        <div className="message">
          <div className="context">You: {o.choice.toLowerCase()}</div>
          {o.lines.map((l, i) => (
            <p key={i} className={i === o.lines.length - 1 ? 'last' : ''}>
              {l}
            </p>
          ))}
        </div>
        <div className="costs">
          {o.costs.map((c) => (
            <span key={c} className="cost-chip">
              {c}
            </span>
          ))}
        </div>
        <button className="btnline frame continue" autoFocus onClick={() => act({ type: 'ack' })}>
          <span>
            <span className="label">{next ? `Next: ${INCIDENTS[next.id].title.toLowerCase()}` : 'Carry on'}</span>
            <span className="sub">{next ? 'Something else needs you' : 'Back to the morning'}</span>
          </span>
          <span className="cost">→</span>
        </button>
      </div>
    </div>
  );
}

export function ActionPanel({ s, act }: Props) {
  if (s.outcome) return <OutcomeView s={s} act={act} />;
  const inc = currentIncident(s);
  // Keyed so each new problem re-runs the alert flash.
  if (inc) return <IncidentView key={inc.uid} s={s} act={act} inc={inc} />;
  return s.childAwake ? <ActiveView s={s} act={act} /> : <QuietView s={s} act={act} />;
}
