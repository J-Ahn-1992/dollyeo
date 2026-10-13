// 내보내기와 공유: 오디오 파일 만들기, 곡 코드 복사/불러오기
import { $, confirmTwice } from './util.js';
import { encodeSong, decodeSong } from './model.js';

const CODE_PREFIX = 'CDISC2:';

// app: { S, player, applySong(song), persist(), touch(), songs }
export function initExport(app){
  const { S, player } = app;
  const codeStatus = $('codeStatus'), codeIn = $('codeIn');

  // ---------- 곡 코드 ----------
  function makeCode(){
    const json = JSON.stringify({ n: S.songName.trim() || '이름 없는 곡', s: encodeSong(S.song) });
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    bytes.forEach(b => bin += String.fromCharCode(b));
    return CODE_PREFIX + btoa(bin);
  }
  function readCode(code){
    const raw = code.trim().replace(/\s+/g, '');
    if (!raw.startsWith(CODE_PREFIX)) throw new Error('prefix');
    const bin = atob(raw.slice(CODE_PREFIX.length));
    const o = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, ch => ch.charCodeAt(0))));
    return { name: String(o.n || '받은 곡').slice(0, 40), song: decodeSong(o.s) };
  }

  $('copyCode').addEventListener('click', () => {
    const code = makeCode();
    const fallback = () => { codeIn.value = code; codeIn.focus(); codeIn.select(); codeStatus.textContent = '아래 칸의 코드를 직접 복사해 주세요.'; };
    try { navigator.clipboard.writeText(code).then(() => { codeStatus.textContent = '복사했어요. 메신저에 붙여넣어 보내세요.'; }, fallback); }
    catch (e){ fallback(); }
  });
  $('loadCode').addEventListener('click', e => {
    let got;
    try { got = readCode(codeIn.value); }
    catch (err){ codeStatus.textContent = '코드를 읽지 못했어요. "CDISC2:"로 시작하는 코드 전체를 붙여넣었는지 확인해 주세요.'; return; }
    if (S.dirty && !confirmTwice('code', e.currentTarget, '변경 버리고 불러오기')) return;
    app.applySong(got.song);
    S.currentId = null; S.songName = got.name; app.songs.setName(got.name); S.isDemo = false;
    app.touch(); app.songs.renderList();
    codeStatus.textContent = '불러왔어요. 마음에 들면 저장을 눌러 내 곡에 넣으세요.';
    codeIn.value = '';
  });

  // ---------- 오디오 파일 ----------
  const makeBtn = $('makeAudio'), saveBtn = $('saveAudio'), row = $('audioProgressRow');
  const prog = $('audioProgress'), status = $('audioStatus'), note = $('audioNote');
  let downloads = null, blob = null, ext = 'webm', busy = false;

  const recMime = (() => {
    if (!window.MediaRecorder) return null;
    // MP4(AAC)가 가장 많은 기기에서 재생됨. 녹음을 못 하는 브라우저에서만 WebM으로 대신 저장
    for (const [m, e] of [['audio/mp4;codecs=mp4a.40.2', 'mp4'], ['audio/mp4', 'mp4'], ['audio/webm;codecs=opus', 'webm'], ['audio/webm', 'webm']]){
      try { if (MediaRecorder.isTypeSupported(m)) return { m, ext: e }; } catch (err){}
    }
    return null;
  })();
  if (recMime && recMime.ext === 'webm'){
    note.textContent = '이 브라우저는 MP4로 녹음할 수 없어서 WebM 파일로 만들어져요. 아이폰 등에서 안 열리면 최신 Chrome이나 Safari에서 다시 만들어 주세요.';
  }
  if (!recMime){
    makeBtn.disabled = true;
    note.textContent = '이 브라우저는 오디오 파일 만들기를 지원하지 않아요. 최신 Chrome이나 Safari에서 열어 주세요.';
  }

  makeBtn.addEventListener('click', async () => {
    if (busy || !recMime) return;
    const ac = player.ensure();
    if (player.playing) player.stop();
    busy = true; makeBtn.disabled = true; saveBtn.hidden = true; blob = null;
    row.hidden = false; prog.value = 0; status.textContent = '준비 중…';
    try {
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
    } catch (e){
      status.textContent = '오디오 파일을 만들지 못했어요. 다시 시도해 주세요.';
    } finally { busy = false; makeBtn.disabled = !recMime; }
  });

  saveBtn.addEventListener('click', async () => {
    if (!blob || !downloads) return;
    const base = (S.songName.trim() || '내 곡').replace(/[\\/:*?"<>|]/g, '');
    try {
      await downloads.save({ filename: base + '.' + ext, data: blob });
      status.textContent = '저장했어요.';
    } catch (e){
      status.textContent = e && e.code === 'declined' ? '저장을 취소했어요. 다시 누르면 저장할 수 있어요.'
        : e && e.code === 'rate_limited' ? '잠시 후 다시 눌러 주세요.'
        : '이 화면에서는 파일을 저장할 수 없어요.';
    }
  });

  return { setDownloads(d){ downloads = d; } };
}
