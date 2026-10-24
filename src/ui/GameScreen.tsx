import { useEffect, useState } from 'react';
import { formatClock, START_MINUTE } from '../sim/constants';
import { currentIncident, results } from '../sim/engine';
import type { Action, GameState } from '../sim/types';
import { ActionPanel } from './ActionPanel';
import { Debrief } from './Debrief';
import { Dock } from './Dock';
import { MorningPlot } from './MorningPlot';
import { LogPanel, StatusPanel } from './StatusPanel';

const SEGMENT_MINUTES = 5;
// Below this width the two screens don't fit side by side, so they become tabs. Matches styles.css.
const NARROW = '(max-width: 730px)';

function headline(s: GameState): { title: string; sub: string } {
  if (s.ended) return { title: 'Out the door', sub: 'After-action report filed.' };
  if (!s.childAwake) return { title: 'Before she wakes up', sub: 'The house is quiet. She usually wakes around 7.' };
  const left = s.departureDeadline - s.minute;
  if (currentIncident(s)) return { title: 'Getting ready', sub: left > 0 ? "There's still time, but not much." : 'You should already be gone.' };
  if (left < 0) return { title: 'Running late', sub: 'Every minute now is a minute late.' };
  if (left <= 10) return { title: 'Nearly time', sub: 'Think about what really matters.' };
  return { title: 'Getting ready', sub: 'She is up. The clock is running.' };
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

type Tab = 'actions' | 'status' | 'log';
const TAB_LABELS: Record<Tab, string> = { actions: 'Actions', status: 'Status', log: 'Log' };

function Tabs({ tabs, value, onChange, alert }: { tabs: Tab[]; value: Tab; onChange: (t: Tab) => void; alert?: Tab }) {
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
        </button>
      ))}
    </div>
  );
}

type Props = {
  game: GameState;
  seed: number;
  act: (a: Action) => void;
  onRetry: () => void;
  onReplay: () => void;
};

/** The console itself: housing, clock, plot, screens, status bar. Pure view of a game state. */
export function GameScreen({ game, seed, act, onRetry, onReplay }: Props) {
  const narrow = useNarrow();
  const [tab, setTab] = useState<Tab>(narrow ? 'actions' : 'status');
  const inc = currentIncident(game);

  // A new problem always brings the actions screen forward on a phone.
  useEffect(() => {
    if (inc && narrow) setTab('actions');
  }, [inc?.uid, narrow]);
  // Switching layouts: a phone has no separate actions column, a wide screen has no actions tab.
  useEffect(() => {
    setTab((t) => (narrow ? t : t === 'actions' ? 'status' : t));
  }, [narrow]);

  const r = game.ended ? results(game) : undefined;
  const { title, sub } = headline(game);
  const left = game.departureDeadline - game.minute;
  const shownTime = r ? r.arrived : game.minute;
  const late = r ? r.lateness > 0 : left < 0;
  const timeSub = r
    ? r.lateness > 0
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
        <Debrief r={r} seed={seed} />
      </div>
    );
  } else if (narrow) {
    const panel =
      tab === 'actions' ? <ActionPanel s={game} act={act} /> : tab === 'status' ? <StatusPanel s={game} /> : <LogPanel s={game} />;
    work = (
      <div className="workarea single">
        <Tabs tabs={['actions', 'status', 'log']} value={tab} onChange={setTab} alert={inc ? 'actions' : undefined} />
        {panel}
      </div>
    );
  } else {
    const side = tab === 'log' ? 'log' : 'status';
    const head = (
      <div className="sectionhead tabhead">
        <Tabs tabs={['status', 'log']} value={side} onChange={setTab} />
      </div>
    );
    work = (
      <div className="workarea">
        {side === 'log' ? <LogPanel s={game} head={head} /> : <StatusPanel s={game} head={head} />}
        <ActionPanel s={game} act={act} />
      </div>
    );
  }

  return (
    <div className="terminal frame">
      <header className="head">
        <div className="head-title">
          <div className="eyebrow">Morning {String(seed).padStart(6, '0')}</div>
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

      <Dock s={game} r={r} act={act} onRetry={onRetry} onReplay={onReplay} />
    </div>
  );
}
