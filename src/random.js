// 🎲 랜덤 원판 만들기. 박자표와 칸 수에 맞춰 자연스러운 패턴을 만듦
import { coin, emptyGrid, findCoin } from './model.js';

const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];

// info: 고리 정보, spec: { slots, strong, mid }
export function randomGrid(inst, info, spec){
  const rings = info.length, slots = spec.slots, beat = spec.strong;
  const beats = Math.round(slots / beat);
  const g = emptyGrid(rings, slots);
  const free = (s, r, l) => { for (let i = 0; i < l; i++) if (findCoin(g, r, (s + i) % slots) >= 0) return false; return true; };
  const put = (s, r, t, l, v) => {
    l = Math.max(1, Math.min(l, slots - s));
    if (s < slots && r < rings && free(s, r, l)) g[r][s] = coin(t, l, v, 0);
  };

  if (inst === 'drum'){
    put(0, 0, 'n', 1, 2);
    if (beats === 4) put(2 * beat, 0, 'n', 1, 2);
    const step = spec.mid || (beat % 2 === 0 ? beat / 2 : 1);
    if (Math.random() < 0.6) put(slots - step * (Math.random() < 0.5 ? 1 : 3), 0, 'n', 1, 1);
    const snares = beats === 4 ? [1, 3] : beats === 2 ? [1] : [1, 2];
    snares.forEach((b, i) => put(b * beat, 1, 'n', 1, beats === 3 ? 0 : (i === snares.length - 1 ? 2 : 1)));
    if (Math.random() < 0.3) put(snares[snares.length - 1] * beat, 2, 'n', 1, 1);
    for (let s = 0; s < slots; s += step) put(s, 3, 'n', 1, s % beat === 0 ? 1 : 0);
    if (Math.random() < 0.5) put(slots - step, 4, 'n', 1, 1);
    return g;
  }

  // 화음 뿌리 후보: 낮은 고리 중 도·파·솔·라
  const roots = info.map((x, i) => i).filter(i => i < 5 && [0, 5, 7, 9].includes(((info[i].midi % 12) + 12) % 12));
  const half = beats % 2 === 0 ? (beats / 2) * beat : slots;

  if (inst === 'bass'){
    put(0, pick(roots), 'n', half, 1);
    if (half < slots) put(half, rnd(rings), 'n', half, 1);
    return g;
  }

  put(0, pick(roots), 'c', half, 0);
  if (half < slots) put(half, pick(roots), 'c', half, 0);
  const lo = Math.min(3, rings - 1);
  let r = lo + rnd(rings - lo), s = 0;
  const lens = [1, 1, 2, 2, beat];
  while (s < slots){
    const len = Math.min(pick(lens), slots - s);
    if (Math.random() < 0.75){
      r = Math.max(lo, Math.min(rings - 1, r + Math.round((Math.random() - 0.5) * 4)));
      put(s, r, 'n', len, s % beat === 0 ? 2 : 1);
    }
    s += len;
  }
  return g;
}
