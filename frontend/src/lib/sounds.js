// One-shot synthesized sound effects (Web Audio). Every note is stopped
// explicitly, so nothing loops or keeps playing.

let ctx = null;
const getCtx = () => {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
};

// [frequency Hz, start offset s, duration s]
const SOUNDS = {
  click: { type: "triangle", vol: 0.12, notes: [[820, 0, 0.06]] },
  key: { type: "square", vol: 0.05, notes: [[620, 0, 0.04]] },
  delete: { type: "square", vol: 0.05, notes: [[300, 0, 0.05]] },
  error: { type: "sawtooth", vol: 0.08, notes: [[160, 0, 0.12], [130, 0.13, 0.14]] },
  happy: { type: "triangle", vol: 0.12, notes: [[660, 0, 0.1], [880, 0.1, 0.14]] },
  sad: { type: "triangle", vol: 0.12, notes: [[440, 0, 0.14], [330, 0.15, 0.22]] },
  win: { type: "triangle", vol: 0.14, notes: [[523, 0, 0.12], [659, 0.12, 0.12], [784, 0.24, 0.12], [1047, 0.36, 0.35]] },
  lose: { type: "sine", vol: 0.15, notes: [[392, 0, 0.22], [349, 0.24, 0.22], [311, 0.48, 0.22], [262, 0.72, 0.45]] },
  start: { type: "triangle", vol: 0.12, notes: [[523, 0, 0.1], [784, 0.1, 0.18]] },
  message: { type: "sine", vol: 0.1, notes: [[988, 0, 0.07], [1319, 0.07, 0.09]] },
};

export const playSound = (name) => {
  const sound = SOUNDS[name];
  const ac = sound && getCtx();
  if (!ac) return;
  const now = ac.currentTime;
  sound.notes.forEach(([freq, offset, dur]) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = sound.type;
    osc.frequency.setValueAtTime(freq, now + offset);
    gain.gain.setValueAtTime(sound.vol, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(now + offset);
    osc.stop(now + offset + dur + 0.02);
  });
};

export const playKeySound = (key) => {
  if (key === "BACKSPACE") playSound("delete");
  else if (key !== "ENTER") playSound("key");
};

export const playResultSound = (result, won, completed) => {
  if (won) playSound("win");
  else if (completed) playSound("lose");
  else playSound(result.some((r) => r === "correct" || r === "present") ? "happy" : "sad");
};
