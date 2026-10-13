// 앱 시작점: 상태, 화면 연결, 메인 루프
import { INST, INST_ORDER, MAX_TRACKS, MAX_SECTIONS, MAX_ORDER } from './constants.js';
import * as M from './model.js';
import { createPlayer } from './player.js';
import { drawDisc, geom } from './draw.js';
import { createView3D } from './view3d.js';
import { randomGrid } from './random.js';
import { initSongs } from './songs.js';
import { initExport } from './export.js';
import { initGuide } from './guide.js';
import { initPerf } from './perf.js';
import { $, ls, readTokens, confirmTwice, fmtTime } from './util.js';

// 독립 사이트(index.html)에서 열렸는지 표시. Claude 안에서는 app.html이 그대로 쓰임
if (window.STANDALONE) document.documentElement.classList.add('site');

const TOK = ['bg', 'fg', 'muted', 'disc', 'disc-line', 'slot', 'hub', 'hub-fg', 'needle', 'accent', 'shelf', 'glow', 'note', 'chord'];
let tok = readTokens(TOK), tokSig = JSON.stringify(tok);

const LS_STATE = 'coin-disc-v4', LS_MODE = 'coin-disc-mode';

// ---------- 상태 ----------
const S = {
  song: null,
  sel: { sid: 'A', t: 0, d: 0 },   // 편집 중인 구간·악기·원판
  orderSel: 0,                     // 연주 순서에서 고른 칸
  currentId: null, songName: '새 곡', dirty: false, isDemo: false, follow: false
};
let mode = ls.get(LS_MODE);
if (mode !== 'beginner' && mode !== 'expert') mode = null;
const isExpert = () => mode === 'expert';

(function load(){
  try {
    const raw = JSON.parse(ls.get(LS_STATE) || 'null');
    if (raw && raw.song){
      S.song = M.decodeSong(raw.song);
      Object.assign(S, { sel: raw.sel || S.sel, currentId: raw.currentId || null, songName: raw.name || '새 곡', dirty: !!raw.dirty, follow: !!raw.follow });
      return;
    }
  } catch (e){}
  try {
    const old = JSON.parse(ls.get('coin-disc-v2') || 'null');
    if (old && Array.isArray(old.tracks) && old.tracks.length){
      S.song = M.fromLegacyTracks(old.tracks, old.mood, old.bpm);
      Object.assign(S, { currentId: old.currentId || null, songName: old.name || '새 곡', dirty: !!old.dirty });
      S.sel = { sid: 'A', t: Math.min(old.sel?.t ?? 0, S.song.tracks.length - 1), d: 0 };
      return;
    }
  } catch (e){}
  S.song = M.demoSong(isExpert());
  S.isDemo = true;
  S.sel = { sid: 'A', t: S.song.tracks.length - 1, d: 0 };
})();

let persistTimer = null;
function persist(){
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => ls.set(LS_STATE, JSON.stringify({
    song: M.encodeSong(S.song), sel: S.sel, currentId: S.currentId, name: S.songName, dirty: S.dirty, follow: S.follow
  })), 300);
}

const secById = id => S.song.sections.find(s => s.id === id);
const curSec = () => secById(S.sel.sid) || S.song.sections[0];
const curTrack = () => S.song.tracks[S.sel.t];
const curPart = () => curSec().parts[S.sel.t];
const curDisc = () => curPart().discs[S.sel.d];
function fixSel(){
  if (!secById(S.sel.sid)) S.sel.sid = S.song.sections[0].id;
  S.sel.t = Math.max(0, Math.min(S.sel.t | 0, S.song.tracks.length - 1));
  S.sel.d = Math.max(0, Math.min(S.sel.d | 0, curPart().count - 1));
  S.orderSel = Math.max(0, Math.min(S.orderSel, S.song.order.length - 1));
}
fixSel();

