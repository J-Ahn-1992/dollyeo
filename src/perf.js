// 공연 모드: 쇼츠용 세로(9:16) 화면에 원판을 크게 띄우고, 화면과 소리를 영상으로 저장
import { INST } from './constants.js';
import * as M from './model.js';
import { drawDisc, geom } from './draw.js';
import { $ } from './util.js';

const W = 1080, H = 1920;
// 공연 화면은 앱 테마와 상관없이 항상 어두운 무대
const PT = {
  disc: '#1B2130', 'disc-line': '#3A4560', slot: '#4A5675', hub: '#2A3246', 'hub-fg': '#E6E9F0',
  needle: '#FFD25A', glow: '#FFD25A', note: '#3FD6C8', chord: '#C08BF5', accent: '#A9BCF5'
};
const SITE_HOST = 'dollyeo-sigma.vercel.app';

// app: { S, player, lastHit, hitKey, secById, exporter, onPlayChange() }
export function initPerf(app){
  const { S, player } = app;
  const root = $('perf'), cv = $('perfCanvas'), ctx = cv.getContext('2d');
  const playBtn = $('perfPlay'), recBtn = $('perfRec'), saveBtn = $('perfSave'), status = $('perfStatus');
  let open = false, queue = [], particles = [], pulse = 0, lastT = 0, recording = false, video = null;
  const discGeo = {};
  const glowT = {};
  const host = window.STANDALONE ? location.host : SITE_HOST;

  // ---------- 열고 닫기 ----------
  function show(){
    open = true; root.hidden = false; document.body.classList.add('perf-open');
    saveBtn.hidden = true; status.textContent = '';
    renderPlay();
  }
  function hide(){
    if (recording) return;
    open = false; root.hidden = true; document.body.classList.remove('perf-open');
    particles = []; queue = [];
  }
  function renderPlay(){ playBtn.textContent = player.playing ? '■ 정지' : '▶ 재생'; }
  $('perfOpen').addEventListener('click', show);
  $('perfClose').addEventListener('click', hide);
  playBtn.addEventListener('click', () => { player.toggle(); renderPlay(); app.onPlayChange(); });
  document.addEventListener('keydown', e => { if (open && e.key === 'Escape') hide(); });

  // ---------- 코인이 울릴 때 효과 ----------
  function onHit(e, time){ if (open) queue.push({ e, time }); }
  function spawn(e){
    const geo = discGeo[e.t];
    if (e.inst === 'drum'){
      if (e.r === 0) pulse = Math.max(pulse, 0.55 + 0.25 * (e.c.v ?? 1));
      if (!geo) return;
    }
    if (!geo) return;
    const g = geom(geo.size, geo.rings, geo.slots);
    const x = geo.x + g.c, y = geo.y + g.c - (g.hub + (e.r + 0.5) * g.ringW);
    const col = e.inst === 'drum' ? '#FFD25A' : (e.c.t === 'c' ? PT.chord : PT.note);
    const n = (e.inst === 'drum' ? 4 : 9) + 4 * (e.c.v ?? 1) + (e.c.t === 'c' ? 6 : 0);
    const scale = geo.size / 900;
    for (let i = 0; i < n; i++){
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, sp = (220 + Math.random() * 420) * scale;
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.7 + Math.random() * 0.5, age: 0, size: (6 + Math.random() * 9) * Math.max(0.5, scale), col });
    }
    glowT[e.t] = 1;
  }

  // ---------- 그리기 ----------
  function roundRect(x, y, w, h, r){
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  }
  function fitText(text, maxW, size, family, weight = ''){
    let s = size;
    do { ctx.font = `${weight} ${s}px ${family}`; s -= 4; } while (ctx.measureText(text).width > maxW && s > 28);
  }

  function drawTrack(t, x, y, size, loc, sec, now){
    const tr = S.song.tracks[t], part = sec.parts[t];
    if (!part) return;
    const d = loc.bar.b % part.count, disc = part.discs[d], slots = disc.g[0].length;
    const info = M.ringInfo(tr.inst, tr.scale, S.song.mood);
    discGeo[t] = { x, y, size, rings: info.length, slots };
    ctx.save();
    ctx.globalAlpha = tr.mute ? 0.35 : 1;
    // 울릴 때 원판 둘레가 빛남
    const gl = glowT[t] || 0;
    if (gl > 0.01){
      ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size * 0.475 + 6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,210,90,' + (0.55 * gl) + ')'; ctx.lineWidth = 6 + 14 * gl; ctx.stroke();
    }
    ctx.translate(x, y);
    drawDisc(ctx, size, {
      info, grid: disc.g, spec: M.gridSpec(sec.meter, disc.div), pos: loc.frac * slots, needle: true, tok: PT,
      hubText: [INST[tr.inst].name, ''],
      flash: (r, k) => {
        const h = app.lastHit.get(app.hitKey(loc.bar.sid, t, d, r, k));
        if (h == null) return 0;
        const a = now - h;
        return (a >= 0 && a < 0.4) ? 1 - a / 0.4 : 0;
      }
    });
    ctx.restore();
  }

  function render(){
    const now = player.now();
    const t = performance.now() / 1000, dt = Math.min(0.05, lastT ? t - lastT : 0.016);
    lastT = t;
    // 지금 소리 나는 코인의 효과를 꺼냄
    while (queue.length && queue[0].time <= now + 0.01){ spawn(queue.shift().e); }
    if (queue.length > 400) queue = queue.slice(-200);

    const tl = player.tl, loc = M.locate(tl, player.pos()), sec = app.secById(loc.bar.sid);

    // 배경
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#1B2550'); bg.addColorStop(0.55, '#0E1428'); bg.addColorStop(1, '#06080F');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    if (pulse > 0.01){
      const rg = ctx.createRadialGradient(W / 2, 790, 80, W / 2, 790, 820);
      rg.addColorStop(0, 'rgba(46,196,182,' + (0.32 * pulse) + ')'); rg.addColorStop(1, 'rgba(46,196,182,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    }

    // 곡 이름
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    const name = (S.songName || '').trim() || '이름 없는 곡';
    fitText(name, W - 160, 88, '"Do Hyeon", sans-serif');
    ctx.fillText(name, W / 2, 170);
    ctx.fillStyle = 'rgba(230,233,240,0.62)';
    ctx.font = '500 34px "IBM Plex Sans KR", sans-serif';
    ctx.fillText('돌려돌려 작곡판으로 만든 곡', W / 2, 236);

    // 원판: 고른 악기를 크게, 나머지는 아래에 작게
    const others = S.song.tracks.map((_, i) => i).filter(i => i !== S.sel.t);
    const big = others.length ? 860 : 960;
    drawTrack(S.sel.t, (W - big) / 2, 320, big, loc, sec, now);
    if (others.length){
      const n = others.length, size = n === 1 ? 360 : n === 2 ? 320 : 290, cy = 1210;
      others.forEach((ti, i) => {
        const cx = W * (i + 1) / (n + 1);
        drawTrack(ti, cx - size / 2, cy, size, loc, sec, now);
        ctx.fillStyle = 'rgba(230,233,240,0.75)'; ctx.font = '500 32px "IBM Plex Sans KR", sans-serif';
        ctx.textAlign = 'center'; ctx.fillText(INST[S.song.tracks[ti].inst].name, cx, cy + size + 34);
      });
    }

    // 구간 순서(또는 마디) 막대
    const by = 1700;
    if (tl.order.length > 1){
      const n = tl.order.length, gap = 12, bw = Math.min(110, (W - 160 - gap * (n - 1)) / n), total = n * bw + gap * (n - 1);
      tl.order.forEach((sid, i) => {
        const x = (W - total) / 2 + i * (bw + gap), cur = i === loc.bar.oi;
        roundRect(x, by - 44, bw, 88, 18);
        ctx.fillStyle = cur ? '#FFD25A' : 'rgba(255,255,255,0.1)'; ctx.fill();
        ctx.fillStyle = cur ? '#1A2030' : 'rgba(230,233,240,0.8)';
        ctx.font = `${Math.min(52, bw * 0.55)}px "Do Hyeon", sans-serif`; ctx.textAlign = 'center';
        ctx.fillText(sid, x + bw / 2, by + 2);
      });
    } else {
      const n = tl.bars.length, gap = 18, r = 13, total = n * r * 2 + (n - 1) * gap;
      for (let i = 0; i < n; i++){
        ctx.beginPath(); ctx.arc((W - total) / 2 + r + i * (r * 2 + gap), by, r, 0, Math.PI * 2);
        ctx.fillStyle = i === loc.i ? '#FFD25A' : 'rgba(255,255,255,0.18)'; ctx.fill();
      }
    }

    // 주소
    ctx.fillStyle = 'rgba(230,233,240,0.7)'; ctx.font = '600 36px "IBM Plex Sans KR", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('♪ ' + host, W / 2, 1830);

    // 반짝이
    for (let i = particles.length - 1; i >= 0; i--){
      const p = particles[i];
      p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 700 * dt;
      const k = 1 - p.age / p.life;
      if (k <= 0){ particles.splice(i, 1); continue; }
      ctx.globalAlpha = k; ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * k), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    pulse *= Math.pow(0.02, dt);
    for (const k in glowT) glowT[k] *= Math.pow(0.01, dt);
  }

  // ---------- 영상 저장 ----------
  const vMime = (() => {
    if (!window.MediaRecorder || !cv.captureStream) return null;
    for (const [m, ext] of [
      ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'mp4'], ['video/mp4;codecs=avc1,mp4a.40.2', 'mp4'],
      ['video/mp4;codecs=avc1,opus', 'mp4'], ['video/mp4', 'mp4'],
      ['video/webm;codecs=vp9,opus', 'webm'], ['video/webm;codecs=vp8,opus', 'webm'], ['video/webm', 'webm']
    ]){
      try { if (MediaRecorder.isTypeSupported(m)) return { m, ext }; } catch (e){}
    }
    return null;
  })();
  if (!vMime){ recBtn.disabled = true; status.textContent = '이 브라우저는 영상 저장을 지원하지 않아요. 최신 Chrome이나 Safari를 써 주세요.'; }

  recBtn.addEventListener('click', async () => {
    if (recording || !vMime) return;
    recording = true; video = null; saveBtn.hidden = true;
    root.classList.add('recording');
    [recBtn, playBtn, $('perfClose'), $('perfLoops')].forEach(b => b.disabled = true);
    try {
      const loops = +$('perfLoops').value;
      player.stop(); player.seek(0);
      particles = []; queue = [];
      const audio = player.audioStream();
      const stream = new MediaStream([...cv.captureStream(30).getVideoTracks(), ...audio.getAudioTracks()]);
      const rec = new MediaRecorder(stream, { mimeType: vMime.m, videoBitsPerSecond: 8_000_000 });
      const chunks = [];
      rec.ondataavailable = ev => { if (ev.data && ev.data.size) chunks.push(ev.data); };
      const done = new Promise(res => rec.onstop = res);
      rec.start(500);
      player.start(); renderPlay(); app.onPlayChange();
      // 곡을 정확히 정해진 횟수만큼 녹화하면 쇼츠에서 끊김 없이 반복돼 보임
      const dur = player.secondsOf(player.tl.totalQ) * loops, t0 = performance.now();
      await new Promise(res => {
        const tick = () => {
          const el = (performance.now() - t0) / 1000;
          status.textContent = '녹화 중 ' + Math.min(Math.floor(el), Math.ceil(dur)) + ' / ' + Math.ceil(dur) + '초 · 화면을 켜 둔 채 기다려 주세요';
          if (el >= dur + 0.05) res(); else setTimeout(tick, 100);
        };
        tick();
      });
      rec.stop(); player.stop(); renderPlay(); app.onPlayChange();
      await done;
      video = new Blob(chunks, { type: vMime.m });
      status.textContent = '완성! "영상 받기"를 눌러 저장하세요. (' + vMime.ext.toUpperCase() + ', ' + (video.size / 1048576).toFixed(1) + 'MB)';
      saveBtn.hidden = false;
    } catch (e){
      status.textContent = '영상을 만들지 못했어요. 다시 시도해 주세요.';
      player.stop(); renderPlay(); app.onPlayChange();
    } finally {
      recording = false; root.classList.remove('recording');
      [recBtn, playBtn, $('perfClose'), $('perfLoops')].forEach(b => b.disabled = false);
      recBtn.disabled = !vMime;
    }
  });

  saveBtn.addEventListener('click', async () => {
    if (!video) return;
    const base = ((S.songName || '').trim() || '내 곡').replace(/[\\/:*?"<>|]/g, '');
    try {
      const r = await app.exporter.saveFile(video, base + ' 공연.' + vMime.ext);
      status.textContent = r === 'site' ? '영상을 받았어요. 다운로드 폴더를 확인해 주세요.' : '저장했어요.';
    } catch (e){
      status.textContent = e && e.code === 'declined' ? '저장을 취소했어요. 다시 누르면 저장할 수 있어요.'
        : e && e.code === 'rate_limited' ? '잠시 후 다시 눌러 주세요.'
        : '이 화면에서는 파일을 저장할 수 없어요.';
    }
  });

  return {
    onHit, renderPlay,
    get isOpen(){ return open; },
    frame(){ if (open) render(); }
  };
}
