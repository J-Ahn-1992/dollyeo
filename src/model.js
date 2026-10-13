// 곡 데이터 구조
//
// song = {
//   mood, bpm,
//   tracks:   [{ inst, scale, mute }],                    악기 구성 (모든 구간이 공유)
//   sections: [{ id:'A', label, meter, parts:[...] }],    구간. parts[i]는 tracks[i]의 원판 탑
//   order:    ['A','A','B']                               연주 순서
// }
// part = { count, discs:[ { div:'s'|'t', g: grid } ] }   count장만 연주, discs가 더 길면 숨겨진 여분
// grid[고리][칸] = 코인 | null
// 코인 = { t:'n'(한 음)|'c'(화음), l:길이(칸), v:세기 0~2, a:반음 -1|0|1 }

import { T } from './i18n.js';
import { INST, DRUMS, DRUM_SHORT, SCALE, DIATONIC, PC_NAME, TENSE, METERS, COUNTS, MAX_TRACKS, MAX_ORDER } from './constants.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const coin = (t, l, v, a = 0) => ({ t, l, v, a });

function normCoin(c){
  if (c === true) return coin('n', 1, 1, 0);
  if (c && typeof c === 'object'){
    const v = Number.isFinite(+c.v) ? +c.v : 1;
    return coin(c.t === 'c' ? 'c' : 'n', clamp(+c.l || 1, 1, 64), clamp(v, 0, 2), [-1, 0, 1].includes(+c.a) ? +c.a : 0);
  }
  return null;
}

// ---------- 고리(음 높이) ----------
export function ringCount(inst, scale){
  if (inst === 'drum') return 5;
  const n = scale === 7 ? 7 : 5;
  return inst === 'bass' ? n : n + (n === 7 ? 3 : 2);
}

export function ringInfo(inst, scale, mood){
  if (inst === 'drum') return DRUMS.map((n, i) => ({ label: n, short: DRUM_SHORT[i], high: false, tense: false }));
  const sc = scale === 7 ? 7 : 5, off = SCALE[sc][mood === 'dark' ? 'dark' : 'bright'];
  return Array.from({ length: ringCount(inst, sc) }, (_, i) => {
    const midi = INST[inst].base + off[i % sc] + 12 * Math.floor(i / sc);
    const pc = ((midi % 12) + 12) % 12, high = i >= sc;
    const label = PC_NAME[pc] + (high ? '↑' : '');
    return { label, short: label, high, midi, tense: TENSE.includes(pc) };
  });
}

export function scaleUp(midi, steps){
  let oct = Math.floor(midi / 12), idx = DIATONIC.indexOf(((midi % 12) + 12) % 12);
  for (let i = 0; i < steps; i++){ idx++; if (idx === 7){ idx = 0; oct++; } }
  return oct * 12 + DIATONIC[idx];
}

export function notesFor(inst, scale, mood, ring, c){
  const root = ringInfo(inst, scale, mood)[ring].midi, a = c.a || 0;
  if (c.t !== 'c') return [root + a];
  const ns = inst === 'bass' ? [root, scaleUp(root, 4)] : [root, scaleUp(root, 2), scaleUp(root, 4)];
  return ns.map(m => m + a);
}

// ---------- 박자와 칸 ----------
export const meterOf = m => METERS[m] || METERS['4/4'];
export const canTriplet = meter => !!meterOf(meter).t;
export function gridSpec(meter, div){
  const m = meterOf(meter);
  return (div === 't' && m.t) ? m.t : m.s;
}
export const slotsOf = (meter, div) => gridSpec(meter, div).slots;

// ---------- 원판 ----------
export const emptyGrid = (rings, slots) => Array.from({ length: rings }, () => Array(slots).fill(null));
export const emptyDisc = (rings, slots, div = 's') => ({ div, g: emptyGrid(rings, slots) });
export const cloneDisc = d => ({ div: d.div, g: d.g.map(r => r.map(c => c ? { ...c } : null)) });

function fitGrid(g, rings, slots){
  return Array.from({ length: rings }, (_, r) => Array.from({ length: slots }, (_, s) => normCoin(g && g[r] && g[r][s])));
}

// 칸 k를 차지하고 있는 코인(꼬리 포함)의 시작 칸, 없으면 -1
export function findCoin(g, r, k){
  const n = g[r].length;
  for (let s = 0; s < n; s++){
    const c = g[r][s];
    if (c && ((k - s + n) % n) < Math.min(c.l, n)) return s;
  }
  return -1;
}