// ---------- 재생 ----------
const lastHit = new Map();
const hitKey = (sid, t, d, r, s) => sid + '|' + t + '|' + d + '|' + r + '|' + s;
let perf = null;
const player = createPlayer(() => S.song, (e, time) => { lastHit.set(hitKey(e.sid, e.t, e.d, e.r, e.s), time); if (perf) perf.onHit(e, time); });
player.setBpm(S.song.bpm);

// ---------- 저장·내보내기 ----------
const app = { S, player, persist, applySong, touch };
const songs = initSongs(app);
app.songs = songs;
const exporter = initExport(app);
perf = initPerf({ S, player, lastHit, hitKey, secById, exporter, onPlayChange: () => renderPlay() });

function touch(){ S.dirty = true; S.isDemo = false; songs.renderSaveState(); persist(); }

// ---------- 3D ----------
function paintDisc(cv, t, d){
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  const sec = curSec(), tr = S.song.tracks[t], disc = sec.parts[t].discs[d];
  drawDisc(ctx, cv.width, { info: M.ringInfo(tr.inst, tr.scale, S.song.mood), grid: disc.g, spec: M.gridSpec(sec.meter, disc.div), tok });
}
const view = createView3D($('view3d'), {
  towers: () => S.song.tracks.map((tr, t) => ({ label: INST[tr.inst].name + (tr.mute ? ' (꺼짐)' : ''), count: curSec().parts[t].count, mute: tr.mute })),
  paint: paintDisc,
  onSelect: (t, d) => select({ t, d }),
  tok: () => tok
});
$('resetView').addEventListener('click', () => view.resetView());

// ---------- 바뀐 내용 반영 ----------
function coinsChanged(){ view.refresh(S.sel.t, S.sel.d); player.rebuild(); touch(); }
function structural(refit){ fixSel(); player.rebuild(); view.rebuild(refit); renderAll(); touch(); }
function select(p){
  const secChanged = p.sid !== undefined && p.sid !== S.sel.sid;
  Object.assign(S.sel, p);
  if (secChanged && p.d === undefined) S.sel.d = 0;
  fixSel();
  if (secChanged) view.rebuild(true);
  renderAll();
  persist();
}
function applySong(song, sel){
  player.stop();
  lastHit.clear();
  S.song = song;
  S.sel = { sid: song.order[0], t: 0, d: 0, ...(sel || {}) };
  S.orderSel = 0;
  fixSel();
  player.seek(0);
  player.rebuild();
  player.setBpm(song.bpm);
  $('tempo').value = song.bpm;
  view.rebuild(true);
  renderAll();
  persist();
}

// ---------- 모드 ----------
function setMode(m){
  mode = m;
  ls.set(LS_MODE, m);
  $('gate').hidden = true;
  renderAll();
}
const guide = initGuide();
$('helpBtn').addEventListener('click', () => guide.start(mode || 'beginner'));
document.querySelectorAll('#modeSwitch button').forEach(b => b.addEventListener('click', () => {
  const m = b.dataset.mode;
  setMode(m);
  // 숙련자 모드를 처음 켜면 숙련자 안내를 보여줌
  if (m === 'expert' && !guide.done('expert')) setTimeout(() => guide.start('expert'), 250);
}));
document.querySelectorAll('#gate [data-mode]').forEach(b => b.addEventListener('click', () => {
  const m = b.dataset.mode;
  if (S.isDemo && !S.dirty){
    applySong(M.demoSong(m === 'expert'));
    S.isDemo = true;
    S.sel.t = S.song.tracks.length - 1;
    fixSel();
  }
  setMode(m);
  setTimeout(() => guide.start(m), 300);
}));

