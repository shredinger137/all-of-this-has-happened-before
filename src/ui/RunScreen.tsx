import { useEffect, useState } from 'react';
import { EVENTS, PERKS } from '../sim/content';
import { WEEKDAYS } from '../sim/engine';
import {
  CARDS,
  CARDS_PER_EVENING,
  LATE_MARKS_FOR_MEETING,
  MAX_FATE,
  PROMISE_TEXT,
  type CardId,
  type RunState,
} from '../sim/run';
import type { PerkId } from '../sim/types';

/** Monday to Friday as five pips: green on time, red late, amber today. */
export function WeekStrip({ run, today }: { run: RunState; today?: number }) {
  return (
    <span className="weekstrip" aria-label="This week">
      {WEEKDAYS.map((d, i) => {
        const done = run.weekLog[i];
        const cls = done ? (done.lateness > 0 ? 'late' : 'ok') : i === today ? 'today' : '';
        return (
          <i key={d} className={cls} title={done ? `${d}: ${done.grade}${done.lateness > 0 ? `, ${done.lateness} min late` : ''}` : d}>
            {d[0]}
          </i>
        );
      })}
    </span>
  );
}

export function FatePips({ fate }: { fate: number }) {
  return (
    <span className="fate" title={`Fate points: ${fate} of ${MAX_FATE}. Spend one to confirm intel or make a risky call go your way.`}>
      Fate
      {Array.from({ length: MAX_FATE }, (_, i) => (
        <i key={i} className={i < fate ? 'on' : ''} />
      ))}
    </span>
  );
}

function Card(props: { title: string; note: string; tag?: string; on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button className={`btnline frame card ${props.on ? 'picked' : ''}`} aria-pressed={props.on} disabled={props.disabled} onClick={props.onClick}>
      <span>
        <span className="label">
          {props.title}
          {props.tag && <span className="tag">{props.tag}</span>}
        </span>
        <span className="sub">{props.note}</span>
      </span>
      <span className="cost">{props.on ? '■' : '□'}</span>
    </button>
  );
}

function Evening({ run, picks, toggle }: { run: RunState; picks: CardId[]; toggle: (c: CardId) => void }) {
  const last = run.weekLog.at(-1);
  const sunday = run.weekLog.length === 0;
  return (
    <div className="panel frame screen">
      <div className="sectionhead">
        <span className="sectitle">{sunday ? 'Sunday night' : 'Tonight'}</span>
        <span className="status">
          Pick {CARDS_PER_EVENING} for tomorrow · {picks.length} of {CARDS_PER_EVENING}
        </span>
      </div>
      <div className="panel-body">
        {last && (
          <p className="summary">
            {last.label}: {last.lateness > 0 ? `${last.lateness} minutes late` : 'on time'}, {last.grade.toLowerCase()}.
            {last.event ? ` ${EVENTS[last.event].name}.` : ''}
            {run.overdueBook ? ' The library book is still at home. It is overdue now.' : ''}
          </p>
        )}
        {run.promises.length > 0 && (
          <p className="summary amber">You promised her {run.promises.map((p) => PROMISE_TEXT[p]).join(' and ')}. She will remember.</p>
        )}
        <div className="bank">
          {run.offer.map((c) => (
            <Card
              key={c}
              title={CARDS[c].name}
              note={CARDS[c].note}
              tag={c === 'promise' ? 'Promise' : undefined}
              on={picks.includes(c)}
              disabled={!picks.includes(c) && picks.length >= CARDS_PER_EVENING}
              onClick={() => toggle(c)}
            />
          ))}
        </div>
        <p className="small">Whatever you don't do tonight is still there in the morning.</p>
      </div>
    </div>
  );
}

