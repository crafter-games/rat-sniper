export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ambienceStarted = false;
    this.noiseBuffer = null;
    this.lastHeartbeat = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.72;
    this.master.connect(this.ctx.destination);

    // Pre-generate 2 seconds of white noise
    const sr = this.ctx.sampleRate;
    this.noiseBuffer = this.ctx.createBuffer(1, sr * 2, sr);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    this.startAmbience();
  }

  startAmbience() {
    if (this.ambienceStarted || !this.ctx) return;
    this.ambienceStarted = true;

    // Low night wind rumble
    const windSrc = this.ctx.createBufferSource();
    windSrc.buffer = this.noiseBuffer;
    windSrc.loop = true;

    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = "lowpass";
    windFilter.frequency.value = 180;

    const windGain = this.ctx.createGain();
    windGain.gain.value = 0.045;

    windSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(this.master);
    windSrc.start();

    // Periodic distant farm crickets
    const scheduleCricket = () => {
      if (!this.ctx || this.ctx.state === "closed") return;
      if (this.ctx.state === "running" && Math.random() < 0.75) {
        this.playCricket(Math.random() * 1.4 - 0.7);
      }
      setTimeout(scheduleCricket, 900 + Math.random() * 2200);
    };
    setTimeout(scheduleCricket, 700);
  }

  playCricket(pan = 0) {
    const now = this.ctx.currentTime;
    const pulses = 3 + Math.floor(Math.random() * 3);
    const freq = 4150 + Math.random() * 320;

    const panner = this.ctx.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(this.master);

    for (let i = 0; i < pulses; i++) {
      const t = now + i * 0.048;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.011, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);

      osc.connect(gain);
      gain.connect(panner);
      osc.start(t);
      osc.stop(t + 0.04);
    }
  }

  // Suppressed .22 PCP air rifle shot: crisp valve snap + suppressed air puff
  playShot() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // 1. Hammer/valve mechanical snap
    const snapOsc = this.ctx.createOscillator();
    const snapGain = this.ctx.createGain();
    snapOsc.type = "triangle";
    snapOsc.frequency.setValueAtTime(340, now);
    snapOsc.frequency.exponentialRampToValueAtTime(68, now + 0.045);
    snapGain.gain.setValueAtTime(0.32, now);
    snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    snapOsc.connect(snapGain);
    snapGain.connect(this.master);
    snapOsc.start(now);
    snapOsc.stop(now + 0.06);

    // 2. Suppressed air burst ("pffft-thwip")
    const puff = this.ctx.createBufferSource();
    puff.buffer = this.noiseBuffer;

    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(1650, now);
    bp.frequency.exponentialRampToValueAtTime(420, now + 0.09);
    bp.Q.value = 1.1;

    const puffGain = this.ctx.createGain();
    puffGain.gain.setValueAtTime(0.42, now);
    puffGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    puff.connect(bp);
    bp.connect(puffGain);
    puffGain.connect(this.master);
    puff.start(now);
    puff.stop(now + 0.12);
  }

  playBoltCycle() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const click = (offset, freq, dur, vol) => {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filt = this.ctx.createBiquadFilter();
      filt.type = "bandpass";
      filt.frequency.value = freq;
      filt.Q.value = 3.2;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, now + offset);
      g.gain.exponentialRampToValueAtTime(0.001, now + offset + dur);
      src.connect(filt);
      filt.connect(g);
      g.connect(this.master);
      src.start(now + offset);
      src.stop(now + offset + dur + 0.01);
    };
    click(0.0, 2600, 0.035, 0.11);
    click(0.11, 1950, 0.045, 0.13);
    click(0.24, 3100, 0.03, 0.1);
  }

  playReload() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const seq = [
      [0.0, 1800, 0.05, 0.14],
      [0.28, 1200, 0.06, 0.12],
      [0.62, 2400, 0.045, 0.16],
      [0.85, 2900, 0.04, 0.15],
      [1.08, 1950, 0.05, 0.14],
    ];
    for (const [offset, freq, dur, vol] of seq) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filt = this.ctx.createBiquadFilter();
      filt.type = "bandpass";
      filt.frequency.value = freq;
      filt.Q.value = 2.6;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, now + offset);
      g.gain.exponentialRampToValueAtTime(0.001, now + offset + dur);
      src.connect(filt);
      filt.connect(g);
      g.connect(this.master);
      src.start(now + offset);
      src.stop(now + offset + dur + 0.01);
    }
  }

  playDryFire() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.02);
    g.gain.setValueAtTime(0.12, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
    osc.connect(g);
    g.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.03);
  }

  // Distinct pellet impacts: "rat", "headshot", "concrete", "dirt", "jug", "wood"
  playImpact(material, pan = 0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = Math.max(-0.9, Math.min(0.9, pan));
    panner.connect(this.master);

    if (material === "rat" || material === "headshot") {
      // Crisp wet thwack characteristic of pellet impact on game
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(material === "headshot" ? 260 : 185, now);
      osc.frequency.exponentialRampToValueAtTime(52, now + 0.075);
      g.gain.setValueAtTime(material === "headshot" ? 0.55 : 0.42, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
      osc.connect(g);
      g.connect(panner);
      osc.start(now);
      osc.stop(now + 0.09);

      const slap = this.ctx.createBufferSource();
      slap.buffer = this.noiseBuffer;
      const filt = this.ctx.createBiquadFilter();
      filt.type = "bandpass";
      filt.frequency.value = material === "headshot" ? 1900 : 1150;
      filt.Q.value = 1.4;
      const sg = this.ctx.createGain();
      sg.gain.setValueAtTime(0.32, now);
      sg.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
      slap.connect(filt);
      filt.connect(sg);
      sg.connect(panner);
      slap.start(now);
      slap.stop(now + 0.06);
      return;
    }

    if (material === "jug") {
      // Hollow plastic jug thunk
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.11);
      g.gain.setValueAtTime(0.34, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      osc.connect(g);
      g.connect(panner);
      osc.start(now);
      osc.stop(now + 0.14);
      return;
    }

    if (material === "concrete" || material === "metal") {
      // Sharp stone/metal smack + brief ricochet whine
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const hp = this.ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 1400;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.35, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
      src.connect(hp);
      hp.connect(g);
      g.connect(panner);
      src.start(now);
      src.stop(now + 0.07);

      if (Math.random() < 0.65) {
        const ric = this.ctx.createOscillator();
        const rg = this.ctx.createGain();
        ric.type = "sine";
        ric.frequency.setValueAtTime(2800 + Math.random() * 900, now + 0.01);
        ric.frequency.exponentialRampToValueAtTime(750, now + 0.19);
        rg.gain.setValueAtTime(0.08, now + 0.01);
        rg.gain.exponentialRampToValueAtTime(0.0008, now + 0.2);
        ric.connect(rg);
        rg.connect(panner);
        ric.start(now + 0.01);
        ric.stop(now + 0.21);
      }
      return;
    }

    // Dirt / wood thud
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = material === "wood" ? 850 : 520;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.26, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    src.connect(lp);
    lp.connect(g);
    g.connect(panner);
    src.start(now);
    src.stop(now + 0.08);
  }

  playZoomClick() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(980, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.02);
    g.gain.setValueAtTime(0.07, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
    osc.connect(g);
    g.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.03);
  }

  playHeartbeat(nowMs) {
    if (!this.ctx || nowMs - this.lastHeartbeat < 760) return;
    this.lastHeartbeat = nowMs;
    const now = this.ctx.currentTime;
    const beat = (offset, amp) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(64, now + offset);
      osc.frequency.exponentialRampToValueAtTime(36, now + offset + 0.11);
      g.gain.setValueAtTime(amp, now + offset);
      g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.13);
      osc.connect(g);
      g.connect(this.master);
      osc.start(now + offset);
      osc.stop(now + offset + 0.14);
    };
    beat(0, 0.13);
    beat(0.17, 0.09);
  }
}