// ---------- 재생 조작 ----------
const playBtn = $('play');
playBtn.addEventListener('click', () => { player.toggle(); renderPlay(); });
$('rewind').addEventListener('click', () => { player.seek(0); S.orderSel = 0; renderArrange(); });
function renderPlay(){
  const t = player.playing ? '■ 정지' : '▶ 재생';
  playBtn.textContent = t; $('mPlay').textContent = t;
  if (perf) perf.renderPlay();
}
$('mPlay').addEventListener('click', () => { player.toggle(); renderPlay(); });
// 재생 버튼이 화면 밖으로 나가면 아래 고정 막대를 보여줌 (휴대폰 화면에서만 CSS로 보임)
new IntersectionObserver(es => { $('mbar').hidden = es[0].isIntersecting; }).observe($('pTransport'));
$('tempo').addEventListener('input', e => {
  const v = +e.target.value;
  S.song.bpm = v; player.setBpm(v);
  $('bpm').textContent = v + ' BPM';
  renderArrangeTotal();
  touch();
});
function setMood(m){
  S.song.mood = m;
  player.rebuild(); view.rebuild(false); renderAll(); touch();
}
$('moodBright').addEventListener('click', () => setMood('bright'));
$('moodDark').addEventListener('click', () => setMood('dark'));
document.addEventListener('keydown', e => {
  if (e.code === 'Space' && (e.target === document.body || e.target.closest('#perf canvas'))){ e.preventDefault(); player.toggle(); renderPlay(); }
});

// ---------- 곡 구성 ----------
const secTabs = $('secTabs'), orderStrip = $('orderStrip'), segMeter = $('segMeter'), arrMsg = $('arrMsg');

function blockStartQ(i){
  const b = player.tl.bars.find(x => x.oi === i);
  return b ? b.startQ : 0;
}
function renderArrangeTotal(){
  const tl = player.tl;
  $('arrTotal').textContent = '총 ' + tl.bars.length + '마디 · ' + fmtTime(player.secondsOf(tl.totalQ));
}
function renderArrange(){
  const song = S.song, sec = curSec();
  const show = isExpert() || song.sections.length > 1 || song.order.length > 1;
  $('arrangePanel').hidden = !show;
  if (!show) return;
  secTabs.innerHTML = '';
  song.sections.forEach(s => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tab'; b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', s.id === sec.id);
    b.innerHTML = '<b></b><span class="tab-sub"></span>';
    b.querySelector('b').textContent = M.sectionName(s);
    b.querySelector('.tab-sub').textContent = s.meter + ' · ' + M.sectionBars(s) + '마디';
    b.onclick = () => select({ sid: s.id });
    secTabs.appendChild(b);
  });
  $('secAdd').disabled = song.sections.length >= MAX_SECTIONS;
  $('secDup').disabled = song.sections.length >= MAX_SECTIONS;
  $('secDel').disabled = song.sections.length <= 1;
  const lbl = $('secLabel');
  if (document.activeElement !== lbl) lbl.value = sec.label || '';
  segMeter.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === sec.meter));

  orderStrip.innerHTML = '';
  song.order.forEach((sid, i) => {
    const s = secById(sid);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'blk'; b.dataset.i = i;
    b.setAttribute('aria-current', i === S.orderSel);
    b.setAttribute('aria-label', (i + 1) + '번째: 구간 ' + M.sectionName(s));
    b.innerHTML = '<span class="blk-id"></span><span class="blk-n"></span>';
    b.querySelector('.blk-id').textContent = sid;
    b.querySelector('.blk-n').textContent = M.sectionBars(s) + '마디';
    b.onclick = () => {
      S.orderSel = i;
      if (!player.playing) player.seek(blockStartQ(i));
      if (sid !== S.sel.sid) select({ sid }); else renderArrange();
    };
    orderStrip.appendChild(b);
  });
  $('ordAdd').disabled = song.order.length >= MAX_ORDER;
  $('ordAdd').textContent = '+ 구간 ' + sec.id + ' 넣기';
  $('ordLeft').disabled = S.orderSel <= 0;
  $('ordRight').disabled = S.orderSel >= song.order.length - 1;
  $('ordDel').disabled = song.order.length <= 1;
  $('follow').checked = S.follow;
  renderArrangeTotal();
  lastBarKey = '';
}

