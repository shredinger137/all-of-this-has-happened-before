import { useCallback, useEffect, useRef, useState } from 'react';
import { GameScreen } from './ui/GameScreen';
import { RunScreen } from './ui/RunScreen';
import * as music from './ui/music';
import * as sound from './ui/sound';
import { EVENTS } from './sim/content';
import { createGame, currentIncident, reduce } from './sim/engine';
import { randomSeed } from './sim/rng';
import { chooseCards, choosePerk, finishMorning, newRun, startMorning, type CardId, type RunState } from './sim/run';
import type { Action, GameState, PerkId } from './sim/types';

// A run lives in this browser. ?seed=N plays a single standalone morning (a drill) instead.
const SAVE_KEY = 'cic.run.v1';
type Saved = { run: RunState; game?: GameState };

function loadRun(): Saved | undefined {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const v = raw ? (JSON.parse(raw) as Saved) : undefined;
    if (v?.run?.version !== 1) return undefined;
    // A morning saved by an older build (different events and tasks) restarts; the week carries on.
    if (v.game && (!v.game.objectives.project || !v.game.breakfastWant)) v.game = undefined;
    for (const d of v.run.weekLog) if (d.event && !EVENTS[d.event]) d.event = undefined;
    if (v.run.lastEvent && !EVENTS[v.run.lastEvent]) v.run.lastEvent = undefined;
    return v;
  } catch {
    return undefined;
  }
}

function saveRun(v: Saved) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(v));
  } catch {
    // Private windows and full storage: the run just won't survive a reload.
  }
}

function drillSeed(): number | undefined {
  const param = new URLSearchParams(window.location.search).get('seed');
  const n = param ? Number.parseInt(param, 10) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function setSeedInUrl(seed: number) {
  const url = new URL(window.location.href);
  url.searchParams.set('seed', String(seed));
  window.history.replaceState(null, '', url);
}

/** Calm before she's up and between mornings; tense in the last ten minutes. */
function musicTier(game?: GameState): music.Tier {
  if (!game || game.ended || !game.childAwake) return 'calm';
  return game.departureDeadline - game.minute <= 10 ? 'crisis' : 'active';
}

function freshRun(): Saved {
  const run = newRun(randomSeed());
  return { run, game: startMorning(run) };
}

function initial(): { run?: RunState; game?: GameState; drill?: number } {
  const drill = drillSeed();
  if (drill !== undefined) return { drill, game: createGame(drill) };
  const saved = loadRun() ?? freshRun();
  if (saved.run.phase === 'morning' && !saved.game) saved.game = startMorning(saved.run);
  return saved;
}

export default function App() {
  const [init] = useState(initial);
  const [drill, setDrill] = useState(init.drill);
  const [run, setRun] = useState(init.run);
  const [game, setGame] = useState(init.game);
  const [muted, setMuted] = useState(sound.isMuted());
  const [musicOn, setMusicOn] = useState(music.isEnabled());
  const [confirmReset, setConfirmReset] = useState(false);
  const prev = useRef(game);

  useEffect(() => {
    if (drill !== undefined) setSeedInUrl(drill);
  }, [drill]);
  useEffect(() => {
    if (run) saveRun({ run, game });
  }, [run, game]);
  useEffect(() => {
    if (!confirmReset) return;
    const t = setTimeout(() => setConfirmReset(false), 3000);
    return () => clearTimeout(t);
  }, [confirmReset]);

  const tier = musicTier(game);
  useEffect(() => music.setTier(tier), [tier]);
  // Browsers only allow audio after a gesture: the first click or key starts the music.
  useEffect(() => {
    const go = () => music.unlock();
    window.addEventListener('pointerdown', go, { once: true });
    window.addEventListener('keydown', go, { once: true });
    return () => {
      window.removeEventListener('pointerdown', go);
      window.removeEventListener('keydown', go);
    };
  }, []);

  // Sounds follow state changes rather than button presses.
  useEffect(() => {
    const before = prev.current;
    prev.current = game;
    if (!game || !before || before === game) return;
    if (game.ended && !before.ended) sound.done();
    else if (currentIncident(game) && currentIncident(game)?.uid !== currentIncident(before)?.uid) sound.alert();
    else if (game.wave && game.wave.announced !== before.wave?.announced) sound.ping();
    else sound.click();
  }, [game]);

  const act = useCallback((a: Action) => setGame((g) => (g ? reduce(g, a) : g)), []);

  const startDrill = (seed: number) => {
    setDrill(seed);
    const g = createGame(seed);
    prev.current = g;
    setGame(g);
  };

  const toEvening = () => {
    if (!run || !game) return;
    setRun(finishMorning(run, game));
    setGame(undefined);
  };
  const pickCards = (picks: CardId[]) => {
    if (!run) return;
    const next = chooseCards(run, picks);
    const g = startMorning(next);
    prev.current = g;
    setRun(next);
    setGame(g);
  };
  const pickPerk = (perk?: PerkId) => run && setRun(choosePerk(run, perk));
  const resetRun = () => {
    const fresh = freshRun();
    prev.current = fresh.game;
    setRun(fresh.run);
    setGame(fresh.game);
    setConfirmReset(false);
  };

  return (
    <div className="site">
      <div className="site-top">
        <div className="brand">
          C·I·C <span>Child Information Center</span>
        </div>
        <div className="caption">
          {drill !== undefined ? (
            <>
              Drill · seed {drill} · share the URL to replay this morning · <a href="./">back to the week</a>
            </>
          ) : (
            'Your week is saved in this browser'
          )}
        </div>
        {drill === undefined && (
          <button className="tool frame" onClick={() => (confirmReset ? resetRun() : setConfirmReset(true))}>
            {confirmReset ? 'Really start over?' : 'New run'}
          </button>
        )}
        <button
          className="tool frame"
          onClick={() => {
            music.setEnabled(!musicOn);
            setMusicOn(!musicOn);
          }}
          aria-pressed={!musicOn}
        >
          {musicOn ? 'Music on' : 'Music off'}
        </button>
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

      {game ? (
        <GameScreen
          game={game}
          seed={drill ?? game.seed}
          act={act}
          run={drill === undefined ? run : undefined}
          onNext={toEvening}
          onRetry={() => startDrill(randomSeed())}
          onReplay={() => startDrill(drill ?? game.seed)}
        />
      ) : (
        run && <RunScreen run={run} onCards={pickCards} onPerk={pickPerk} />
      )}
    </div>
  );
}
