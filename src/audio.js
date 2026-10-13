// 소리 만들기. 실시간 재생과 오디오 파일 만들기가 같은 엔진을 씀
import { VEL_GAIN } from './constants.js';
import { notesFor } from './model.js';

const midiFreq = m => 440 * Math.pow(2, (m - 69) / 12);

// 악기별 소리 모양
// 지속형(피아노·오르골·베이스): 장음이면 일정한 크기로 이어지다 끝에서 사라짐
// 타악형(칼림바·마림바): 두드리는 악기라 장음이면 더 오래 울림
const VOICE = {
  piano:    { peak: 0.2,  tc: 0.45, sus: 0.35, rel: 0.18 },
  musicbox: { peak: 0.15, tc: 0.6,  sus: 0.25, rel: 0.25 },
  bass:     { peak: 0.3,  tc: 0.15, sus: 0.7,  rel: 0.08 },
  kalimba:  { peak: 0.26, tc: 0.32, perc: true },
  marimba:  { peak: 0.3,  tc: 0.2,  perc: true }
};

// 방 울림(리버브)용 잔향 소리를 직접 만듦
function makeImpulse(ctx, seconds, decay){
  const len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++){
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

export class Engine {
  constructor(ctx){
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.connect(ctx.destination);
    this.comp = comp;
    // 멜로디 악기는 울림을 넉넉히, 드럼은 살짝만
    const rev = ctx.createConvolver();
    rev.buffer = makeImpulse(ctx, 2.2, 3.2);
    this.master = ctx.createGain(); this.master.gain.value = 0.6;
    this.drumBus = ctx.createGain(); this.drumBus.gain.value = 0.6;
    const wetMel = ctx.createGain(); wetMel.gain.value = 0.24;
    const wetDrum = ctx.createGain(); wetDrum.gain.value = 0.06;
    this.master.connect(comp); this.master.connect(wetMel); wetMel.connect(rev);
    this.drumBus.connect(comp); this.drumBus.connect(wetDrum); wetDrum.connect(rev);
    const revOut = ctx.createGain(); revOut.gain.value = 0.9;
    rev.connect(revOut); revOut.connect(comp);

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
  partial(f, t, peak, decay, dest, type = 'sine'){
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0005, t + decay);
    g.connect(dest);
    this.osc(type, f, t, t + decay + 0.02, g);
  }

  voice(out, inst, midi, t, dur, long, level){
    const ctx = this.ctx, V = VOICE[inst], f = midiFreq(midi), peak = V.peak * level;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    let end;
    if (V.perc){
      const tc = V.tc * (long ? 1 + Math.min(dur, 2) * 1.5 : 1);
      g.gain.linearRampToValueAtTime(peak, t + 0.003);
      g.gain.setTargetAtTime(0.0001, t + 0.003, tc);
      end = t + tc * 6 + 0.05;
    } else {
      g.gain.linearRampToValueAtTime(peak, t + 0.006);
      let hold = null;
      if (long){ g.gain.setTargetAtTime(peak * V.sus, t + 0.006, V.tc); hold = t + dur; }
      else if (inst === 'bass'){ g.gain.setTargetAtTime(peak * V.sus, t + 0.006, V.tc); hold = t + 0.22; }
      else g.gain.setTargetAtTime(0.0001, t + 0.006, V.tc);
      if (hold) g.gain.setTargetAtTime(0.0001, hold, V.rel);
      end = (hold || t) + 2.2;
    }
    g.connect(out);

    if (inst === 'piano'){
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(5000, t); lp.frequency.exponentialRampToValueAtTime(900, t + 0.9);
      lp.connect(g);
      this.osc('triangle', f, t, end, lp);
      this.osc('sine', f * 2, t, end, lp).detune.value = 4;
    } else if (inst === 'musicbox'){
      this.osc('sine', f, t, end, g);
      this.partial(f * 3.01, t, 0.25, 0.35, g);
    } else if (inst === 'bass'){
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 5;
      lp.frequency.setValueAtTime(1100, t); lp.frequency.exponentialRampToValueAtTime(320, t + 0.4);
      lp.connect(g);
      this.osc('sawtooth', f, t, end, lp);
    } else if (inst === 'kalimba'){
      // 쇠막대를 튕기는 소리: 맑은 기본음 + 금속성 배음 + 튕기는 순간의 딸깍
      this.osc('sine', f, t, end, g);
      this.partial(f * 5.4, t, 0.16, 0.12, g);
      this.partial(f * 2, t, 0.08, 0.5, g);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3500;
      const ck = ctx.createGain(); ck.gain.setValueAtTime(0.1, t); ck.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
      hp.connect(ck); ck.connect(g);
      this.noiseSrc(t, 0.03, hp);
    } else if (inst === 'marimba'){
      // 나무 건반을 채로 치는 소리: 둥근 기본음 + 나무 특유의 높은 배음
      this.osc('sine', f, t, end, g);
      this.partial(f * 3.93, t, 0.32, 0.22, g);
      this.partial(f * 9.8, t, 0.1, 0.05, g);
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

  // 코인을 놓을 때 나는 "짤랑": 높은 금속음이 두 번 (떨어지고, 한 번 튐)
  clink(t){
    [[0, 0.06], [0.07, 0.025]].forEach(([dt, amp]) => {
      const g = this.ctx.createGain(); g.connect(this.drumBus);
      g.gain.setValueAtTime(amp, t + dt);
      g.gain.exponentialRampToValueAtTime(0.0003, t + dt + 0.16);
      [2950, 4420, 6230].forEach((f, i) => {
        const o = this.osc('sine', f * (1 + (Math.random() - 0.5) * 0.02), t + dt, t + dt + 0.18, g);
        o.detune.value = i * 7;
      });
    });
  }

  playCoin(inst, scale, mood, ring, c, t, durSec){
    const out = this.ctx.createGain();
    out.gain.value = VEL_GAIN[c.v ?? 1];
    if (inst === 'drum'){ out.connect(this.drumBus); return this.drum(out, ring, t); }
    out.connect(this.master);
    const notes = notesFor(inst, scale, mood, ring, c);
    const level = notes.length > 1 ? 0.62 : 1;
    notes.forEach(m => this.voice(out, inst, m, t, durSec, c.l > 1, level));
  }
}
