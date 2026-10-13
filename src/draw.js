// 원판 그리기. 2D 편집 화면과 3D 원판 표면이 같은 함수를 씀
import { ACC } from './constants.js';

export function geom(S, rings, slots){
  const c = S / 2, R = S * 0.47, hub = R * 0.18, outer = R * 0.95;
  const ringW = (outer - hub) / rings;
  const innerR = hub + ringW * 0.5;
  const coinR = Math.min(ringW * 0.34, (2 * Math.PI * innerR / slots) * 0.38);
  return { c, R, hub, outer, ringW, coin: coinR, dA: Math.PI * 2 / slots, slots };
}
// 칸 k의 각도. pos만큼 돌아가 있음 (바늘은 맨 위)
export const slotAngle = (g, k, pos) => -Math.PI / 2 - (k - pos) * g.dA;

export function drawCoin(ctx, x, y, R, c, col, fl){
  const rad = R * (1 + fl * 0.3);
  if (fl > 0){
    ctx.beginPath(); ctx.arc(x, y, rad * 1.7 + 4 * fl, 0, Math.PI * 2);
    ctx.globalAlpha = 0.35 * fl; ctx.fillStyle = col; ctx.fill(); ctx.globalAlpha = 1;
  }
  if (c.v === 0){
    ctx.beginPath(); ctx.arc(x, y, rad * 0.78, 0, Math.PI * 2);
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, rad * 0.34); ctx.stroke();
  } else {
    const r0 = c.v === 2 ? rad * 1.05 : rad;
    ctx.beginPath(); ctx.arc(x, y, r0, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r0 * 0.58, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = Math.max(1, r0 * 0.12); ctx.stroke();
    if (c.v === 2){
      ctx.beginPath(); ctx.arc(x, y, r0 * 1.5, 0, Math.PI * 2);
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.2, r0 * 0.2); ctx.stroke();
    }
  }
  if (c.a){
    ctx.font = `700 ${Math.max(9, rad * 1.45)}px "IBM Plex Sans KR", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(2, rad * 0.25); ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(ACC[c.a], x, y + rad * 0.05);
    ctx.fillStyle = '#fff'; ctx.fillText(ACC[c.a], x, y + rad * 0.05);
  }
}

// o: { info, grid, spec:{slots,strong,mid}, pos, needle, labels, hubText, flash(r,k), tok }
export function drawDisc(ctx, S, o){
  const { info, grid, spec, tok } = o;
  const rings = info.length, slots = grid[0].length, g = geom(S, rings, slots), pos = o.pos || 0;

  ctx.beginPath(); ctx.arc(g.c, g.c, g.R, 0, Math.PI * 2); ctx.fillStyle = tok.disc; ctx.fill();

  // 고리 띠를 번갈아 살짝 밝게
  for (let i = 1; i < rings; i += 2){
    ctx.beginPath();
    ctx.arc(g.c, g.c, g.hub + (i + 1) * g.ringW, 0, Math.PI * 2);
    ctx.arc(g.c, g.c, g.hub + i * g.ringW, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(255,255,255,0.045)'; ctx.fill();
  }
  // 파·시 고리는 빗금
  for (let i = 0; i < rings; i++){
    if (!info[i].tense) continue;
    ctx.save();
    ctx.beginPath();
    ctx.arc(g.c, g.c, g.hub + (i + 1) * g.ringW, 0, Math.PI * 2);
    ctx.arc(g.c, g.c, g.hub + i * g.ringW, 0, Math.PI * 2, true);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,210,90,0.16)'; ctx.lineWidth = Math.max(1, S / 300);
    const step = Math.max(5, S / 70);
    for (let x = -S; x < S * 2; x += step){ ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + S, S); ctx.stroke(); }
    ctx.restore();
  }

  ctx.strokeStyle = tok['disc-line']; ctx.lineWidth = Math.max(1, S / 480);
  for (let i = 0; i <= rings; i++){ ctx.beginPath(); ctx.arc(g.c, g.c, g.hub + i * g.ringW, 0, Math.PI * 2); ctx.stroke(); }

  // 칸 경계선. 박이 시작되는 곳은 굵게
  for (let k = 0; k < slots; k++){
    const a = slotAngle(g, k + 0.5, pos), b = k + 1;
    const strong = b % spec.strong === 0, mid = spec.mid && b % spec.mid === 0;
    ctx.beginPath();
    ctx.moveTo(g.c + Math.cos(a) * g.hub, g.c + Math.sin(a) * g.hub);
    ctx.lineTo(g.c + Math.cos(a) * g.outer, g.c + Math.sin(a) * g.outer);
    ctx.lineWidth = strong ? Math.max(2.5, S / 200) : mid ? Math.max(1.5, S / 320) : Math.max(1, S / 520);
    ctx.globalAlpha = strong || mid ? 1 : 0.7;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if (o.needle){
    ctx.beginPath(); ctx.moveTo(g.c, g.c);
    ctx.arc(g.c, g.c, g.outer, -Math.PI / 2 - g.dA * 0.5, -Math.PI / 2 + g.dA * 0.5); ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
  }

  // 빈 칸 점
  ctx.fillStyle = tok.slot;
  for (let r = 0; r < rings; r++){
    const rr = g.hub + (r + 0.5) * g.ringW;
    for (let k = 0; k < slots; k++){
      if (grid[r][k]) continue;
      const a = slotAngle(g, k, pos);
      ctx.beginPath(); ctx.arc(g.c + Math.cos(a) * rr, g.c + Math.sin(a) * rr, Math.max(1.5, g.coin * 0.22), 0, Math.PI * 2); ctx.fill();
    }
  }
  // 장음 꼬리
  for (let r = 0; r < rings; r++){
    const rr = g.hub + (r + 0.5) * g.ringW;
    for (let k = 0; k < slots; k++){
      const c = grid[r][k];
      if (!c || c.l <= 1) continue;
      const l = Math.min(c.l, slots);
      ctx.beginPath();
      ctx.arc(g.c, g.c, rr, slotAngle(g, k + l - 1, pos), slotAngle(g, k, pos));
      ctx.strokeStyle = c.t === 'c' ? tok.chord : tok.note;
      ctx.globalAlpha = 0.45; ctx.lineCap = 'round';
      ctx.lineWidth = g.coin * (c.v === 0 ? 0.7 : c.v === 2 ? 1.5 : 1.15);
      ctx.stroke();
      ctx.globalAlpha = 1; ctx.lineCap = 'butt';
    }
  }
  // 코인
  for (let r = 0; r < rings; r++){
    const rr = g.hub + (r + 0.5) * g.ringW;
    for (let k = 0; k < slots; k++){
      const c = grid[r][k];
      if (!c) continue;
      const a = slotAngle(g, k, pos);
      drawCoin(ctx, g.c + Math.cos(a) * rr, g.c + Math.sin(a) * rr, g.coin, c, c.t === 'c' ? tok.chord : tok.note, o.flash ? o.flash(r, k) : 0);
    }
  }

  // 가운데 축
  ctx.beginPath(); ctx.arc(g.c, g.c, g.hub * 0.84, 0, Math.PI * 2); ctx.fillStyle = tok.hub; ctx.fill();
  if (o.hubText){
    ctx.fillStyle = tok['hub-fg']; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(g.hub * 0.36)}px "Do Hyeon", sans-serif`;
    ctx.fillText(o.hubText[0], g.c, g.c - g.hub * 0.2);
    ctx.font = `${Math.round(g.hub * 0.26)}px "IBM Plex Sans KR", sans-serif`;
    ctx.fillText(o.hubText[1], g.c, g.c + g.hub * 0.25);
  }

  // 바늘 오른쪽에 고정된 음 이름표
  if (o.labels){
    const la = -Math.PI / 2 + 0.45;
    const fs = Math.max(10, Math.min(14, g.ringW * 0.42));
    ctx.font = `600 ${fs}px "IBM Plex Sans KR", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let r = 0; r < rings; r++){
      const rr = g.hub + (r + 0.5) * g.ringW, x = g.c + Math.cos(la) * rr, y = g.c + Math.sin(la) * rr;
      const txt = info[r].short, w = ctx.measureText(txt).width + fs * 0.8, h = fs * 1.45;
      ctx.globalAlpha = 0.88; ctx.fillStyle = tok.hub;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2); else ctx.rect(x - w / 2, y - h / 2, w, h);
      ctx.fill(); ctx.globalAlpha = 1;
      if (info[r].tense){ ctx.strokeStyle = tok.glow; ctx.lineWidth = 1.5; ctx.stroke(); }
      ctx.fillStyle = tok['hub-fg']; ctx.fillText(txt, x, y + 0.5);
    }
  }

  if (o.needle){
    const ny = g.c - g.R;
    ctx.beginPath(); ctx.moveTo(g.c - 9, ny - 2); ctx.lineTo(g.c + 9, ny - 2); ctx.lineTo(g.c, ny + 14); ctx.closePath();
    ctx.fillStyle = tok.needle; ctx.fill();
  }
  return g;
}
