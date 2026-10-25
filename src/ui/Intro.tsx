import { useEffect, useState } from 'react';

// The miniseries opening, one line at a time on black: what the game is, plainly. First visit only;
// after that, just the title.
const LINES = [
  'Kindergarten starts at 8.',
  'You have to leave by 7:45.',
  'There is one of her. She has strong opinions.',
  'You must get her to school on time.',
];
const LINE_MS = 3400;
const FIRST_DELAY_MS = 1200; // black screen before the first line
const SEEN_KEY = 'cic.intro.seen';
const FADE_OUT_MS = 900;

function seenBefore(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** A black screen with the title and a Begin key. Pressing it is also what lets the music start. */
export function Intro({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(() => (seenBefore() || reducedMotion() ? LINES.length : 0));
  const [leaving, setLeaving] = useState(false);
  const titled = step >= LINES.length;

  useEffect(() => {
    if (titled) return;
    const t = setTimeout(() => setStep((n) => n + 1), LINE_MS + (step === 0 ? FIRST_DELAY_MS : 0));
    return () => clearTimeout(t);
  }, [step, titled]);

  const begin = () => {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* storage unavailable; the full intro plays again next time */
    }
    // Fade the black away to reveal the console, then get out of the way.
    setLeaving(true);
    setTimeout(onDone, reducedMotion() ? 0 : FADE_OUT_MS);
  };

  return (
    <div className={`intro${leaving ? ' leaving' : ''}`} onClick={() => !titled && setStep(LINES.length)}>
      {titled ? (
        <div className="intro-title">
          <h1>All of This Has Happened Before</h1>
          <button className="tool frame" onClick={begin} autoFocus>
            Begin
          </button>
        </div>
      ) : (
        <p key={step} className={`intro-line${step === 0 ? ' first' : ''}`}>
          {LINES[step]}
        </p>
      )}
      {!titled && <span className="intro-skip">Click to skip</span>}
    </div>
  );
}