$('secAdd').addEventListener('click', () => {
  const id = M.nextSectionId(S.song);
  S.song.sections.push(M.newSection(S.song, id, curSec().meter));
  S.song.order.splice(S.orderSel + 1, 0, id);
  S.orderSel++;
  S.sel = { sid: id, t: S.sel.t, d: 0 };
  structural(true);
});
$('secDup').addEventListener('click', () => {
  const id = M.nextSectionId(S.song);
  S.song.sections.push(M.cloneSection(curSec(), id));
  S.song.order.splice(S.orderSel + 1, 0, id);
  S.orderSel++;
  S.sel = { sid: id, t: S.sel.t, d: S.sel.d };
  structural(true);
});
$('secDel').addEventListener('click', e => {
  const sec = curSec();
  if (S.song.sections.length <= 1) return;
  if (!confirmTwice('secdel-' + sec.id, e.currentTarget, '구간 ' + sec.id + ' 삭제')) return;
  S.song.sections = S.song.sections.filter(s => s !== sec);
  S.song.order = S.song.order.filter(id => id !== sec.id);
  if (!S.song.order.length) S.song.order = [S.song.sections[0].id];
  S.sel.sid = S.song.order[Math.min(S.orderSel, S.song.order.length - 1)];
  S.sel.d = 0;
  lastHit.clear();
  structural(true);
});
$('secLabel').addEventListener('input', e => {
  curSec().label = e.target.value.slice(0, 12);
  renderArrange();
  touch();
});
segMeter.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const sec = curSec(), to = b.dataset.v;
  if (sec.meter === to) return;
  const res = M.convertMeter(sec, to);
  if (res.dropped || res.moved){
    const parts = [];
    if (res.moved) parts.push('셋잇단 코인 ' + res.moved + '개가 가장 가까운 칸으로 옮겨지고');
    if (res.dropped) parts.push('마디 뒤쪽 코인 ' + res.dropped + '개가 빠져요');
    if (!confirmTwice('meter-' + sec.id + to, b, '한 번 더')){
      arrMsg.textContent = to + '박자로 바꾸면 ' + parts.join(', ') + '. 계속하려면 한 번 더 누르세요.';
      return;
    }
  }
  arrMsg.textContent = '';
  res.apply();
  structural(false);
});
$('ordAdd').addEventListener('click', () => {
  if (S.song.order.length >= MAX_ORDER) return;
  S.song.order.splice(S.orderSel + 1, 0, S.sel.sid);
  S.orderSel++;
  structural(false);
});
function moveOrder(dir){
  const o = S.song.order, i = S.orderSel, j = i + dir;
  if (j < 0 || j >= o.length) return;
  [o[i], o[j]] = [o[j], o[i]];
  S.orderSel = j;
  structural(false);
}
$('ordLeft').addEventListener('click', () => moveOrder(-1));
$('ordRight').addEventListener('click', () => moveOrder(1));
$('ordDel').addEventListener('click', () => {
  if (S.song.order.length <= 1) return;
  S.song.order.splice(S.orderSel, 1);
  S.orderSel = Math.min(S.orderSel, S.song.order.length - 1);
  structural(false);
});
$('follow').addEventListener('change', e => { S.follow = e.target.checked; persist(); });

// ---------- 악기 ----------
const trackTabs = $('trackTabs'), instSel = $('inst'), countSel = $('count'), segScale = $('segScale');
const muteBtn = $('mute'), delBtn = $('delTrack'), discMsg = $('discMsg');

function renderTracks(){
  trackTabs.innerHTML = '';
  S.song.tracks.forEach((tr, t) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tab'; b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', t === S.sel.t);
    b.textContent = INST[tr.inst].name + (tr.mute ? ' · 꺼짐' : '');
    b.onclick = () => select({ t });
    trackTabs.appendChild(b);
  });
  const tr = curTrack();
  instSel.value = tr.inst;
  countSel.value = String(curPart().count);
  muteBtn.setAttribute('aria-pressed', tr.mute);
  muteBtn.textContent = tr.mute ? '소리 켜기' : '음소거';
  delBtn.disabled = S.song.tracks.length <= 1;
  $('addTrack').disabled = S.song.tracks.length >= MAX_TRACKS;
  segScale.classList.toggle('dis', tr.inst === 'drum');
  segScale.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.v === (tr.scale === 7 ? 7 : 5)));
}

