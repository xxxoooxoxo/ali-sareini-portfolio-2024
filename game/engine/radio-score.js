// Four original eight-bar broadcasts. The little sampler runs once per tuned
// station; after that a looping Web Audio buffer does all the playback.
export const stations = [
  { chapter: 'uva', name: 'Lawn Service', frequency: 88.3, bpm: 92, swing: .16,
    roots: [50, 43, 48, 45], thirds: [3, 4, 4, 3], keys: [2, 7, 12], kicks: [0, 7, 10],
    bass: [0, 6, 10, 14], riff: [7, 12, 10, 7], tone: .75 },
  { chapter: 'dartmouth', name: 'Night School', frequency: 92.7, bpm: 78, swing: .10,
    roots: [48, 44, 51, 46], thirds: [3, 4, 4, 4], keys: [0, 10], kicks: [0, 9],
    bass: [0, 8, 13], riff: [12, 7, 10, 14], tone: .32 },
  { chapter: 'yc', name: 'After Hours', frequency: 99.1, bpm: 118, swing: 0,
    roots: [45, 45, 41, 43], thirds: [3, 3, 4, 4], keys: [2, 6, 10, 14], kicks: [0, 4, 8, 12],
    bass: [2, 5, 8, 11, 14], riff: [0, 7, 12, 15], tone: 1.4 },
  { chapter: 'sf', name: 'Fogline FM', frequency: 104.5, bpm: 103, swing: .12,
    roots: [43, 46, 48, 41], thirds: [3, 4, 3, 4], keys: [3, 6, 11, 14], kicks: [0, 6, 10],
    bass: [0, 3, 7, 10, 14], riff: [10, 7, 3, 5], tone: 1.05 },
];

export const radioRate = 22050;
const tau = 2 * Math.PI;

export function renderBroadcast(station) {
  const step = 60 / station.bpm / 4, length = Math.round(128 * step * radioRate);
  const mix = new Float32Array(length), samples = new Map();
  let seed = 17, lastNoise = 0;
  function sample(voice, note) {
    const key = voice + note;
    if (samples.has(key)) return samples.get(key);
    const duration = { kick: .23, snare: .19, hat: .085, open: .24, bass: step * 2.6, keys: step * 6, lead: step * 3.8 }[voice];
    const data = new Float32Array(Math.ceil(duration * radioRate));
    const hz = 440 * 2 ** ((note - 69) / 12);
    for (let i = 0; i < data.length; i++) {
      const t = i / radioRate, a = tau * hz * t;
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      const noise = seed / 2147483648 - 1, high = (noise - lastNoise) * .5;
      lastNoise = noise;
      let v;
      switch (voice) {
        case 'kick': v = Math.sin(tau * (47*t + 1.8*(1-Math.exp(-55*t)))) * Math.exp(-21*t); break;
        case 'snare': v = (high*.8 + noise*.3 + .28*Math.sin(tau*178*t)) * Math.exp(-25*t); break;
        case 'hat': case 'open': v = high * Math.exp(-t * (voice === 'hat' ? 75 : 23)); break;
        case 'bass': v = (Math.sin(a) + .42*Math.sin(2*a) + .17*Math.sin(3*a)) * Math.exp(-5*t); break;
        case 'keys': v = Math.sin(a + station.tone * Math.exp(-9*t) * Math.sin(2*a)) * Math.exp(-3.6*t); break;
        case 'lead': v = (.75*Math.sin(a + .5*Math.sin(2*a)) + .25*Math.sin(a*1.006)) * Math.exp(-4*t); break;
      }
      const attack = voice === 'keys' || voice === 'lead' ? .012 : .002;
      data[i] = v * Math.min(1, t / attack, (duration-t)/.023);
    }
    samples.set(key, data);
    return data;
  }
  function hit(bar, tick, voice, note, level) {
    const data = sample(voice, note);
    let at = Math.round((bar*16 + tick + (tick%2)*station.swing) * step * radioRate) % length;
    for (let i = 0; i < data.length; i++) {
      mix[at] += data[i] * level;
      if (++at === length) at = 0; // Keep ringing notes across the loop seam.
    }
  }
  for (let bar = 0; bar < 8; bar++) {
    const chord = bar % 4, root = station.roots[chord];
    for (const tick of station.kicks) hit(bar, tick, 'kick', 0, .42);
    for (const tick of [4, 12]) hit(bar, tick, 'snare', 0, .32);
    for (let tick = 0; tick < 16; tick += 2) {
      const open = bar%2 === 1 && tick === 14;
      hit(bar, tick, open ? 'open' : 'hat', 0, tick%4 ? .13 : .082);
    }
    for (const tick of station.bass) hit(bar, tick, 'bass', root-12 + (tick === 14 ? 7 : 0), .29);
    for (const tick of station.keys) {
      for (const interval of [station.thirds[chord], 7, 10]) hit(bar, tick, 'keys', root+12+interval, .064);
    }
    if (bar >= 4 || bar%2) {
      for (const [i, tick] of [1, 6, 10, 13].entries()) {
        const note = root+24+station.riff[(i+chord)%4];
        hit(bar, tick, 'lead', note, .13);
        hit(bar, tick+2, 'lead', note, .036);
      }
    }
    if (bar%4 === 3) for (const tick of [11, 14, 15]) hit(bar, tick, 'snare', 0, tick === 15 ? .19 : .10);
  }
  // A narrow speaker softens the hats. Gentle saturation glues the drums and keys together.
  let low = mix[length-1];
  for (let i = 0; i < length; i++) {
    low += .71*(mix[i]-low);
    mix[i] = Math.tanh(low*1.45)*.85;
  }
  return mix;
}
