import { useEffect, useState } from 'react';
import { formatClock, START_MINUTE } from '../sim/constants';
import { currentIncident, results } from '../sim/engine';
import type { Action, GameState } from '../sim/types';
import { ActionPanel } from './ActionPanel';
import { Debrief } from './Debrief';
import { Departure } from './Departure';
import { Dock } from './Dock';
import { MorningPlot } from './MorningPlot';
import { IntelPanel } from './IntelPanel';
import { LogPanel, StatusPanel, checklistCount } from './StatusPanel';
import { WeekStrip, FatePips } from './RunScreen';
import type { RunState } from '../sim/run';

const SEGMENT_MINUTES = 5;
// Below this width the two screens don't fit side by side, so they become tabs. Matches styles.css.
const NARROW = '(max-width: 730px)';

function headline(s: GameState): { title: string; sub: string } {
  if (s.ended) return { title: 'Out the door', sub: 'On the way to school.' };
  if (!s.childAwake) return { title: 'Before she wakes up', sub: 'The house is quiet. She usually wakes around 7.' };
  const left = s.departureDeadline - s.minute;
  if (currentIncident(s)) return { title: 'Getting ready', sub: left > 0 ? "There's still time, but not much." : 'You should already be gone.' };
  if (left < 0) return { title: 'Running late', sub: "You're late." };
  if (left <= 10) return { title: 'Nearly time', sub: "It's almost time to leave." };
  return { title: 'Getting ready', sub: "She's up." };
}

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(NARROW).matches);
  useEffect(() => {
    const m = window.matchMedia(NARROW);
    const update = () => setNarrow(m.matches);
    m.addEventListener('change', update);
    return () => m.removeEventListener('change', update);
  }, []);
  return narrow;
}

type Tab = 'actions' | 'intel' | 'status' | 'log';
const TAB_LABELS: Record<Tab, string> = { actions: 'Actions', intel: 'Intel', status: 'Checklist', log: 'Log' };

type TabsProps = { tabs: Tab[]; value: Tab; onChange: (t: Tab) => void; alert?: Tab; count?: string };
function Tabs({ tabs, value, onChange, alert, count }: TabsProps) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t}
          role="tab"
          aria-selected={t === value}
          className={`tab ${t === value ? 'on' : ''} ${t === alert ? 'alert' : ''}`}
          onClick={() => onChange(t)}
        >
          {TAB_LABELS[t]}
          {t === 'status' && count && <span className="tab-count">{count}</span>}
        </button>
      ))}
    </div>
  );
}

type Props = {
  game: GameState;
  seed: number;
  act: (a: Action) => void;
  run?: RunState; // absent for a standalone drill
  onNext: () => void; // run: on to the evening
  onRetry: () => void; // drill: a new morning
  onReplay: () => void; // drill: the same morning again
};

