// Background music in three intensity tiers, crossfaded as the morning tightens.
// Tracks are the user's own (public/music). Claude can't listen, so the tiers were set by measuring
// each track: steady, dark, few onsets = calm; rhythmic or building = active; bright and dynamic = crisis.
export type Tier = 'calm' | 'active' | 'crisis';

const TRACKS: Record<Tier, string[]> = {
  calm: ['vessel-in-stasis', 'gravitys-quiet-pull'],
  active: ['the-long-watch', 'terminal-horizon-line'],
  crisis: ['last-pulse-of-the-hull', 'iron-bow-and-hollow-bone', 'under-the-iron-hull'],
};

const VOLUME = 0.35;
const FADE_MS = 2500;
const KEY = 'cic.music';

let enabled = readEnabled();
let unlocked = false; // browsers only allow audio after the first click or key press
let tier: Tier | undefined;
let current: HTMLAudioElement | undefined;
let lastTrack: string | undefined;

function readEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function isEnabled() {
  return enabled;
}

export function setEnabled(value: boolean) {
  enabled = value;
  try {
    localStorage.setItem(KEY, value ? 'on' : 'off');
  } catch {
    /* storage unavailable; the setting just won't persist */
  }
  if (!value) fadeOut(current);
  else if (tier) play(tier);
}

function fade(el: HTMLAudioElement, to: number, then?: () => void) {
  const from = el.volume;
  const t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / FADE_MS);
    el.volume = from + (to - from) * k;
    if (k < 1) requestAnimationFrame(step);
    else then?.();
  };
  requestAnimationFrame(step);
}

function fadeOut(el?: HTMLAudioElement) {
  if (!el) return;
  if (el === current) current = undefined;
  fade(el, 0, () => el.pause());
}

function pick(t: Tier): string {
  const options = TRACKS[t].filter((n) => n !== lastTrack);
  const list = options.length ? options : TRACKS[t];
  return list[Math.floor(Math.random() * list.length)];
}

function play(t: Tier) {
  if (!enabled || !unlocked) return;
  const name = pick(t);
  lastTrack = name;
  const el = new Audio(`music/${name}.mp3`); // relative: works wherever the build is hosted
  el.volume = 0;
  // When a track ends, carry on with another from the same tier.
  el.addEventListener('ended', () => {
    if (current === el && tier) play(tier);
  });
  fadeOut(current);
  current = el;
  el.play().then(
    () => fade(el, VOLUME),
    () => {
      /* autoplay refused; the next click will unlock */
    },
  );
}

/** Ask for a tier; switches (with a crossfade) only when it changes. */
export function setTier(t: Tier) {
  if (t === tier && current) return;
  tier = t;
  play(t);
}

/** Call from the first user gesture. */
export function unlock() {
  if (unlocked) return;
  unlocked = true;
  if (tier) play(tier);
}