instSel.addEventListener('change', () => { M.setInstrument(S.song, S.sel.t, instSel.value); structural(false); });
countSel.addEventListener('change', () => {
  const part = curPart(), n = +countSel.value;
  const before = M.sectionBars(curSec());
  while (part.discs.length < n) part.discs.push(M.cloneDisc(part.discs[part.discs.length % part.count]));
  part.count = n;
  structural(M.sectionBars(curSec()) !== before);
});
muteBtn.addEventListener('click', () => { curTrack().mute = !curTrack().mute; structural(false); });
delBtn.addEventListener('click', e => {
  if (S.song.tracks.length <= 1) return;
  if (!confirmTwice('trdel-' + S.sel.t, e.currentTarget, '모든 구간에서 삭제')) return;
  M.removeTrack(S.song, S.sel.t);
  S.sel.t = Math.max(0, S.sel.t - 1); S.sel.d = 0;
  lastHit.clear();
  structural(true);
});
$('addTrack').addEventListener('click', () => {
  if (S.song.tracks.length >= MAX_TRACKS) return;
  const used = S.song.tracks.map(t => t.inst);
  M.addTrack(S.song, INST_ORDER.find(i => !used.includes(i)) || 'musicbox');
  S.sel.t = S.song.tracks.length - 1; S.sel.d = 0;
  structural(true);
});
segScale.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const tr = curTrack(), to = +b.dataset.v;
  if (tr.inst === 'drum' || (tr.scale === 7 ? 7 : 5) === to) return;
  const res = M.convertScale(S.song, S.sel.t, to);
  if (res.dropped || res.cleared){
    const parts = [];
    if (res.dropped) parts.push('파·시 코인 ' + res.dropped + '개가 빠지고');
    if (res.cleared) parts.push('♯/♭ ' + res.cleared + '개가 풀려요');
    if (!confirmTwice('scale-' + S.sel.t, b, '한 번 더')){
      discMsg.textContent = '5음으로 바꾸면 모든 구간에서 ' + parts.join(', ') + '. 계속하려면 한 번 더 누르세요.';
      return;
    }
  }
  discMsg.textContent = '';
  res.apply();
  structural(false);
});

// ---------- 원판과 코인 상자 ----------
const discTabs = $('discTabs'), segDiv = $('segDiv');
const segType = $('segType'), segVel = $('segVel'), segLen = $('segLen'), segAcc = $('segAcc');
const tool = { t: 'n', v: 1, l: 1, a: 0 };

function bindSeg(seg, key, parse){
  seg.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    tool[key] = parse(b.dataset.v);
    seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
  });
}
bindSeg(segType, 't', v => v);
bindSeg(segVel, 'v', v => +v);
bindSeg(segLen, 'l', v => +v);
bindSeg(segAcc, 'a', v => +v);

