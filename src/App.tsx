import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionPanel } from './ui/ActionPanel';
import { Debrief } from './ui/Debrief';
import { MorningPlot } from './ui/MorningPlot';
import { StatusPanel } from './ui/StatusPanel';
import * as sound from './ui/sound';
import { formatClock, SAFETY_CUTOFF, START_MINUTE } from './sim/constants';

const SEGMENT_MINUTES = 5;
import { createGame, currentIncident, reduce, results } from './sim/engine';
import { randomSeed } from './sim/rng';
import type { Action, GameState } from './sim/types';

function initialSeed(): number {
  const param = new URLSearchParams(window.location.search).get('seed');
  const n = param ? Number.parseInt(param, 10) : NaN;
  return Number.isFinite(n) ? n : randomSeed();
}

function setSeedInUrl(seed: number) {
  const url = new URL(window.location.href);
  url.searchParams.set('seed', String(seed));
  window.history.replaceState(null, '', url);
}

function headline(s: GameState): { title: string; sub: string } {
  if (s.ended) return { title: 'Morning complete', sub: 'You got everyone out of the house.' };
  if (!s.childAwake) return { title: 'Before she wakes up', sub: 'The house is quiet. She usually wakes around 7.' };
  const left = s.departureDeadline - s.minute;
  if (currentIncident(s)) return { title: 'Getting ready', sub: left > 0 ? "There's still time, but not much." : 'You should already be gone.' };
  if (left < 0) return { title: 'Running late', sub: 'Every minute now is a minute late.' };
  if (left <= 10) return { title: 'Nearly time', sub: 'Think about what really matters.' };
  return { title: 'Getting ready', sub: 'She is up. The clock is running.' };
}

export default function App() {
  const [seed, setSeed] = useState(initialSeed);
  const [game, setGame] = useState(() => createGame(seed));
  const [muted, setMuted] = useState(sound.isMuted());
  const prev = useRef(game);

  useEffect(() => setSeedInUrl(seed), [seed]);

  // Sounds follow state changes rather than button presses.
  useEffect(() => {
    const before = prev.current;
    prev.current = game;
    if (before === game) return;
    if (game.ended && !before.ended) sound.done();
    else if (currentIncident(game) && currentIncident(game)?.uid !== currentIncident(before)?.uid) sound.alert();
    else sound.click();
  }, [game]);

  const act = useCallback((a: Action) => setGame((g) => reduce(g, a)), []);

  const start = (newSeed: number) => {
    setSeed(newSeed);
    const g = createGame(newSeed);
    prev.current = g;
    setGame(g);
    window.scrollTo({ top: 0 });
  };

  const r = useMemo(() => (game.ended ? results(game) : undefined), [game]);
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
    <div className="site">
      <div className="site-top">
        <div>
          <div className="eyebrow">A morning in crisis</div>
          <div className="brand">SCHOOL RUN</div>
        </div>
        <button
          className="tool frame oct"
          onClick={() => {
            sound.setMuted(!muted);
            setMuted(!muted);
          }}
          aria-pressed={muted}
        >
          {muted ? 'Sound off' : 'Sound on'}
        </button>
      </div>

      <div className="bracketed">
        <div className="terminal frame">
          <header className="head">
            <div>
              <div className="eyebrow">Monday / Morning {String(seed).padStart(6, '0')}</div>
              <h1>{title}</h1>
              <div className="small">{sub}</div>
            </div>
            <div className={`timebox frame ${late ? 'late' : ''}`}>
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
            <Debrief r={r} seed={seed} onRetry={() => start(randomSeed())} onReplay={() => start(seed)} />
          ) : (
            <div className="workarea">
              <StatusPanel s={game} />
              <ActionPanel s={game} act={act} />
            </div>
          )}

          <footer className="foot">
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
      </div>
      <p className="caption">
        Prototype. Time only moves when you act. Seed {seed}: share the URL to replay this exact morning.
      </p>
    </div>
  );
}
