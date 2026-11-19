import { soundClips } from './sound-clips.js';
import { stations, renderBroadcast, radioRate } from './radio-score.js';
import { plantedFoot } from './movement.js';

const footsteps = ['stepA', 'stepB', 'stepC'];
const ambience = { dartmouth: 'carnival', yc: 'fan', sf: 'bay' };
const muteKey = 'life-game.sound-muted';

export function makeWorldAudio(stage) {
  /** @type {AudioContext | undefined} */
  let ctx;
  let chapter = '', paused = false, engaged = false, muted = false, nextFoot = 0;
  let ambientVoice = null, ambientLevel = 1;
  let driving = false, engineVoice = null, engineHz = 36;
  let radioAt = null, homeStation = -1, preset = 0, radioVoice = null, radioLevel = 0, radioPan = 0;
  const buffers = new Map(), requested = new Set(), voices = new Set();
  try { muted = localStorage.getItem(muteKey) === '1'; } catch { /* Storage is optional in embeds. */ }
  const audible = () => ctx?.state === 'running' && engaged && !muted && !paused && !document.hidden;

  function load(name) {
    if (requested.has(name)) return;
    requested.add(name);
    const bytes = Uint8Array.from(atob(soundClips[name]), c => c.charCodeAt(0));
    ctx.decodeAudioData(bytes.buffer).then(buffer => {
      buffers.set(name, buffer);
      sync(); // A decode may finish after travel, opening the phone, or muting.
    }).catch(() => { requested.delete(name); }); // Play continues; a later visit can retry.
  }

  function play(name, level, rate = 1, loop = false, pan = null) {
    const buffer = buffers.get(name);
    if (!buffer || !audible()) return null;
    const source = ctx.createBufferSource(), gain = ctx.createGain();
    source.buffer = buffer;
    source.loop = loop;
    source.playbackRate.value = rate;
    gain.gain.value = loop ? 0 : level;
    if (loop) gain.gain.setTargetAtTime(level, ctx.currentTime, .10);
    source.connect(gain);
    const panner = pan !== null ? ctx.createStereoPanner?.() : null;
    if (panner) {
      panner.pan.value = pan;
      gain.connect(panner); panner.connect(ctx.destination);
    } else gain.connect(ctx.destination);
    const voice = { source, gain, panner };
    voices.add(voice);
    source.onended = () => {
      voices.delete(voice);
      source.disconnect(); gain.disconnect(); panner?.disconnect();
    };
    // Reopening the phone shouldn't rewind the crowd to the same syllable each time.
    source.start(0, loop ? ctx.currentTime % buffer.duration : 0);
    return voice;
  }

  function stop(voice) {
    if (!voice || !voices.delete(voice)) return;
    if (ctx.state === 'running' && !document.hidden) {
      voice.gain.gain.setTargetAtTime(0, ctx.currentTime, .012);
      voice.source.stop(ctx.currentTime + .065);
    } else voice.source.stop();
  }
  function quiet() {
    for (const voice of voices) stop(voice);
    ambientVoice = null;
    engineVoice = null;
    radioVoice = null;
  }

  function tunedStation() {
    return homeStation < 0 || preset === stations.length ? undefined : stations[(homeStation+preset)%stations.length];
  }
  function syncRadio() {
    const station = tunedStation();
    if (!station || radioLevel <= .005 || !audible()) {
      stop(radioVoice); radioVoice = null; return;
    }
    if (radioVoice) return;
    const key = station.name;
    if (!buffers.has(key)) {
      const music = renderBroadcast(station), buffer = ctx.createBuffer(1, music.length, radioRate);
      buffer.getChannelData(0).set(music); buffers.set(key, buffer);
    }
    radioVoice = play(key, radioLevel, 1, true, radioPan);
  }

  function listen(position, yaw) {
    if (!radioAt) return;
    const dx = radioAt.x-position.x, dz = radioAt.z-position.z;
    const distance = Math.hypot(dx, dz, radioAt.y-position.y-1);
    const level = .62 * Math.max(0, 1-distance/22)**2;
    const pan = .76*(dx*Math.sin(yaw) + dz*Math.cos(yaw))/Math.max(2,distance);
    if (Math.abs(radioLevel-level) > .008 || (level > .005) !== (radioLevel > .005)) {
      radioLevel = level;
      radioVoice?.gain.gain.setTargetAtTime(level, ctx.currentTime, .10);
      syncRadio();
    }
    if (Math.abs(radioPan-pan) > .02) {
      radioPan = pan;
      radioVoice?.panner?.pan.setTargetAtTime(pan, ctx.currentTime, .08);
    }
  }

  function sync() {
    if (!audible()) { quiet(); return; }
    const bed = driving ? 'carnival' : ambience[chapter]; // Distant street voices beneath the engine.
    if (bed) {
      load(bed);
      if (!ambientVoice) ambientVoice = play(bed, ambientLevel, 1, true);
    }
    if (chapter === 'uva') footsteps.forEach(load);
    if (chapter === 'sf' && !driving) load('splash');
    if (driving && !engineVoice) {
      // One smooth combustion cycle. Pitch follows speed, throttle and gear changes.
      if (!buffers.has('engine')) {
        const cycle = ctx.createBuffer(1,1024,ctx.sampleRate), data = cycle.getChannelData(0);
        for (let i=0;i<data.length;i++) {
          const a=2*Math.PI*i/data.length;
          data[i]=.047*Math.sin(a)+.031*Math.sin(2*a+.2)+.022*Math.sin(4*a)+.012*Math.sin(7*a+.7);
        }
        buffers.set('engine',cycle);
      }
      engineVoice = play('engine', .78, engineHz*1024/ctx.sampleRate, true);
    }
    syncRadio();
  }

  function wake() {
    if (!engaged || muted || document.hidden) return;
    if (!ctx) {
      try { ctx = new AudioContext(); } catch { return; }
      ctx.addEventListener('statechange', sync);
    }
    if (ctx.state === 'running') sync();
    else ctx.resume().then(sync).catch(() => {}); // Retry on a later real gesture if the browser declines.
  }
  function gesture(e) {
    if (!e.isTrusted || e.metaKey || e.ctrlKey || (e.type === 'pointerdown' && e.pointerType !== 'mouse')) return;
    const target = e.target;
    if (!(target instanceof Element) || !(stage.contains(target) || target.closest('#life-phone') ||
        (e.type === 'keydown' && target === document.body))) return;
    engaged = true;
    if (ctx?.state !== 'running') wake();
  }
  // Touch activation is granted on release. Capture also sees buttons which stop propagation.
  for (const type of ['pointerdown', 'pointerup', 'click', 'keydown', 'wheel']) document.addEventListener(type, gesture, true);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      quiet();
      ctx?.suspend().then(() => { if (!document.hidden) wake(); }).catch(() => {});
    }
    else wake();
  });

  return {
    get muted() { return muted; },
    setMuted(value) {
      muted = value;
      try { localStorage.setItem(muteKey, value ? '1' : '0'); } catch {}
      if (muted) quiet(); else wake();
    },
    setPaused(value) {
      paused = value;
      if (paused) quiet(); else wake();
    },
    enter(id, emitter = null) {
      quiet();
      driving = false; chapter = id; ambientLevel = 1; nextFoot = 0;
      radioAt = emitter; radioLevel = radioPan = 0;
      homeStation = emitter ? stations.findIndex(station => station.chapter === id) : -1; preset = 0;
      sync();
    },
    get station() { return tunedStation(); },
    tune() {
      if (!radioAt) return;
      stop(radioVoice); radioVoice = null;
      preset = (preset+1)%(stations.length+1);
      syncRadio();
    },
    setDriving(value) {
      quiet(); driving = value; engineHz = 36; ambientLevel = value ? .32 : 1;
      radioLevel = value ? .55 : 0; radioPan = 0; sync();
    },
    driveSpeed(speed, pedal) {
      const gear = Math.min(3, Math.floor(speed/8.5));
      const hz = 36 + speed*1.6 + (speed-gear*8.5)*3.7 + Math.max(0,pedal)*6;
      if (Math.abs(hz-engineHz) < .5) return;
      engineHz = hz;
      engineVoice?.source.playbackRate.setTargetAtTime(hz*1024/ctx.sampleRate,ctx.currentTime,.085);
    },
    update(player, previousPhase, wasGrounded, controlled, yaw = 0) {
      const { x, z } = player.pos;
      listen(player.pos, yaw);
      // The fan is mounted over the hall. Carnival voices gather at the cocoa stalls.
      if (chapter === 'yc' || chapter === 'dartmouth') {
        const hall = chapter === 'yc';
        const distance = hall ? Math.hypot(x - 6, z + 8.5) : Math.hypot(x + 1, z + 35);
        const level = .38 + .62 / (1 + (distance / (hall ? 10 : 26)) ** 2);
        if (Math.abs(ambientLevel - level) > .02) {
          ambientLevel = level;
          ambientVoice?.gain.gain.setTargetAtTime(level, ctx.currentTime, .18);
        }
      }
      if (chapter !== 'uva' || !controlled || !audible() || Math.abs(x) >= 20.8 || z <= -49 ||
          plantedFoot(player, previousPhase, wasGrounded) === null) return;
      play(footsteps[nextFoot], player.running ? 1 : .77, .96 + nextFoot * .035);
      nextFoot = (nextFoot + 1) % footsteps.length;
    },
    snowStep(side, running) {
      if (!audible() || chapter !== 'dartmouth') return;
      // A dull heel strike followed by the shorter crackle of the toe compressing the crust.
      if (!buffers.has('snow')) {
        const buffer = ctx.createBuffer(1, 4096, radioRate), data = buffer.getChannelData(0);
        let low = 0, seed = 413;
        for (let i = 0; i < data.length; i++) {
          const t = i/radioRate;
          seed = (Math.imul(1664525,seed)+1013904223) >>> 0;
          const grain = seed/2147483648-1;
          low += .14*(grain-low);
          const pressure = Math.exp(-30*t) + .57*Math.exp(-Math.abs(t-.076)*47);
          data[i] = (low*.92 + grain**9*.31)*pressure*Math.min(1,i/65);
        }
        buffers.set('snow',buffer);
      }
      play('snow', running ? .82 : .66, side ? .96 : 1.04);
    },
    catToss(tagged) {
      if(!audible())return;
      const key=tagged?'tag-chime':'cat-chirp';
      if(!buffers.has(key)){
        const seconds=tagged ? .22 : .19;
        const buffer=ctx.createBuffer(1,Math.ceil(seconds*radioRate),radioRate), samples=buffer.getChannelData(0);
        let phase=0;
        for(let i=0;i<samples.length;i++){
          const t=i/radioRate, hz=tagged?(t<.075?530:790):460+240*Math.sin(Math.PI*t/seconds)-110*t/seconds;
          phase+=2*Math.PI*hz/radioRate;
          samples[i]=tagged ? .27*Math.sin(phase)*Math.exp(-12*t)*Math.min(1,i/45,(samples.length-i)/90)
            : (.16*Math.sin(phase)+.06*Math.sin(2*phase)+.07*Math.sin(3*phase))*Math.sin(Math.PI*t/seconds)**2;
        }
        buffers.set(key,buffer);
      }
      play(key,.64);
    },
    shot(gear) {
      if (!audible()) return;
      const key=gear===1 ? 'pistol-report' : 'rifle-report';
      if (!buffers.has(key)) {
        const count=Math.round(radioRate*.20), buffer=ctx.createBuffer(1,count,radioRate);
        const data=buffer.getChannelData(0), pitch=gear===1 ? 136 : 99;
        let phase=0, seed=731, low=0;
        for(let i=0;i<count;i++) {
          const t=i/radioRate;
          seed=(Math.imul(1664525,seed)+1013904223)>>>0;
          const noise=seed/2147483648-1;low+=(noise-low)*.23;
          phase+=2*Math.PI*(52+pitch*Math.exp(-t*38))/radioRate;
          data[i]=Math.min(1,i/9)*(.52*noise*Math.exp(-95*t)+.36*Math.sin(phase)*Math.exp(-29*t)
            +low*.38*Math.exp(-Math.abs(t-.057)*38));
        }
        buffers.set(key,buffer);
      }
      play(key,.68);
    },
    splash(index) {
      if (chapter === 'sf') play('splash', [.90, .65, .46][index], 1.08 + index * .13);
    },
  };
}