function Weekly({ run, perk, setPerk }: { run: RunState; perk?: PerkId; setPerk: (p: PerkId) => void }) {
  const late = run.weekLog.filter((d) => d.lateness > 0).length;
  const total = run.weekLog.reduce((n, d) => n + d.score, 0);
  return (
    <div className="panel frame screen">
      <div className="sectionhead">
        <span className="sectitle">Week {run.week} in review</span>
        <span className={`status ${late >= LATE_MARKS_FOR_MEETING ? 'red' : late ? 'amber' : 'green'}`}>
          {late} {late === 1 ? 'tardy' : 'tardies'}
        </span>
      </div>
      <div className="panel-body">
        <table className="weektable">
          <tbody>
            {run.weekLog.map((d) => (
              <tr key={d.label}>
                <th>{d.label}</th>
                <td>{d.event ? EVENTS[d.event].name : '—'}</td>
                <td className={d.lateness > 0 ? 'red' : 'green'}>{d.lateness > 0 ? `+${d.lateness} min` : 'On time'}</td>
                <td>{d.severeMisses ? `${d.severeMisses} missed` : ''}</td>
                <td className="num">{d.score}</td>
              </tr>
            ))}
            <tr className="total">
              <th>Week</th>
              <td />
              <td />
              <td />
              <td className="num">{total}</td>
            </tr>
          </tbody>
        </table>
        {run.meetingMonday && (
          <p className="summary red">
            {late} tardies. The principal would like a word on Monday: be there by 07:50.
          </p>
        )}
        {run.perkOffer.length > 0 && (
          <>
            <div className="eyebrow group-label">Over the weekend, sort out one thing</div>
            <div className="bank">
              {run.perkOffer.map((p) => (
                <Card key={p} title={PERKS[p].name} note={PERKS[p].note} tag="Permanent" on={perk === p} onClick={() => setPerk(p)} />
              ))}
            </div>
          </>
        )}
        {run.perks.length > 0 && (
          <p className="small">Around the house: {run.perks.map((p) => PERKS[p].name.toLowerCase()).join(', ')}.</p>
        )}
      </div>
    </div>
  );
}

type Props = { run: RunState; onCards: (picks: CardId[]) => void; onPerk: (p?: PerkId) => void };

/** Between mornings: the evening's preparations, or the end-of-week report. */
export function RunScreen({ run, onCards, onPerk }: Props) {
  const [picks, setPicks] = useState<CardId[]>([]);
  const [perk, setPerk] = useState<PerkId>();
  useEffect(() => {
    setPicks([]);
    setPerk(undefined);
  }, [run.phase, run.daysPlayed, run.week]);

  const weekly = run.phase === 'weekly';
  const toggle = (c: CardId) =>
    setPicks((p) => (p.includes(c) ? p.filter((x) => x !== c) : p.length < CARDS_PER_EVENING ? [...p, c] : p));
  const tomorrow = WEEKDAYS[(run.weekday + 1) % 5];

  return (
    <div className="terminal frame">
      <header className="head">
        <div className="head-title">
          <div className="eyebrow head-eyebrow">
            <span>
              Week {run.week} · {weekly ? 'Friday' : run.weekLog.length ? WEEKDAYS[run.weekday] : 'Sunday'}
            </span>
            <WeekStrip run={run} />
            <FatePips fate={run.fate} />
          </div>
          <h1>{weekly ? 'Week report' : 'Evening'}</h1>
          <div className="small">{weekly ? 'Five mornings. All of them survived.' : `Get ahead of ${tomorrow}.`}</div>
        </div>
        <div className="timebox frame screen">
          <div className="time">{weekly ? '17:00' : '20:30'}</div>
          <div className="time-sub">{weekly ? 'Friday' : 'Bedtime soon'}</div>
        </div>
      </header>

      <div className="workarea report">
        {weekly ? <Weekly run={run} perk={perk} setPerk={setPerk} /> : <Evening run={run} picks={picks} toggle={toggle} />}
      </div>

      <div className="dock frame screen ended">
        <div className="dock-text">
          <div className="dock-log">
            {weekly
              ? run.perkOffer.length
                ? perk
                  ? `${PERKS[perk].name}. ${PERKS[perk].note}`
                  : 'Choose one thing to sort out over the weekend.'
                : 'Nothing left to sort out. The house runs itself. Nearly.'
              : picks.length
                ? `Tonight: ${picks.map((c) => CARDS[c].name.toLowerCase()).join(', ')}.`
                : 'Nothing done tonight. Tomorrow starts from scratch.'}
          </div>
        </div>
        {weekly ? (
          <button className="dock-key tone-amber" disabled={run.perkOffer.length > 0 && !perk} onClick={() => onPerk(perk)}>
            Weekend →
          </button>
        ) : (
          <button className="dock-key tone-amber" onClick={() => onCards(picks)}>
            Bed → {tomorrow}
          </button>
        )}
      </div>
    </div>
  );
}