function renderDiscPanel(){
  const tr = curTrack(), part = curPart(), sec = curSec(), disc = curDisc();
  discTabs.innerHTML = '';
  for (let d = 0; d < part.count; d++){
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tab'; b.dataset.d = d; b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', d === S.sel.d);
    b.innerHTML = (d + 1) + '번<span class="live" aria-hidden="true"></span>';
    b.onclick = () => select({ d });
    discTabs.appendChild(b);
  }
  $('copyPrev').disabled = S.sel.d === 0;
  $('discSection').textContent = (S.song.sections.length > 1 || isExpert()) ? '구간 ' + M.sectionName(sec) : '';

  const isDrum = tr.inst === 'drum', sc = tr.scale === 7 ? 7 : 5;
  segType.classList.toggle('dis', isDrum);
  segLen.classList.toggle('dis', isDrum);
  document.querySelectorAll('[data-acc]').forEach(el => el.hidden = isDrum || sc !== 7 || !isExpert());

  const tripletOk = M.canTriplet(sec.meter);
  $('divRow').hidden = !tripletOk && disc.div !== 't';
  segDiv.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === disc.div));
  const slots = disc.g[0].length, spec = M.gridSpec(sec.meter, disc.div);
  $('divInfo').textContent = '한 바퀴 ' + slots + '칸 · ' + (sec.meter === '6/8' ? '8분음표 하나에 ' + spec.mid + '칸' : '한 박에 ' + spec.strong + '칸');

  let hint;
  if (isDrum) hint = '드럼은 고리마다 다른 소리가 나요. 안쪽부터 킥, 스네어, 박수, 닫힌 하이햇, 열린 하이햇이에요. 세기만 고를 수 있어요.';
  else {
    hint = '안쪽 고리일수록 낮은 음이고, 바늘 옆 이름표가 고리의 음이에요. 같은 바퀴살에 여러 코인을 놓으면 함께 울려요. 화음 코인은 하나만 놓아도 어울리는 음 3개가 같이 나요. 놓인 코인을 누르면 빠집니다.';
    if (sc === 7) hint += ' 빗금 고리(파·시)와 ♯/♭ 코인은 긴장감을 주는 음이라, 어색하게 들리면 옆 음으로 옮겨 보세요.';
  }
  if (disc.div === 't') hint += ' 이 원판은 셋잇단이라 한 박이 3칸으로 나뉘어 있어요.';
  $('discHint').textContent = hint;
}

segDiv.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const sec = curSec(), disc = curDisc(), to = b.dataset.v;
  if (disc.div === to || (to === 't' && !M.canTriplet(sec.meter))) return;
  const res = M.regrid(disc, M.slotsOf(sec.meter, to), to);
  if (res.dropped || res.moved){
    if (!confirmTwice('div-' + S.sel.sid + S.sel.t + S.sel.d, b, '한 번 더')){
      const parts = [];
      if (res.moved) parts.push('코인 ' + res.moved + '개는 가장 가까운 칸으로 옮겨지고');
      if (res.dropped) parts.push(res.dropped + '개는 자리가 겹쳐 빠져요');
      discMsg.textContent = '칸 수가 바뀌어서 ' + parts.join(', ') + '. 계속하려면 한 번 더 누르세요.';
      return;
    }
  }
  discMsg.textContent = '';
  curPart().discs[S.sel.d] = res.disc;
  coinsChanged();
  renderDiscPanel();
});

$('dice').addEventListener('click', () => {
  const tr = curTrack(), sec = curSec(), disc = curDisc();
  const info = M.ringInfo(tr.inst, tr.scale, S.song.mood);
  curPart().discs[S.sel.d] = { div: disc.div, g: randomGrid(tr.inst, info, M.gridSpec(sec.meter, disc.div)) };
  coinsChanged();
  if (!player.playing){ player.toggle(); renderPlay(); }
});
$('clear').addEventListener('click', () => {
  const disc = curDisc();
  curPart().discs[S.sel.d] = M.emptyDisc(disc.g.length, disc.g[0].length, disc.div);
  coinsChanged();
});
$('copyPrev').addEventListener('click', () => {
  if (S.sel.d === 0) return;
  curPart().discs[S.sel.d] = M.cloneDisc(curPart().discs[S.sel.d - 1]);
  coinsChanged();
  renderDiscPanel();
});

// ---------- 2D 편집 화면 ----------
const canvas = $('disc'), stage = $('stage'), cx2d = canvas.getContext('2d');
let CW = 400, dpr = 1, edPos = 0;
function resize2d(){
  CW = stage.clientWidth || 400; dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(CW * dpr); canvas.height = Math.round(CW * dpr);
}
new ResizeObserver(resize2d).observe(stage);