// 칸 수가 바뀔 때 코인을 시간 비율대로 옮김
export function regrid(disc, newSlots, newDiv){
  const old = disc.g[0].length, rings = disc.g.length;
  const g = emptyGrid(rings, newSlots);
  let dropped = 0, moved = 0;
  disc.g.forEach((row, r) => row.forEach((c, s) => {
    if (!c) return;
    const exact = s * newSlots / old, ns = Math.round(exact);
    if (ns >= newSlots || g[r][ns]){ dropped++; return; }
    if (Math.abs(exact - ns) > 1e-9) moved++;
    g[r][ns] = { ...c, l: clamp(Math.round(c.l * newSlots / old), 1, newSlots) };
  }));
  return { disc: { div: newDiv, g }, dropped, moved };
}

// ---------- 구간 ----------
export const sectionBars = sec => Math.max(1, ...sec.parts.map(p => p.count));
export const sectionName = sec => sec.label ? sec.id + ' · ' + sec.label : sec.id;

export function nextSectionId(song){
  const used = new Set(song.sections.map(s => s.id));
  for (let i = 0; i < 26; i++){ const id = String.fromCharCode(65 + i); if (!used.has(id)) return id; }
  return 'Z' + used.size;
}

export function newSection(song, id, meter){
  return {
    id, label: '', meter,
    parts: song.tracks.map(tr => ({ count: 1, discs: [emptyDisc(ringCount(tr.inst, tr.scale), slotsOf(meter, 's'))] }))
  };
}
export function cloneSection(sec, id){
  return { id, label: sec.label, meter: sec.meter, parts: sec.parts.map(p => ({ count: p.count, discs: p.discs.slice(0, p.count).map(cloneDisc) })) };
}

// 칸 크기는 그대로 두고 마디 길이만 늘이거나 줄임 (뒤쪽 박이 잘리거나 빈 박이 생김)
function resizeSlots(disc, newSlots){
  const g = emptyGrid(disc.g.length, newSlots);
  let dropped = 0;
  disc.g.forEach((row, r) => row.forEach((c, s) => {
    if (!c) return;
    if (s >= newSlots){ dropped++; return; }
    g[r][s] = { ...c, l: Math.min(c.l, newSlots) };
  }));
  return { disc: { div: disc.div, g }, dropped, moved: 0 };
}

// 박자표 바꾸기: 3/4로 바꾸면 4번째 박이 잘리고, 4/4로 바꾸면 빈 박이 하나 생김
export function convertMeter(sec, meter){
  let dropped = 0, moved = 0;
  const parts = sec.parts.map(p => ({
    count: p.count,
    discs: p.discs.map((d, di) => {
      let cur = d, mv = 0, dr = 0;
      if (d.div === 't' && !canTriplet(meter)){
        const r1 = regrid(d, slotsOf(sec.meter, 's'), 's');
        cur = r1.disc; mv += r1.moved; dr += r1.dropped;
      }
      const r2 = resizeSlots(cur, slotsOf(meter, cur.div));
      dr += r2.dropped;
      if (di < p.count){ dropped += dr; moved += mv; }
      return r2.disc;
    })
  }));
  return { dropped, moved, apply(){ sec.meter = meter; sec.parts = parts; } };
}

// ---------- 악기 ----------
function resizeRings(g, rings){
  const slots = g[0].length;
  return Array.from({ length: rings }, (_, r) => g[r] ? g[r] : Array(slots).fill(null));
}

export function addTrack(song, inst){
  song.tracks.push({ inst, scale: 5, mute: false });
  song.sections.forEach(sec => sec.parts.push({ count: 1, discs: [emptyDisc(ringCount(inst, 5), slotsOf(sec.meter, 's'))] }));
}
export function removeTrack(song, t){
  song.tracks.splice(t, 1);
  song.sections.forEach(sec => sec.parts.splice(t, 1));
}
export function setInstrument(song, t, inst){
  const tr = song.tracks[t];
  tr.inst = inst;
  const rings = ringCount(inst, tr.scale);
  song.sections.forEach(sec => {
    const p = sec.parts[t];
    p.discs = p.discs.map(d => {
      const g = resizeRings(d.g, rings);
      if (inst === 'drum') g.forEach(row => row.forEach(c => { if (c){ c.t = 'n'; c.l = 1; c.a = 0; } }));
      return { div: d.div, g };
    });
  });
}

