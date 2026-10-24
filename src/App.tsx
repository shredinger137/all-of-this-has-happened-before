import { useCallback, useEffect, useRef, useState } from 'react';
import { GameScreen } from './ui/GameScreen';
import * as sound from './ui/sound';
import { createGame, currentIncident, reduce } from './sim/engine';
import { randomSeed } from './sim/rng';
import type { Action } from './sim/types';

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
  };

  return (
    <div className="site">
      <div className="site-top">
        <div className="brand">TUESDAY</div>
        <div className="caption">Prototype · seed {seed} · share the URL to replay this morning</div>
        <button
          className="tool frame"
          onClick={() => {
            sound.setMuted(!muted);
            setMuted(!muted);
          }}
          aria-pressed={muted}
        >
          {muted ? 'Sound off' : 'Sound on'}
        </button>
      </div>

      <GameScreen game={game} seed={seed} act={act} onRetry={() => start(randomSeed())} onReplay={() => start(seed)} />

    </div>
  );
}