// 원판 확대 (휴대폰에서 칸이 작을 때)
const stageScroll = $('stageScroll');
function setZoom(z, save = true){
  stage.style.setProperty('--zoom', z);
  stageScroll.classList.toggle('zoomed', z > 1);
  $('pDisc').classList.toggle('zoomed', z > 1);
  $('segZoom').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.z === z));
  requestAnimationFrame(() => {
    // 바늘이 있는 맨 위 가운데가 보이게
    stageScroll.scrollLeft = (stageScroll.scrollWidth - stageScroll.clientWidth) / 2;
    stageScroll.scrollTop = 0;
  });
  if (save) ls.set('coin-disc-zoom', String(z));
}
$('segZoom').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setZoom(+b.dataset.z); });
setZoom([1, 1.5, 2].includes(+ls.get('coin-disc-zoom')) ? +ls.get('coin-disc-zoom') : 1, false);
resize2d();

canvas.addEventListener('pointerdown', e => {
  const tr = curTrack(), sec = curSec(), disc = curDisc();
  const info = M.ringInfo(tr.inst, tr.scale, S.song.mood), slots = disc.g[0].length;
  const g = geom(CW, info.length, slots);
  const rect = canvas.getBoundingClientRect();
  const dx = e.clientX - rect.left - g.c, dy = e.clientY - rect.top - g.c, dist = Math.hypot(dx, dy);
  if (dist < g.hub || dist > g.outer) return;
  const r = Math.min(info.length - 1, Math.floor((dist - g.hub) / g.ringW));
  let k = Math.round(edPos - (Math.atan2(dy, dx) + Math.PI / 2) / g.dA);
  k = ((k % slots) + slots) % slots;
  const hit = M.findCoin(disc.g, r, k);
  if (hit >= 0) disc.g[r][hit] = null;
  else {
    const isDrum = tr.inst === 'drum';
    const l = isDrum ? 1 : Math.min(tool.l, slots);
    const c = M.coin(isDrum ? 'n' : tool.t, l, tool.v, (!isDrum && tr.scale === 7 && isExpert()) ? tool.a : 0);
    for (let i = 1; i < l; i++) disc.g[r][(k + i) % slots] = null;
    disc.g[r][k] = c;
    const t0 = player.preview(tr.inst, tr.scale, r, c, l * M.meterOf(sec.meter).q / slots);
    lastHit.set(hitKey(S.sel.sid, S.sel.t, S.sel.d, r, k), t0);
  }
  coinsChanged();
});

function draw2d(loc){
  const tr = curTrack(), part = curPart(), disc = curDisc(), sec = curSec();
  const slots = disc.g[0].length, bar = loc.bar;
  const active = bar.sid === S.sel.sid && (bar.b % part.count) === S.sel.d;
  edPos = active ? loc.frac * slots : 0;
  const now = player.now();
  cx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  cx2d.clearRect(0, 0, CW, CW);
  drawDisc(cx2d, CW, {
    info: M.ringInfo(tr.inst, tr.scale, S.song.mood), grid: disc.g, spec: M.gridSpec(sec.meter, disc.div),
    pos: edPos, needle: true, labels: true, tok,
    hubText: [INST[tr.inst].name, (S.song.sections.length > 1 ? sec.id + ' · ' : '') + (S.sel.d + 1) + '번 원판'],
    flash: (r, k) => {
      const h = lastHit.get(hitKey(S.sel.sid, S.sel.t, S.sel.d, r, k));
      if (h == null) return 0;
      const a = now - h;
      return (a >= 0 && a < 0.35) ? 1 - a / 0.35 : 0;
    }
  });
  const st = active && player.playing ? '지금 연주 중' : active ? '다음에 연주됨' : '대기 중';
  if ($('discStatus').textContent !== st) $('discStatus').textContent = st;
}

