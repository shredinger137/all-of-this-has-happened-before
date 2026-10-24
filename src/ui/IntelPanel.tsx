import type { ReactNode } from 'react';
import { EVENTS, TASKS } from '../sim/content';
import { formatClock } from '../sim/constants';
import { currentIncident, offered, parentRate, suspectedEvents } from '../sim/engine';
import type { Action, GameState, Intel, TaskId } from '../sim/types';

/** Reliability grade color: confirmed (A), plausible (B–C), doubtful (D–F). */
function gradeTone(grade: string): string {
  const g = grade[0];
  return g === 'A' ? 'good' : g === 'B' || g === 'C' ? 'fair' : 'poor';
}

function IntelRow({ i }: { i: Intel }) {
  return (
    <li className={`intel ${gradeTone(i.grade)}`}>
      <span className="grade" title="Reliability">
        {i.grade}
      </span>
      <span className="what">
        <span className="source">
          {i.source} <span className="t">{formatClock(i.minute)}</span>
        </span>
        <span className="text">{i.text}</span>
      </span>
    </li>
  );
}

function IntelButton(props: { label: string; sub: string; cost: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button className="btnline frame" disabled={props.disabled} onClick={props.onClick}>
      <span>
        <span className="label">
          {props.label}
          <span className="tag">Intel</span>
        </span>
        <span className="sub">{props.sub}</span>
      </span>
      <span className="cost">{props.cost}</span>
    </button>
  );
}

/** The morning briefing: what today might need, how sure you are, and what it costs to be surer. */
export function IntelPanel({ s, act, head }: { s: GameState; act: (a: Action) => void; head?: ReactNode }) {
  const d = s.day;
  const busy = !!currentIncident(s) || s.ended;
  const sus = suspectedEvents(s);
  const task = (t: TaskId) => `${Math.max(1, Math.ceil(TASKS[t].duration(s) / parentRate(s)))} MIN`;
  const eventLine = d.eventKnown
    ? d.event
      ? EVENTS[d.event].name
      : 'Nothing special'
    : sus.length
      ? `${sus.map((e) => EVENTS[e].name).join(' or ')}?`
      : 'Probably nothing';
  const weatherLine = d.weatherKnown
    ? d.weather === 'rain'
      ? 'Raining'
      : d.weather === 'cold'
        ? 'Dry, cold'
        : 'Dry'
    : `${Math.round(d.rainChance * 100)}% rain${d.weather === 'cold' ? ', cold' : ''}`;

  return (
    <div className="panel frame screen">
      {head}
      <div className="panel-body">
        <div className="sectionhead">
          <span className="sectitle">
            <span className="num">01</span>Today
          </span>
          <span className="status">{d.label}</span>
        </div>
        <div className="row">
          <span className="k">At school</span>
          <span className={`v ${d.eventKnown ? 'green' : 'amber'}`}>
            {eventLine}
            {!d.eventKnown && <span className="unconfirmed">Unconfirmed</span>}
          </span>
        </div>
        <div className="row">
          <span className="k">Weather</span>
          <span className={`v ${d.weatherKnown || d.rainChance < 0.2 ? 'green' : 'amber'}`}>
            {weatherLine}
            {!d.weatherKnown && <span className="unconfirmed">Forecast</span>}
          </span>
        </div>
        {d.meeting && (
          <div className="row">
            <span className="k">Principal</span>
            <span className="v red">Be there by 07:50</span>
          </div>
        )}

        <div className="sectionhead spaced">
          <span className="sectitle">
            <span className="num">02</span>Intel
          </span>
          <span className="status">{s.intel.length} reports</span>
        </div>
        <ul className="intel-list">
          {[...s.intel].reverse().map((i) => (
            <IntelRow key={i.id} i={i} />
          ))}
        </ul>

        {(offered(s, 'email') || offered(s, 'window') || !d.eventKnown) && (
          <>
            <div className="sectionhead spaced">
              <span className="sectitle">
                <span className="num">03</span>Confirm
              </span>
              <span className="status">Costs time</span>
            </div>
            {offered(s, 'email') && (
              <IntelButton
                label="Read the school email"
                sub="Certain. Says exactly what's on"
                cost={task('email')}
                disabled={busy}
                onClick={() => act({ type: 'startParent', task: 'email' })}
              />
            )}
            {offered(s, 'window') && (
              <IntelButton
                label="Look outside"
                sub="Certain. Is it actually raining?"
                cost={task('window')}
                disabled={busy}
                onClick={() => act({ type: 'startParent', task: 'window' })}
              />
            )}
            {!d.eventKnown && (
              <IntelButton
                label="Ask her"
                sub={
                  !s.childAwake
                    ? "She's asleep"
                    : s.flags.includes('askedHer')
                      ? 'Already asked'
                      : 'Very confident. Not always right. Takes you both'
                }
                cost="1 MIN"
                disabled={busy || !s.childAwake || s.flags.includes('askedHer')}
                onClick={() => act({ type: 'ask' })}
              />
            )}
            {!d.eventKnown && (
              <IntelButton
                label="Message another parent"
                sub={s.fate > 0 ? 'Certain, and takes no time. Costs a fate point' : 'Needs a fate point'}
                cost="1 FATE"
                disabled={busy || s.fate <= 0}
                onClick={() => act({ type: 'favor' })}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