// 음계를 바꿔도 코인은 같은 음 높이의 고리로 옮겨감
export function convertScale(song, t, to){
  const tr = song.tracks[t], from = tr.scale === 7 ? 7 : 5;
  const oldInfo = ringInfo(tr.inst, from, song.mood), newInfo = ringInfo(tr.inst, to, song.mood);
  let dropped = 0, cleared = 0;
  const next = song.sections.map(sec => sec.parts[t].discs.map((d, di) => {
    const slots = d.g[0].length, ng = emptyGrid(newInfo.length, slots);
    const counts = di < sec.parts[t].count;
    d.g.forEach((row, r) => row.forEach((c, s) => {
      if (!c) return;
      const nr = newInfo.findIndex(x => x.midi === oldInfo[r].midi);
      if (nr < 0){ if (counts) dropped++; return; }
      const nc = { ...c };
      if (to === 5 && nc.a){ nc.a = 0; if (counts) cleared++; }
      ng[nr][s] = nc;
    }));
    return { div: d.div, g: ng };
  }));
  return { dropped, cleared, apply(){ tr.scale = to; song.sections.forEach((sec, i) => sec.parts[t].discs = next[i]); } };
}

// ---------- 시간표 ----------
// 연주 순서를 마디 단위로 펼침. 위치 단위는 4분음표(q)
export function timeline(song){
  const byId = new Map(song.sections.map(s => [s.id, s]));
  let order = song.order.filter(id => byId.has(id));
  if (!order.length) order = [song.sections[0].id];
  const bars = [];
  let q = 0;
  order.forEach((sid, oi) => {
    const sec = byId.get(sid), n = sectionBars(sec), lenQ = meterOf(sec.meter).q;
    for (let b = 0; b < n; b++){ bars.push({ sid, oi, b, startQ: q, lenQ }); q += lenQ; }
  });
  return { bars, totalQ: q, order };
}

export function locate(tl, posQ){
  const bars = tl.bars;
  let lo = 0, hi = bars.length - 1;
  while (lo < hi){ const mid = (lo + hi + 1) >> 1; if (bars[mid].startQ <= posQ + 1e-9) lo = mid; else hi = mid - 1; }
  const bar = bars[lo];
  return { i: lo, bar, frac: clamp((posQ - bar.startQ) / bar.lenQ, 0, 0.999999) };
}

export function buildEvents(song, tl){
  const byId = new Map(song.sections.map(s => [s.id, s]));
  const ev = [];
  tl.bars.forEach(bar => {
    const sec = byId.get(bar.sid);
    song.tracks.forEach((tr, t) => {
      if (tr.mute) return;
      const part = sec.parts[t];
      if (!part) return;
      const d = bar.b % part.count, disc = part.discs[d];
      const slots = disc.g[0].length, sd = bar.lenQ / slots;
      disc.g.forEach((row, r) => row.forEach((c, s) => {
        if (c) ev.push({ q: bar.startQ + s * sd, durQ: Math.min(c.l, slots) * sd, t, r, c, inst: tr.inst, scale: tr.scale, sid: bar.sid, d, s });
      }));
    });
  });
  ev.sort((a, b) => a.q - b.q);
  return ev;
}

// ---------- 정리 ----------
export function normalizeSong(s){
  s.tracks = (s.tracks || []).slice(0, MAX_TRACKS);
  if (!s.tracks.length) s.tracks = [{ inst: 'piano', scale: 5, mute: false }];
  s.sections = s.sections || [];
  if (!s.sections.length) s.sections = [{ id: 'A', label: '', meter: '4/4', parts: [] }];
  const seen = new Set();
  s.sections.forEach(sec => {
    if (!sec.id || seen.has(sec.id)){
      for (let i = 0; i < 26; i++){ const id = String.fromCharCode(65 + i); if (!seen.has(id)){ sec.id = id; break; } }
    }
    seen.add(sec.id);
    if (!METERS[sec.meter]) sec.meter = '4/4';
    sec.label = String(sec.label || '').slice(0, 12);
    const parts = sec.parts || [];
    sec.parts = s.tracks.map((tr, i) => {
      const p = parts[i] || { count: 1, discs: [] };
      const count = COUNTS.includes(p.count) ? p.count : 1, rings = ringCount(tr.inst, tr.scale);
      const src = p.discs || [];
      const discs = Array.from({ length: Math.max(count, src.length) }, (_, d) => {
        const sd = src[d] || src[src.length - 1] || { div: 's', g: [] };
        const div = (sd.div === 't' && canTriplet(sec.meter)) ? 't' : 's';
        return { div, g: fitGrid(sd.g, rings, slotsOf(sec.meter, div)) };
      });
      return { count, discs };
    });
  });
  s.order = (s.order || []).map(String).filter(id => seen.has(id)).slice(0, MAX_ORDER);
  if (!s.order.length) s.order = [s.sections[0].id];
  s.mood = s.mood === 'dark' ? 'dark' : 'bright';
  s.bpm = clamp(Math.round(+s.bpm || 96), 60, 160);
  return s;
}

