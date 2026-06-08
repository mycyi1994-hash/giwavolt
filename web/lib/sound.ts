// Tiny Web Audio synth — no assets. All SFX are generated on the fly. A global
// mute is persisted in localStorage. AudioContext is created lazily on the
// first sound (which always follows a user gesture, so browsers allow it).

let actx: AudioContext | null = null;
let muted = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!actx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    actx = new AC();
  }
  if (actx.state === "suspended") actx.resume();
  return actx;
}

function env(g: GainNode, t0: number, dur: number, peak: number) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
}

function blip(freq: number, dur: number, type: OscillatorType, peak: number, slideTo?: number) {
  const c = getCtx();
  if (!c || muted) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), c.currentTime + dur);
  o.connect(g);
  g.connect(c.destination);
  env(g, c.currentTime, dur, peak);
  o.start();
  o.stop(c.currentTime + dur + 0.03);
}

function seq(notes: [number, number][], type: OscillatorType, peak: number) {
  notes.forEach(([f, dt]) => setTimeout(() => blip(f, 0.17, type, peak), dt));
}

function noise(dur: number, peak: number, hp = 700) {
  const c = getCtx();
  if (!c || muted) return;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource();
  s.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = hp;
  const g = c.createGain();
  s.connect(f);
  f.connect(g);
  g.connect(c.destination);
  env(g, c.currentTime, dur, peak);
  s.start();
  s.stop(c.currentTime + dur);
}

export const sfx = {
  tick: () => blip(1300, 0.04, "square", 0.025),
  select: () => blip(760, 0.06, "square", 0.045),
  place: () => blip(520, 0.08, "triangle", 0.06),
  cancel: () => blip(380, 0.09, "sine", 0.05, 250),
  reveal: () => blip(900, 0.06, "sine", 0.05, 1200),
  win: () => seq([[660, 0], [880, 70], [1175, 140], [1568, 210]], "triangle", 0.06),
  lose: () => blip(300, 0.22, "sawtooth", 0.05, 150),
  cashout: () => seq([[784, 0], [1047, 80], [1319, 160], [1760, 240]], "triangle", 0.06),
  skull: () => {
    noise(0.12, 0.12);
    blip(170, 0.3, "sawtooth", 0.07, 60);
  },
  bust: () => {
    noise(0.22, 0.1, 400);
    blip(120, 0.5, "sawtooth", 0.09, 40);
  },
};

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem("volt:mute", m ? "1" : "0");
  } catch {
    /* ignore */
  }
}
export function loadMuted(): boolean {
  try {
    const v = localStorage.getItem("volt:mute") === "1";
    muted = v;
    return v;
  } catch {
    return false;
  }
}
export function isMuted() {
  return muted;
}