/** The console itself: housing, clock, plot, screens, status bar. Pure view of a game state. */
export function GameScreen({ game, seed, act, run, onNext, onRetry, onReplay }: Props) {
  const narrow = useNarrow();
  // The briefing comes first: on a phone the actions, on a wide screen the intel beside them.
  const [tab, setTab] = useState<Tab>(narrow ? 'actions' : 'intel');
  const inc = currentIncident(game);

  // A new problem always brings the actions screen forward on a phone.
  useEffect(() => {
    if (inc && narrow) setTab('actions');
  }, [inc?.uid, narrow]);
  // Intel is the job before she wakes; once she's up, the checklist is what you watch.
  useEffect(() => {
    if (game.childAwake && !narrow) setTab((t) => (t === 'intel' ? 'status' : t));
  }, [game.childAwake]);
  // Switching layouts: a phone has no separate actions column, a wide screen has no actions tab.
  useEffect(() => {
    setTab((t) => (narrow ? t : t === 'actions' ? 'intel' : t));
  }, [narrow]);

  const r = game.ended ? results(game) : undefined;
  const cl = checklistCount(game);
  const count = `${cl.done}/${cl.total}`;
  // Leaving plays the departure first; the report is one press away.
  const [reportOpen, setReportOpen] = useState(false);
  useEffect(() => setReportOpen(false), [game.seed, game.ended]);
  const departing = !!r && !reportOpen;
  const { title, sub } = headline(game);
  const left = game.departureDeadline - game.minute;
  // While driving, the clock shows when you left; the arrival is the departure's reveal.
  const shownTime = r ? (departing ? r.departed : r.arrived) : game.minute;
  const late = r ? !departing && r.lateness > 0 : left < 0;
  const timeSub = r
    ? departing
      ? 'Driving'
      : r.lateness > 0
        ? `${r.lateness} min late`
        : 'On time'
    : !game.childAwake
      ? `Leave by ${formatClock(game.departureDeadline)}`
      : left >= 0
        ? `${left} min to leave`
        : `${-left} min overdue`;
  // Departure countdown in 5-minute segments, like a jump timer.
  const totalSegments = Math.ceil((game.departureDeadline - START_MINUTE) / SEGMENT_MINUTES);
  const litSegments = Math.max(0, Math.ceil(left / SEGMENT_MINUTES));

  let work;
  if (r) {
    work = (
      <div className="workarea report">
        {departing ? <Departure s={game} r={r} /> : <Debrief r={r} seed={seed} label={game.day.label} />}
      </div>
    );
  } else if (narrow) {
    const panel =
      tab === 'actions' ? (
        <ActionPanel s={game} act={act} />
      ) : tab === 'intel' ? (
        <IntelPanel s={game} act={act} />
      ) : tab === 'status' ? (
        <StatusPanel s={game} />
      ) : (
        <LogPanel s={game} />
      );
    work = (
      <div className="workarea single">
        <Tabs tabs={['actions', 'intel', 'status', 'log']} value={tab} onChange={setTab} alert={inc ? 'actions' : undefined} count={count} />
        {panel}
      </div>
    );
  } else {
    const side = tab === 'actions' ? 'intel' : tab;
    const head = (
      <div className="sectionhead tabhead">
        <Tabs tabs={['intel', 'status', 'log']} value={side} onChange={setTab} count={count} />
      </div>
    );
    work = (
      <div className="workarea">
        {side === 'log' ? (
          <LogPanel s={game} head={head} />
        ) : side === 'status' ? (
          <StatusPanel s={game} head={head} />
        ) : (
          <IntelPanel s={game} act={act} head={head} />
        )}
        <ActionPanel s={game} act={act} />
      </div>
    );
  }

  return (
    <div className="terminal frame">
      <header className="head">
        <div className="head-title">
          <div className="eyebrow head-eyebrow">
            <span>{run ? game.day.label : `Drill ${String(seed).padStart(6, '0')}`}</span>
            {run && <WeekStrip run={run} today={game.day.weekday} />}
            <FatePips fate={game.fate} />
          </div>
          <h1>{title}</h1>
          <div className="small">{sub}</div>
        </div>
        <div className={`timebox frame screen ${late ? 'late' : ''}`}>
          <div className="time">{formatClock(shownTime)}</div>
          <div className="time-sub">{timeSub}</div>
          {!r && (
            <div className={`segments ${left <= 10 ? 'low' : ''}`} aria-hidden>
              {Array.from({ length: totalSegments }, (_, i) => (
                <i key={i} className={i < litSegments ? 'on' : ''} />
              ))}
            </div>
          )}
        </div>
      </header>

      {!r && <MorningPlot s={game} />}

      {work}

      <Dock
        s={game}
        r={r}
        act={act}
        run={run}
        onNext={onNext}
        onRetry={onRetry}
        onReplay={onReplay}
        departing={departing}
        onReport={() => setReportOpen(true)}
      />
    </div>
  );
}
