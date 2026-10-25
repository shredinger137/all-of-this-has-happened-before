// Interface sounds: two recorded blips for buttons (hover, select), and small synthesized alerts.
let ctx: AudioContext | undefined;
let unlocked = false; // browsers won't play anything before the first click or key
const samples: Partial<Record<Sample, AudioBuffer | 'loading'>> = {};
type Sample = 'hover' | 'select';
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

function play(name: Sample, gain: number) {
  if (!unlocked || !ready() || !ctx) return;
  const b = samples[name];
  if (b === undefined) load(name); // this press goes quiet; the next one plays
  if (!b || b === 'loading') return;
  const src = ctx.createBufferSource();
  const g = ctx.createGain();
  src.buffer = b;
  g.gain.value = gain;
  src.connect(g).connect(ctx.destination);
  src.start();
}

/** First click or key: audio may start, and the button sounds load ahead of use. */
export function unlock() {
  if (unlocked) return;
  unlocked = true;
  if (!ready() || !ctx) return;
  for (const n of ['hover', 'select'] as Sample[]) if (samples[n] === undefined) load(n);
}

function load(name: Sample) {
  samples[name] = 'loading';
  fetch(`sfx/${name}.wav`)
    .then((r) => r.arrayBuffer())
    .then((a) => ctx!.decodeAudioData(a))
    .then((buf) => (samples[name] = buf))
    .catch(() => (samples[name] = undefined));
}

export function hover() {
  play('hover', 0.25);
}

export function select() {
  play('select', 0.4);
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
