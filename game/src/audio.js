// Synthesised sound effects, all WebAudio, no audio files and no network.
// The context starts on the first user gesture; every call before that is a no-op.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function noiseBuffer(seconds) {
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst({ seconds = 0.12, frequency = 1800, gain = 0.5, type = 'lowpass', sweepTo = null, when = 0 }) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + when;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(seconds);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, t0);
    if (sweepTo !== null) filter.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t0 + seconds);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(master);
    source.start(t0);
    source.stop(t0 + seconds + 0.02);
  }

  function tone({ frequency = 440, seconds = 0.08, gain = 0.25, type = 'sine', slideTo = null, when = 0 }) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t0);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + seconds);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
    osc.connect(amp);
    amp.connect(master);
    osc.start(t0);
    osc.stop(t0 + seconds + 0.02);
  }

  const SHOTS = {
    rifle: { seconds: 0.11, frequency: 2400, gain: 0.5, sweepTo: 300 },
    smg: { seconds: 0.08, frequency: 3000, gain: 0.4, sweepTo: 400 },
    pistol: { seconds: 0.1, frequency: 2000, gain: 0.45, sweepTo: 350 },
    shotgun: { seconds: 0.22, frequency: 1400, gain: 0.65, sweepTo: 150 },
    dmr: { seconds: 0.2, frequency: 1800, gain: 0.6, sweepTo: 200 },
    enemy: { seconds: 0.1, frequency: 1500, gain: 0.22, sweepTo: 250 },
  };

  return {
    unlock() { ensure(); },
    setMuted(value) { muted = value; },
    shot(kind = 'rifle', distant = false) {
      const spec = SHOTS[kind] || SHOTS.rifle;
      burst({ ...spec, gain: distant ? spec.gain * 0.45 : spec.gain });
      tone({ frequency: 160, seconds: 0.09, gain: distant ? 0.08 : 0.2, type: 'triangle', slideTo: 60 });
    },
    dryFire() { tone({ frequency: 1200, seconds: 0.03, gain: 0.15, type: 'square' }); },
    reload() {
      tone({ frequency: 900, seconds: 0.04, gain: 0.18, type: 'square' });
      tone({ frequency: 600, seconds: 0.04, gain: 0.18, type: 'square', when: 0.35 });
      tone({ frequency: 1100, seconds: 0.05, gain: 0.2, type: 'square', when: 0.7 });
    },
    hit(kill = false) {
      tone({ frequency: kill ? 1320 : 990, seconds: 0.06, gain: 0.22 });
      if (kill) tone({ frequency: 1760, seconds: 0.1, gain: 0.2, when: 0.06 });
    },
    hurt() { tone({ frequency: 220, seconds: 0.12, gain: 0.25, type: 'sawtooth', slideTo: 110 }); },
    grenade() { burst({ seconds: 0.5, frequency: 900, gain: 0.7, sweepTo: 60 }); tone({ frequency: 90, seconds: 0.5, gain: 0.5, slideTo: 30 }); },
    beep(final = false) { tone({ frequency: final ? 1560 : 1180, seconds: 0.07, gain: 0.25 }); },
    plant() { tone({ frequency: 880, seconds: 0.12, gain: 0.22 }); tone({ frequency: 1174, seconds: 0.16, gain: 0.22, when: 0.12 }); },
    buy() { tone({ frequency: 660, seconds: 0.05, gain: 0.2 }); tone({ frequency: 990, seconds: 0.07, gain: 0.2, when: 0.05 }); },
    deny() { tone({ frequency: 220, seconds: 0.12, gain: 0.2, type: 'square' }); },
    roundWin() { [523, 659, 784].forEach((f, i) => tone({ frequency: f, seconds: 0.16, gain: 0.22, when: i * 0.12 })); },
    roundLose() { [392, 330, 262].forEach((f, i) => tone({ frequency: f, seconds: 0.18, gain: 0.2, when: i * 0.13 })); },
    step() { burst({ seconds: 0.05, frequency: 500, gain: 0.05, sweepTo: 200 }); },
  };
}