// ---------- 전체 화면 그리기 ----------
function renderModeUI(){
  const m = mode || 'beginner';
  $('app').dataset.mode = m;
  document.querySelectorAll('#modeSwitch button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === m));
  $('lead').textContent = m === 'expert'
    ? '구간을 만들고 순서를 짜서 한 곡을 완성해 보세요. 박자표와 셋잇단음표, 7음과 ♯·♭도 쓸 수 있어요.'
    : '원판의 칸을 눌러 코인을 올리고, 악기마다 원판을 쌓아 곡을 만들어 보세요.';
}
function renderAll(){
  renderModeUI();
  renderArrange();
  renderTracks();
  renderDiscPanel();
  renderPlay();
  $('moodBright').setAttribute('aria-pressed', S.song.mood === 'bright');
  $('moodDark').setAttribute('aria-pressed', S.song.mood === 'dark');
  $('bpm').textContent = S.song.bpm + ' BPM';
  lastBarKey = '';
}

// ---------- 메인 루프 ----------
let lastBarKey = '', tokCheck = 0;
function frame(ts){
  if (ts - tokCheck > 800){
    tokCheck = ts;
    const nt = readTokens(TOK), sig = JSON.stringify(nt);
    if (sig !== tokSig){ tok = nt; tokSig = sig; view.rebuild(false); }
  }
  // 공연 모드가 열려 있으면 그 화면만 그림
  if (perf.isOpen){ perf.frame(); requestAnimationFrame(frame); return; }
  const tl = player.tl, loc = M.locate(tl, player.pos()), bar = loc.bar;

  if (S.follow && player.playing){
    const part = secById(bar.sid).parts[S.sel.t];
    const d = part ? bar.b % part.count : 0;
    if (bar.sid !== S.sel.sid || d !== S.sel.d){ S.orderSel = bar.oi; select({ sid: bar.sid, d }); }
  }

  const key = loc.i + '|' + player.playing;
  if (key !== lastBarKey){
    lastBarKey = key;
    const sec = secById(bar.sid), single = S.song.sections.length === 1 && S.song.order.length === 1;
    $('posText').textContent = $('mPos').textContent = single
      ? '마디 ' + (loc.i + 1) + ' / ' + tl.bars.length
      : '구간 ' + bar.sid + ' · ' + (bar.b + 1) + '/' + M.sectionBars(sec) + '마디 · 전체 ' + (loc.i + 1) + '/' + tl.bars.length;
    orderStrip.querySelectorAll('.blk').forEach(b => b.classList.toggle('playing', player.playing && +b.dataset.i === bar.oi));
    const part = curPart();
    discTabs.querySelectorAll('.tab').forEach(b => b.classList.toggle('playing', bar.sid === S.sel.sid && +b.dataset.d === bar.b % part.count));
  }

  draw2d(loc);
  view.update({
    playing: player.playing,
    sel: S.sel,
    rot: (t, d) => {
      if (bar.sid !== S.sel.sid) return null;
      const p = curSec().parts[t];
      return (bar.b % p.count) === d ? loc.frac * Math.PI * 2 : null;
    }
  });
  requestAnimationFrame(frame);
}

// ---------- 시작 ----------
$('tempo').value = S.song.bpm;
view.rebuild(true);
renderAll();
if (!mode) $('gate').hidden = false;
else if (!guide.done(mode)) setTimeout(() => guide.start(mode), 700);
if (document.fonts) document.fonts.ready.then(() => { view.rebuild(false); });
requestAnimationFrame(frame);

// 공유 링크로 열었으면 그 곡을 불러옴
exporter.openFromLink();

// 계정 저장소와 파일 저장 연결 (Claude 화면에서 열었을 때만)
(async () => {
  if (!window.claude || !window.claude.use) return;
  try {
    const [db, user, dl] = await Promise.all([window.claude.use('db'), window.claude.use('user'), window.claude.use('downloads')]);
    exporter.setDownloads(dl);
    const uid = user ? await user.id() : null;
    if (db && uid) songs.setRemote(db.collection('data/users/' + uid));
  } catch (e){ /* 계정 기능을 못 쓰면 브라우저 저장을 계속 사용 */ }
})();
