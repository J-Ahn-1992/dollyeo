// 소리 만들기. 실시간 재생과 오디오 파일 만들기가 같은 엔진을 씀
import { VEL_GAIN } from './constants.js';
import { notesFor } from './model.js';

const midiFreq = m => 440 * Math.pow(2, (m - 69) / 12);

// 장음: 처음엔 또렷하게, 그다음 일정한 크기로 유지하다가 끝에서 사라짐
const VOICE = {
  piano:    { peak: 0.2,  tc: 0.45, sus: 0.35, rel: 0.18 },
  musicbox: { peak: 0.15, tc: 0.6,  sus: 0.25, rel: 0.25 },
  bass:     { peak: 0.3,  tc: 0.15, sus: 0.7,  rel: 0.08 }
};

export class Engine {
  constructor(ctx){
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    this.master = ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.comp = comp;
    const n = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = n;
  }

  osc(type, f, t, end, dest){
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = f;
    o.connect(dest); o.start(t); o.stop(end);
    return o;
  }
  noiseSrc(t, dur, dest){
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise; s.connect(dest); s.start(t); s.stop(t + dur);
  }
  env(out, t, peak, decay, attack = 0.005){
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + decay);
    g.connect(out);
    return g;
  }

  voice(out, inst, midi, t, dur, long, level){
    const ctx = this.ctx, V = VOICE[inst], f = midiFreq(midi), peak = V.peak * level;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.006);
    let hold = null;
    if (long){ g.gain.setTargetAtTime(peak * V.sus, t + 0.006, V.tc); hold = t + dur; }
    else if (inst === 'bass'){ g.gain.setTargetAtTime(peak * V.sus, t + 0.006, V.tc); hold = t + 0.22; }
    else g.gain.setTargetAtTime(0.0001, t + 0.006, V.tc);
    if (hold) g.gain.setTargetAtTime(0.0001, hold, V.rel);
    g.connect(out);
    const end = (hold || t) + 2.2;

    if (inst === 'piano'){
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(5000, t); lp.frequency.exponentialRampToValueAtTime(900, t + 0.9);
      lp.connect(g);
      this.osc('triangle', f, t, end, lp);
      this.osc('sine', f * 2, t, end, lp).detune.value = 4;
    } else if (inst === 'musicbox'){
      this.osc('sine', f, t, end, g);
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.25, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      g2.connect(g);
      this.osc('sine', f * 3.01, t, t + 0.4, g2);
    } else if (inst === 'bass'){
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 5;
      lp.frequency.setValueAtTime(1100, t); lp.frequency.exponentialRampToValueAtTime(320, t + 0.4);
      lp.connect(g);
      this.osc('sawtooth', f, t, end, lp);
    }
  }

  drum(out, ring, t){
    const ctx = this.ctx;
    if (ring === 0){ // 킥
      const g = this.env(out, t, 0.9, 0.45, 0.002);
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      o.connect(g); o.start(t); o.stop(t + 0.5);
    } else if (ring === 1){ // 스네어
      const g = this.env(out, t, 0.35, 0.22, 0.002);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.8; bp.connect(g);
      this.noiseSrc(t, 0.25, bp);
      this.osc('triangle', 190, t, t + 0.15, this.env(out, t, 0.25, 0.12, 0.002));
    } else if (ring === 2){ // 박수
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 1.2;
      const g = ctx.createGain(); g.connect(out); bp.connect(g);
      g.gain.setValueAtTime(0.0001, t);
      [0, 0.012, 0.024].forEach(o => { g.gain.setValueAtTime(0.45, t + o); g.gain.exponentialRampToValueAtTime(0.05, t + o + 0.01); });
      g.gain.exponentialRampToValueAtTime(0.0008, t + 0.25);
      this.noiseSrc(t, 0.3, bp);
    } else { // 하이햇
      const open = ring === 4;
      const g = this.env(out, t, open ? 0.16 : 0.14, open ? 0.35 : 0.06, 0.001);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000; hp.connect(g);
      this.noiseSrc(t, open ? 0.4 : 0.08, hp);
    }
  }

  playCoin(inst, scale, mood, ring, c, t, durSec){
    const out = this.ctx.createGain();
    out.gain.value = VEL_GAIN[c.v ?? 1];
    out.connect(this.master);
    if (inst === 'drum') return this.drum(out, ring, t);
    const notes = notesFor(inst, scale, mood, ring, c);
    const level = notes.length > 1 ? 0.62 : 1;
    notes.forEach(m => this.voice(out, inst, m, t, durSec, c.l > 1, level));
  }
}
