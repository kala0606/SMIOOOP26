// audio.js — a tiny WebAudio house kit, all synthesised (no samples).
// main.js decides WHAT plays and WHEN (from the cubes' positions);
// this file only knows HOW each sound is made.

export class HouseEngine {
  constructor() {
    this.ctx = null;
    this.on = false;
  }

  async start() {
    if (!this.ctx) this.#build();
    await this.ctx.resume();
    this.on = true;
  }

  async stop() {
    this.on = false;
    if (this.ctx) await this.ctx.suspend();
  }

  #build() {
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());

    // master -> glue compressor -> out
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    this.master.connect(comp).connect(ctx.destination);

    // everything melodic goes through `duck`, which pumps on every kick (sidechain feel)
    this.duck = ctx.createGain();
    this.duck.connect(this.master);

    // reverb
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.#impulse(2.4, 3.2);
    this.verbSend = ctx.createGain();
    this.verbSend.gain.value = 0.3;
    this.verbSend.connect(this.verb).connect(this.duck);

    // dotted-eighth delay (375 ms at 120 bpm)
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.375;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const dlp = ctx.createBiquadFilter();
    dlp.type = "lowpass";
    dlp.frequency.value = 2200;
    this.delay.connect(dlp).connect(fb).connect(this.delay);
    dlp.connect(this.duck);
    this.delaySend = ctx.createGain();
    this.delaySend.gain.value = 0.22;
    this.delaySend.connect(this.delay);

    this.noise = this.#noiseBuffer();
  }

  #impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  #noiseBuffer() {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  #noiseSrc(t, dur) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.start(t, Math.random() * 0.5, dur + 0.05);
    return src;
  }

  #env(gainNode, t, peak, attack, decay) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(peak, t + attack);
    g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  // ---------- drums ----------

  kick(t) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.11);
    this.#env(g, t, 1.0, 0.002, 0.42);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.5);

    // click on top
    const n = this.#noiseSrc(t, 0.02);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 3000;
    const ng = ctx.createGain();
    this.#env(ng, t, 0.25, 0.001, 0.015);
    n.connect(hp).connect(ng).connect(this.master);

    // sidechain pump
    const d = this.duck.gain;
    d.setValueAtTime(0.25, t);
    d.linearRampToValueAtTime(1, t + 0.24);
  }

  clap(t) {
    const ctx = this.ctx;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1300;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    // three quick hits then a tail = classic clap
    [0, 0.011, 0.022].forEach((o) => {
      g.gain.setValueAtTime(0.55, t + o);
      g.gain.exponentialRampToValueAtTime(0.08, t + o + 0.009);
    });
    g.gain.setValueAtTime(0.4, t + 0.031);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    const n = this.#noiseSrc(t, 0.25);
    n.connect(bp).connect(g);
    g.connect(this.master);
    const send = ctx.createGain();
    send.gain.value = 0.25;
    g.connect(send).connect(this.verbSend);
  }

  hat(t, open, vel = 1, pan = 0) {
    const ctx = this.ctx;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = open ? 7000 : 9000;
    const g = ctx.createGain();
    this.#env(g, t, (open ? 0.22 : 0.09) * vel, 0.002, open ? 0.18 : 0.035);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    this.#noiseSrc(t, open ? 0.22 : 0.05).connect(hp).connect(g).connect(p).connect(this.master);
  }

  // ---------- tonal ----------

  bass(t, freq, dur = 0.2) {
    const ctx = this.ctx;
    const saw = ctx.createOscillator();
    saw.type = "sawtooth";
    saw.frequency.value = freq;
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = freq;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 6;
    lp.frequency.setValueAtTime(1100, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + dur);
    const g = ctx.createGain();
    this.#env(g, t, 0.32, 0.005, dur);
    const sg = ctx.createGain();
    sg.gain.value = 0.6;
    saw.connect(lp).connect(g);
    sub.connect(sg).connect(g);
    g.connect(this.duck);
    saw.start(t);
    sub.start(t);
    saw.stop(t + dur + 0.05);
    sub.stop(t + dur + 0.05);
  }

  // short bright note: one per tumbling cube
  pluck(t, freq, pan = 0, vel = 1) {
    const ctx = this.ctx;
    const a = ctx.createOscillator();
    const b = ctx.createOscillator();
    a.type = "square";
    b.type = "triangle";
    a.frequency.value = freq;
    b.frequency.value = freq * 2.003;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 4;
    lp.frequency.setValueAtTime(4200, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + 0.25);
    const g = ctx.createGain();
    this.#env(g, t, 0.12 * vel, 0.003, 0.32);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    a.connect(lp);
    b.connect(lp);
    lp.connect(g).connect(p);
    p.connect(this.duck);
    p.connect(this.verbSend);
    p.connect(this.delaySend);
    a.start(t);
    b.start(t);
    a.stop(t + 0.4);
    b.stop(t + 0.4);
  }

  // woodblock "tick" / "tock" when a cube lands back home
  tock(t, freq, pan = 0) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(freq * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.01);
    const g = ctx.createGain();
    this.#env(g, t, 0.22, 0.001, 0.07);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    o.connect(g).connect(p);
    p.connect(this.master);
    p.connect(this.verbSend);
    o.start(t);
    o.stop(t + 0.1);
  }

  // soft chord bed, one chord per second
  pad(t, freqs, dur) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.linearRampToValueAtTime(1400, t + dur * 0.6);
    lp.frequency.linearRampToValueAtTime(700, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.06);
    g.gain.setValueAtTime(0.05, t + dur - 0.08);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    lp.connect(g);
    g.connect(this.duck);
    g.connect(this.verbSend);
    for (const f of freqs) {
      for (const det of [-8, 8]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = f;
        o.detune.value = det;
        o.connect(lp);
        o.start(t);
        o.stop(t + dur + 0.02);
      }
    }
  }
}