// ---------- 저장 형식 ----------
// 원판 = "칸 쪼개기:칸.고리.종류.길이.세기.반음,..."
function encDisc(d){
  const out = [];
  d.g.forEach((row, r) => row.forEach((c, s) => { if (c) out.push([s, r, c.t, c.l, c.v, c.a || 0].join('.')); }));
  return d.div + ':' + out.join(',');
}
function decTokens(str, rings, slots){
  const g = emptyGrid(rings, slots);
  if (str) String(str).split(',').forEach(tk => {
    const [s, r, ty, l, v, a] = tk.split('.');
    const S = +s, R = +r;
    if (g[R] && S >= 0 && S < slots) g[R][S] = normCoin({ t: ty, l: +l, v: v === undefined ? 1 : +v, a: +a || 0 });
  });
  return g;
}

export function encodeSong(song){
  return {
    v: 4, mood: song.mood, bpm: song.bpm,
    tracks: song.tracks.map(t => ({ inst: t.inst, scale: t.scale, mute: !!t.mute })),
    sections: song.sections.map(sec => ({
      id: sec.id, label: sec.label || '', meter: sec.meter,
      parts: sec.parts.map(p => ({ count: p.count, discs: p.discs.slice(0, p.count).map(encDisc) }))
    })),
    order: song.order.slice()
  };
}

export function decodeSong(o){
  if (!o || !Array.isArray(o.tracks)) throw new Error('곡 형식이 아니에요');
  if (o.v >= 4){
    const tracks = o.tracks.map(t => ({ inst: INST[t.inst] ? t.inst : 'piano', scale: t.scale === 7 ? 7 : 5, mute: !!t.mute }));
    const sections = (o.sections || []).map(sec => {
      const meter = METERS[sec.meter] ? sec.meter : '4/4';
      return {
        id: String(sec.id || '').slice(0, 2), label: sec.label, meter,
        parts: tracks.map((tr, i) => {
          const p = (sec.parts || [])[i] || { count: 1, discs: [] };
          const count = COUNTS.includes(p.count) ? p.count : 1, rings = ringCount(tr.inst, tr.scale);
          const discs = Array.from({ length: count }, (_, d) => {
            const raw = String((p.discs || [])[d] ?? (p.discs || [])[0] ?? 's:');
            const cut = raw.indexOf(':');
            const div0 = cut >= 0 ? raw.slice(0, cut) : 's', toks = cut >= 0 ? raw.slice(cut + 1) : raw;
            const div = (div0 === 't' && canTriplet(meter)) ? 't' : 's';
            return { div, g: decTokens(toks, rings, slotsOf(meter, div)) };
          });
          return { count, discs };
        })
      };
    });
    return normalizeSong({ mood: o.mood, bpm: o.bpm, tracks, sections, order: o.order });
  }
  // v1~v3: 구간 하나짜리 4/4 곡
  const tracks = [], parts = [];
  o.tracks.forEach(t => {
    const inst = INST[t.inst] ? t.inst : 'piano', scale = t.scale === 7 ? 7 : 5;
    const rings = ringCount(inst, scale), count = COUNTS.includes(t.count) ? t.count : 1;
    const discs = Array.from({ length: count }, (_, d) => {
      const str = String((t.discs || [])[d] ?? '');
      let g;
      if (o.v === 1){
        g = emptyGrid(rings, 16);
        str.split('.').forEach((row, r) => { if (g[r]) Array.from(row).forEach((ch, s) => { if (ch === '1' && s < 16) g[r][s] = coin('n', 1, 1, 0); }); });
      } else g = decTokens(str, rings, 16);
      return { div: 's', g };
    });
    tracks.push({ inst, scale, mute: !!t.mute });
    parts.push({ count, discs });
  });
  return normalizeSong({ mood: o.mood, bpm: o.bpm, tracks, sections: [{ id: 'A', label: '', meter: '4/4', parts }], order: ['A'] });
}

