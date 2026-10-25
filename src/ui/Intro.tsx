import { useEffect, useState } from 'react';

// The miniseries opening, one line at a time on black. First visit only; after that, just the title.
const LINES = ['She was created by you.', 'She wakes at seven.', 'She has opinions.', 'There is only one of her.', 'And she has a plan.'];
const LINE_MS = 2600;
const SEEN_KEY = 'cic.intro.seen';

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
  const titled = step >= LINES.length;

  useEffect(() => {
    if (titled) return;
    const t = setTimeout(() => setStep((n) => n + 1), LINE_MS);
    return () => clearTimeout(t);
  }, [step, titled]);

  const begin = () => {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* storage unavailable; the full intro plays again next time */
    }
    onDone();
  };

  return (
    <div className="intro" onClick={() => !titled && setStep(LINES.length)}>
      {titled ? (
        <div className="intro-title">
          <h1>All of This Has Happened Before</h1>
          <button className="tool frame" onClick={begin} autoFocus>
            Begin
          </button>
        </div>
      ) : (
        <p key={step} className="intro-line">
          {LINES[step]}
        </p>
      )}
      {!titled && <span className="intro-skip">Click to skip</span>}
    </div>
  );
}
