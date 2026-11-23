import { load, save } from './store';

let ctx: AudioContext | null = null;
let muted = load<boolean>('muted', false);

export const isMuted = () => muted;
export const setMuted = (m: boolean) => {
  muted = m;
  save('muted', m);
};

const audio = (): AudioContext | null => {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
};

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend();
  });
}

const noiseBurst = (ac: AudioContext, at: number, dur: number, freq: number, gain: number) => {
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = 1.4;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(bp).connect(g).connect(ac.destination);
  src.start(at);
};

/** A two-stroke paper snip. */
export const playSnip = () => {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + 0.01;
  noiseBurst(ac, t, 0.06, 5200, 0.55);
  noiseBurst(ac, t + 0.09, 0.08, 3800, 0.45);
  noiseBurst(ac, t + 0.2, 0.32, 900, 0.12);
};

/** A soft click for small UI moments. */
export const playTick = () => {
  const ac = audio();
  if (!ac) return;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.frequency.value = 880;
  g.gain.setValueAtTime(0.06, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.08);
  o.connect(g).connect(ac.destination);
  o.start();
  o.stop(ac.currentTime + 0.09);
};

export const buzz = (ms = 12) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
};