// 예전 버전이 브라우저에 남긴 작업 중인 곡
export function fromLegacyTracks(trs, mood, bpm){
  const tracks = [], parts = [];
  trs.forEach(t => {
    const inst = INST[t.inst] ? t.inst : 'piano', scale = t.scale === 7 ? 7 : 5;
    const rings = ringCount(inst, scale), count = COUNTS.includes(t.count) ? t.count : 1;
    const discs = Array.from({ length: count }, (_, d) => ({ div: 's', g: fitGrid((t.discs || [])[d] || [], rings, 16) }));
    tracks.push({ inst, scale, mute: !!t.mute });
    parts.push({ count, discs });
  });
  return normalizeSong({ mood, bpm, tracks, sections: [{ id: 'A', label: '', meter: '4/4', parts }], order: ['A'] });
}

// ---------- 예시 곡 ----------
function gf(rings, hits, slots = 16){
  const g = emptyGrid(rings, slots);
  hits.forEach(([s, r, t = 'n', l = 1, v = 1, a = 0]) => g[r][s] = coin(t, l, v, a));
  return { div: 's', g };
}

export function demoSong(withChorus){
  const verse = {
    id: 'A', label: withChorus ? T('벌스') : '', meter: '4/4', parts: [
      { count: 1, discs: [gf(5, [[0,0,'n',1,2],[8,0,'n',1,2],[10,0],[4,1],[12,1,'n',1,2],[0,3],[2,3,'n',1,0],[4,3],[6,3,'n',1,0],[8,3],[10,3,'n',1,0],[12,3],[14,4]])] },
      { count: 2, discs: [gf(5, [[0,0,'n',4],[8,3,'n',4]]), gf(5, [[0,4,'n',4],[8,2,'n',2],[12,3,'n',4]])] },
      { count: 4, discs: [
        gf(7, [[0,0,'c',4,0],[0,2,'n',2],[2,3],[4,4,'n',4],[8,3],[12,2,'n',4]]),
        gf(7, [[0,4,'c',4,0],[0,1,'n',2],[4,2],[6,1],[8,0,'n',4],[12,1]]),
        gf(7, [[0,0,'c',4,0],[0,2],[2,3],[4,4],[6,5],[8,6,'n',4,2],[12,5,'n',4]]),
        gf(7, [[0,3,'c',8,0],[0,4,'n',2],[4,5],[8,2],[10,1],[12,0,'n',4]])
      ] }
    ]
  };
  const tracks = [{ inst: 'drum', scale: 5, mute: false }, { inst: 'bass', scale: 5, mute: false }, { inst: 'piano', scale: 5, mute: false }];
  if (!withChorus) return normalizeSong({ mood: 'bright', bpm: 96, tracks, sections: [verse], order: ['A'] });
  const chorus = {
    id: 'B', label: T('후렴'), meter: '4/4', parts: [
      { count: 1, discs: [gf(5, [[0,0,'n',1,2],[6,0],[8,0,'n',1,2],[4,1,'n',1,2],[12,1,'n',1,2],[12,2],[0,3],[4,3],[8,3],[12,3],[2,4],[6,4,'n',1,0],[10,4],[14,4,'n',1,0]])] },
      { count: 2, discs: [gf(5, [[0,3,'n',2],[2,3,'n',1,0],[4,3,'n',2],[8,4,'n',2],[10,4,'n',1,0],[12,4,'n',2]]), gf(5, [[0,2,'n',2],[4,2,'n',2],[8,0,'n',4],[12,3,'n',4]])] },
      { count: 2, discs: [
        gf(7, [[0,3,'c',8,0],[8,0,'c',8,0],[0,5,'n',2,2],[2,6,'n',2],[4,5,'n',2],[6,4,'n',2],[8,5,'n',4],[12,6,'n',4,2]]),
        gf(7, [[0,4,'c',8,0],[8,3,'c',8,0],[0,6,'n',2,2],[2,5,'n',2],[4,6,'n',2],[6,5,'n',2],[8,2,'n',2],[10,1,'n',2],[12,0,'n',4,2]])
      ] }
    ]
  };
  return normalizeSong({ mood: 'bright', bpm: 96, tracks, sections: [verse, chorus], order: ['A', 'B', 'A', 'B'] });
}

export function blankSong(mood = 'bright', bpm = 96){
  const tracks = [{ inst: 'drum', scale: 5, mute: false }, { inst: 'piano', scale: 5, mute: false }];
  const s = normalizeSong({ mood, bpm, tracks, sections: [{ id: 'A', label: '', meter: '4/4', parts: [] }], order: ['A'] });
  return s;
}
