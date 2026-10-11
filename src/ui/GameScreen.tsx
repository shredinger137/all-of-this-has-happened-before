import { formatClock, SAFETY_CUTOFF, START_MINUTE } from '../sim/constants';
import { currentIncident, isGroggy, results } from '../sim/engine';
import type { Action, GameState } from '../sim/types';
import { ActionPanel } from './ActionPanel';
import { Debrief } from './Debrief';
import { MorningPlot } from './MorningPlot';
import { StatusPanel } from './StatusPanel';

const SEGMENT_MINUTES = 5;

function headline(s: GameState): { title: string; sub: string } {
  if (s.ended) return { title: 'Morning complete', sub: 'You got everyone out of the house.' };
  if (!s.childAwake) return { title: 'Before she wakes up', sub: 'The house is quiet. She usually wakes around 7.' };
  const left = s.departureDeadline - s.minute;
  if (currentIncident(s)) return { title: 'Getting ready', sub: left > 0 ? "There's still time, but not much." : 'You should already be gone.' };
  if (left < 0) return { title: 'Running late', sub: 'Every minute now is a minute late.' };
  if (left <= 10) return { title: 'Nearly time', sub: 'Think about what really matters.' };
  return { title: 'Getting ready', sub: 'She is up. The clock is running.' };
}

/** Indicator lamps on the console housing. */
function Lamps({ s }: { s: GameState }) {
  const lamps = [
    { label: s.childAwake ? 'Awake' : 'Asleep', on: s.childAwake, tone: 'green' },
    { label: 'Groggy', on: isGroggy(s), tone: 'amber' },
    { label: 'Coffee', on: s.coffeeBuffer, tone: 'amber' },
    { label: 'Problem', on: !!currentIncident(s), tone: 'alarm' },
    { label: 'Late', on: s.minute >= s.departureDeadline, tone: 'alarm' },
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

type Props = {
  game: GameState;
  seed: number;
  act: (a: Action) => void;
  onRetry: () => void;
  onReplay: () => void;
};

/** The console itself: housing, clock, plot, screens, footer. Pure view of a game state. */
export function GameScreen({ game, seed, act, onRetry, onReplay }: Props) {
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
  const last = game.history[game.history.length - 1];
  // Departure countdown in 5-minute segments, like a jump timer.
  const totalSegments = Math.ceil((game.departureDeadline - START_MINUTE) / SEGMENT_MINUTES);
  const litSegments = Math.max(0, Math.ceil(left / SEGMENT_MINUTES));

  return (
    <div className="terminal frame">
      <header className="head">
        <div>
          <div className="eyebrow">Morning {String(seed).padStart(6, '0')}</div>
          <h1>{title}</h1>
          <div className="small">{sub}</div>
          {!r && <Lamps s={game} />}
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

      {r ? (
        <Debrief r={r} seed={seed} onRetry={onRetry} onReplay={onReplay} />
      ) : (
        <div className="workarea">
          <StatusPanel s={game} />
          <ActionPanel s={game} act={act} />
        </div>
      )}

      <footer className="foot frame screen">
        {r ? (
          <>
            <strong>{formatClock(r.arrived)}</strong> &nbsp;{' '}
            {r.lateness > 0 ? 'Morning over. School has begun.' : 'Morning over. The bell has not gone yet.'}
          </>
        ) : (
          <>
            <strong>{formatClock(last.minute)}</strong> &nbsp; {last.text}
            {game.minute >= SAFETY_CUTOFF - 15 && ' It is getting very late.'}
          </>
        )}
      </footer>
    </div>
  );
}
