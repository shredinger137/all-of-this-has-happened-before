// Tiny synthesized sounds: a soft mechanical click and an understated alert.
let ctx: AudioContext | undefined;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return localStorage.getItem('schoolrun.muted') === '1';
  } catch {
    return false;
  }
}

export function isMuted() {
  return muted;
}

export function setMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem('schoolrun.muted', value ? '1' : '0');
  } catch {
    /* storage unavailable; the setting just won't persist */
  }
}

function tone(freq: number, start: number, length: number, gain: number, type: OscillatorType = 'square') {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t = ctx.currentTime + start;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

function ready(): boolean {
  if (muted) return false;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return true;
  } catch {
    return false;
  }
}

export function click() {
  if (ready()) tone(1800, 0, 0.03, 0.03);
}

export function alert() {
  if (!ready()) return;
  tone(660, 0, 0.18, 0.05, 'triangle');
  tone(494, 0.2, 0.28, 0.05, 'triangle');
}

/** A new contact on the plot. */
export function ping() {
  if (!ready()) return;
  tone(1320, 0, 0.09, 0.035, 'sine');
  tone(1320, 0.14, 0.09, 0.02, 'sine');
}

export function done() {
  if (!ready()) return;
  tone(523, 0, 0.12, 0.04, 'triangle');
  tone(784, 0.13, 0.25, 0.04, 'triangle');
}
