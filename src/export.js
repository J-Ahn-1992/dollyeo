// 내보내기와 공유: 오디오 파일, 곡 코드, 공유 링크
//
// Claude 안(아티팩트)에서는 파일 저장 형식이 정해져 있어서 실시간 녹음으로 MP4를 만들고,
// 독립 사이트에서는 계산된 소리를 바로 MP3·WAV로 바꿔서 기다림 없이 받음
import { $, confirmTwice } from './util.js';
import { encodeSong, decodeSong } from './model.js';

const CODE_PREFIX = 'CDISC2:';
const SITE = !!window.STANDALONE;
const LAME_URL = 'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js';

// ---------- 글자 코드 변환 ----------
const toB64 = bytes => { let bin = ''; bytes.forEach(b => bin += String.fromCharCode(b)); return btoa(bin); };
const fromB64 = s => Uint8Array.from(atob(s), ch => ch.charCodeAt(0));
const b64url = s => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unurl = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return s; };

async function pipeBytes(bytes, stream){
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

// app: { S, player, applySong(song), persist(), touch(), songs }
export function initExport(app){
  const { S, player } = app;
  const codeStatus = $('codeStatus'), codeIn = $('codeIn');
  const payload = () => JSON.stringify({ n: S.songName.trim() || '이름 없는 곡', s: encodeSong(S.song) });

  function openShared(got, msg){
    app.applySong(got.song);
    S.currentId = null; S.songName = got.name; app.songs.setName(got.name); S.isDemo = false;
    app.touch(); app.songs.renderList();
    codeStatus.textContent = msg;
  }

  // ---------- 곡 코드 ----------
  function makeCode(){ return CODE_PREFIX + toB64(new TextEncoder().encode(payload())); }
  function readCode(code){
    const raw = code.trim().replace(/\s+/g, '');
    if (!raw.startsWith(CODE_PREFIX)) throw new Error('prefix');
    const o = JSON.parse(new TextDecoder().decode(fromB64(raw.slice(CODE_PREFIX.length))));
    return { name: String(o.n || '받은 곡').slice(0, 40), song: decodeSong(o.s) };
  }

  function copyText(text, okMsg){
    const fallback = () => { codeIn.value = text; codeIn.focus(); codeIn.select(); codeStatus.textContent = '아래 칸의 내용을 직접 복사해 주세요.'; };
    try { navigator.clipboard.writeText(text).then(() => { codeStatus.textContent = okMsg; }, fallback); }
    catch (e){ fallback(); }
  }

  $('copyCode').addEventListener('click', () => copyText(makeCode(), '복사했어요. 메신저에 붙여넣어 보내세요.'));
  $('loadCode').addEventListener('click', e => {
    let got;
    try { got = readCode(codeIn.value); }
    catch (err){ codeStatus.textContent = '코드를 읽지 못했어요. "CDISC2:"로 시작하는 코드 전체를 붙여넣었는지 확인해 주세요.'; return; }
    if (S.dirty && !confirmTwice('code', e.currentTarget, '변경 버리고 불러오기')) return;
    openShared(got, '불러왔어요. 마음에 들면 저장을 눌러 내 곡에 넣으세요.');
    codeIn.value = '';
  });

  // ---------- 공유 링크 (독립 사이트) ----------
  // 곡을 압축해서 주소 뒤 #song= 에 담음. 받는 사람은 링크만 누르면 같은 곡이 열림
  async function makeLink(){
    const bytes = new TextEncoder().encode(payload());
    let tag = 'j', data = bytes;
    if (window.CompressionStream){
      try { data = await pipeBytes(bytes, new CompressionStream('deflate-raw')); tag = 'z'; } catch (e){ data = bytes; tag = 'j'; }
    }
    return location.origin + location.pathname + '#song=' + tag + b64url(toB64(data));
  }
  async function readLink(hash){
    const v = hash.slice('#song='.length), tag = v[0];
    let bytes = fromB64(unurl(v.slice(1)));
    if (tag === 'z') bytes = await pipeBytes(bytes, new DecompressionStream('deflate-raw'));
    const o = JSON.parse(new TextDecoder().decode(bytes));
    return { name: String(o.n || '받은 곡').slice(0, 40), song: decodeSong(o.s) };
  }
  if (SITE){
    $('copyLink').addEventListener('click', async () => {
      try { copyText(await makeLink(), '링크를 복사했어요. 받은 사람은 링크만 누르면 이 곡이 열려요.'); }
      catch (e){ codeStatus.textContent = '링크를 만들지 못했어요. 곡 코드 복사를 대신 써 주세요.'; }
    });
  }
  async function openFromLink(){
    if (!location.hash.startsWith('#song=')) return false;
    try {
      const got = await readLink(location.hash);
      openShared(got, '공유받은 곡을 열었어요: ' + got.name + '. 마음에 들면 저장을 눌러 내 곡에 넣으세요.');
      history.replaceState(null, '', location.pathname + location.search);
      return true;
    } catch (e){
      codeStatus.textContent = '공유 링크를 읽지 못했어요. 링크가 끝까지 복사됐는지 확인해 주세요.';
      return false;
    }
  }

  // ---------- 오디오 파일 ----------
  const makeBtn = $('makeAudio'), saveBtn = $('saveAudio'), row = $('audioProgressRow');
  const prog = $('audioProgress'), status = $('audioStatus'), note = $('audioNote');
  let downloads = null, blob = null, ext = 'mp4', busy = false, fmt = 'mp3';
  const fileBase = () => (S.songName.trim() || '내 곡').replace(/[\\/:*?"<>|]/g, '');

  if (SITE){
    makeBtn.textContent = '🎧 음악 파일 받기';
    note.textContent = 'MP3는 어디서나 재생되는 작은 파일이고, WAV는 음질 손실이 없는 큰 파일이에요. 누르면 바로 만들어져요.';
    $('segFmt').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      fmt = b.dataset.v;
      $('segFmt').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
    });
  }

  const recMime = (() => {
    if (!window.MediaRecorder) return null;
    // MP4(AAC)가 가장 많은 기기에서 재생됨. 녹음을 못 하는 브라우저에서만 WebM으로 대신 저장
    for (const [m, e] of [['audio/mp4;codecs=mp4a.40.2', 'mp4'], ['audio/mp4', 'mp4'], ['audio/webm;codecs=opus', 'webm'], ['audio/webm', 'webm']]){
      try { if (MediaRecorder.isTypeSupported(m)) return { m, ext: e }; } catch (err){}
    }
    return null;
  })();
  if (!SITE && recMime && recMime.ext === 'webm'){
    note.textContent = '이 브라우저는 MP4로 녹음할 수 없어서 WebM 파일로 만들어져요. 아이폰 등에서 안 열리면 최신 Chrome이나 Safari에서 다시 만들어 주세요.';
  }
  if (!SITE && !recMime){
    makeBtn.disabled = true;
    note.textContent = '이 브라우저는 오디오 파일 만들기를 지원하지 않아요. 최신 Chrome이나 Safari에서 열어 주세요.';
  }

  function wavBlob(buf){
    const d = buf.getChannelData(0), sr = buf.sampleRate, n = d.length;
    const ab = new ArrayBuffer(44 + n * 2), v = new DataView(ab);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++){ const x = Math.max(-1, Math.min(1, d[i])); v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
    return new Blob([ab], { type: 'audio/wav' });
  }
  let lameReady = null;
  function loadLame(){
    if (window.lamejs) return Promise.resolve();
    if (!lameReady) lameReady = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = LAME_URL; s.onload = res; s.onerror = () => { lameReady = null; rej(new Error('lame')); };
      document.head.appendChild(s);
    });
    return lameReady;
  }
  async function mp3Blob(buf){
    await loadLame();
    const d = buf.getChannelData(0), sr = buf.sampleRate;
    const enc = new window.lamejs.Mp3Encoder(1, sr, 160);
    const pcm = new Int16Array(d.length);
    for (let i = 0; i < d.length; i++){ const x = Math.max(-1, Math.min(1, d[i])); pcm[i] = x < 0 ? x * 0x8000 : x * 0x7fff; }
    const out = [];
    for (let i = 0; i < pcm.length; i += 1152){
      const m = enc.encodeBuffer(pcm.subarray(i, i + 1152));
      if (m.length) out.push(new Uint8Array(m));
      if (i % (1152 * 200) === 0){ prog.value = i / pcm.length; await new Promise(r => setTimeout(r, 0)); }
    }
    const end = enc.flush(); if (end.length) out.push(new Uint8Array(end));
    return new Blob(out, { type: 'audio/mpeg' });
  }
  function download(b, name){
    const url = URL.createObjectURL(b);
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  async function makeSiteFile(){
    row.hidden = false; prog.value = 0; status.textContent = '만드는 중…';
    if (player.playing) player.stop();
    player.ensure();
    const buf = await player.renderOffline(+$('loops').value);
    const b = fmt === 'wav' ? wavBlob(buf) : await mp3Blob(buf);
    prog.value = 1;
    download(b, fileBase() + '.' + fmt);
    status.textContent = '파일을 받았어요. 다운로드 폴더를 확인해 주세요.';
  }

  async function recordMp4(){
    const ac = player.ensure();
    if (player.playing) player.stop();
    saveBtn.hidden = true; blob = null;
    row.hidden = false; prog.value = 0; status.textContent = '준비 중…';
    const buf = await player.renderOffline(+$('loops').value);
    const dest = ac.createMediaStreamDestination();
    const src = ac.createBufferSource(); src.buffer = buf; src.connect(dest);
    const rec = new MediaRecorder(dest.stream, { mimeType: recMime.m });
    const chunks = [];
    rec.ondataavailable = ev => { if (ev.data && ev.data.size) chunks.push(ev.data); };
    const done = new Promise(res => rec.onstop = res);
    rec.start(250);
    const t0 = ac.currentTime + 0.05;
    src.start(t0);
    const tick = setInterval(() => {
      const el = Math.max(0, ac.currentTime - t0);
      prog.value = Math.min(1, el / buf.duration);
      status.textContent = Math.floor(el) + '초 / ' + Math.ceil(buf.duration) + '초 녹음 중';
    }, 200);
    await new Promise(res => src.onended = res);
    clearInterval(tick);
    rec.stop(); await done;
    blob = new Blob(chunks, { type: recMime.m }); ext = recMime.ext;
    prog.value = 1;
    if (downloads){ status.textContent = '완성! 파일 저장하기를 눌러 주세요.'; saveBtn.hidden = false; }
    else status.textContent = '완성했지만 이 화면에서는 파일 저장을 쓸 수 없어요.';
  }

  makeBtn.addEventListener('click', async () => {
    if (busy || (!SITE && !recMime)) return;
    busy = true; makeBtn.disabled = true;
    try { await (SITE ? makeSiteFile() : recordMp4()); }
    catch (e){
      status.textContent = SITE && fmt === 'mp3' && !window.lamejs
        ? 'MP3 변환 도구를 불러오지 못했어요. 인터넷 연결을 확인하거나 WAV로 받아 주세요.'
        : '오디오 파일을 만들지 못했어요. 다시 시도해 주세요.';
    } finally { busy = false; makeBtn.disabled = !SITE && !recMime; }
  });

  saveBtn.addEventListener('click', async () => {
    if (!blob || !downloads) return;
    try {
      await downloads.save({ filename: fileBase() + '.' + ext, data: blob });
      status.textContent = '저장했어요.';
    } catch (e){
      status.textContent = e && e.code === 'declined' ? '저장을 취소했어요. 다시 누르면 저장할 수 있어요.'
        : e && e.code === 'rate_limited' ? '잠시 후 다시 눌러 주세요.'
        : '이 화면에서는 파일을 저장할 수 없어요.';
    }
  });

  return { setDownloads(d){ downloads = d; }, openFromLink };
}
