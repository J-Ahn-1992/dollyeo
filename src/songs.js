// 내 곡: 저장, 불러오기, 삭제. 계정 저장소가 있으면 그쪽에, 없으면 이 브라우저에
import { $, ls, confirmTwice } from './util.js';
import { INST } from './constants.js';
import { encodeSong, decodeSong, blankSong } from './model.js';

const LOCAL_KEY = 'coin-disc-songs';

// app: { S, player, applySong(song), persist(), afterSave() }
export function initSongs(app){
  const { S } = app;
  const nameEl = $('songName'), stateEl = $('saveState'), modeEl = $('saveMode'), listEl = $('songList'), newBtn = $('newSong');
  let remote = null, songs = [], busy = false;

  const readLocal = () => { try { return JSON.parse(ls.get(LOCAL_KEY) || '{}') || {}; } catch (e){ return {}; } };
  const writeLocal = o => localStorage.setItem(LOCAL_KEY, JSON.stringify(o));
  const store = {
    async list(){
      if (remote){
        const snap = await remote.orderBy('updatedAt', 'desc').limit(200).get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
      }
      const o = readLocal();
      return Object.keys(o).map(id => ({ id, ...o[id] })).sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async put(id, body){ if (remote) return remote.doc(id).set(body); const o = readLocal(); o[id] = body; writeLocal(o); },
    async del(id){ if (remote) return remote.doc(id).delete(); const o = readLocal(); delete o[id]; writeLocal(o); }
  };

  function renderSaveState(){
    stateEl.textContent = S.dirty ? '저장 안 된 변경이 있어요' : (S.currentId ? '저장됨' : '아직 저장 안 함');
    stateEl.dataset.dirty = S.dirty;
    modeEl.textContent = remote ? '내 계정에 저장돼요. 다른 기기에서 이 페이지를 열어도 보여요.' : '이 브라우저에만 저장돼요.';
  }

  const fmtDate = ts => new Date(ts).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const newId = () => 'song-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function renderList(){
    listEl.innerHTML = '';
    if (!songs.length){
      const p = document.createElement('p'); p.className = 'hint';
      p.textContent = '저장한 곡이 아직 없어요. 위에서 이름을 정하고 저장을 누르면 여기에 쌓여요.';
      listEl.appendChild(p); return;
    }
    songs.forEach(s => {
      const li = document.createElement('div'); li.className = 'song' + (s.id === S.currentId ? ' current' : '');
      const info = document.createElement('div'); info.className = 'song-info';
      const nm = document.createElement('div'); nm.className = 'song-name'; nm.textContent = s.name || '이름 없는 곡';
      const meta = document.createElement('div'); meta.className = 'song-meta';
      const insts = (s.insts || []).map(i => INST[i] ? INST[i].name : i).join('·');
      meta.textContent = (s.id === S.currentId ? '편집 중 · ' : '') + insts + ' · ' + (s.bars || 1) + '마디 · ' + fmtDate(s.updatedAt);
      info.append(nm, meta);
      const load = document.createElement('button'); load.type = 'button'; load.textContent = '불러오기';
      load.onclick = () => loadSong(s, load);
      const del = document.createElement('button'); del.type = 'button'; del.textContent = '삭제';
      del.onclick = () => deleteSong(s, del);
      li.append(info, load, del);
      listEl.appendChild(li);
    });
  }

  async function refresh(){
    try { songs = await store.list(); }
    catch (e){ stateEl.textContent = '저장 목록을 불러오지 못했어요. 잠시 후 다시 열어 주세요.'; songs = []; }
    renderList();
  }

  async function save(asNew){
    if (busy) return;
    let name = nameEl.value.trim() || '이름 없는 곡';
    const current = songs.find(s => s.id === S.currentId);
    if (asNew && current && current.name === name) name += ' 사본';
    const id = (!asNew && S.currentId) || newId();
    const body = { name, updatedAt: Date.now(), bars: app.player.tl.bars.length, insts: S.song.tracks.map(t => t.inst), song: encodeSong(S.song) };
    busy = true; stateEl.textContent = '저장하는 중…';
    try {
      await store.put(id, body);
      S.currentId = id; S.songName = name; nameEl.value = name; S.dirty = false; S.isDemo = false;
      renderSaveState(); stateEl.textContent = '저장했어요';
      app.persist(); await refresh();
    } catch (e){
      stateEl.textContent = e && e.code === 'quota_exceeded'
        ? '저장 공간이 가득 찼어요. 안 쓰는 곡을 지우고 다시 저장해 주세요.'
        : '저장하지 못했어요. 잠시 후 다시 눌러 주세요.';
    } finally { busy = false; }
  }

  function loadSong(s, btn){
    if (S.dirty && s.id !== S.currentId && !confirmTwice('load-' + s.id, btn, '변경 버리고 불러오기')) return;
    let song;
    try { song = decodeSong(s.song); }
    catch (e){ stateEl.textContent = '이 곡을 불러오지 못했어요.'; return; }
    app.applySong(song);
    S.currentId = s.id; S.songName = s.name; nameEl.value = s.name; S.dirty = false; S.isDemo = false;
    renderSaveState(); app.persist(); renderList();
  }

  async function deleteSong(s, btn){
    if (!confirmTwice('del-' + s.id, btn, '정말 삭제')) return;
    try {
      await store.del(s.id);
      if (s.id === S.currentId){ S.currentId = null; S.dirty = true; renderSaveState(); app.persist(); }
      await refresh();
    } catch (e){ stateEl.textContent = '삭제하지 못했어요. 잠시 후 다시 눌러 주세요.'; }
  }

  function newSong(){
    if (S.dirty && !confirmTwice('new', newBtn, '변경 버리고 새로 시작')) return;
    app.applySong(blankSong(S.song.mood, S.song.bpm), { t: 1 });
    S.currentId = null; S.songName = '새 곡'; nameEl.value = '새 곡'; S.dirty = false; S.isDemo = false;
    renderSaveState(); app.persist(); renderList();
  }

  $('saveSong').addEventListener('click', () => save(false));
  $('saveAs').addEventListener('click', () => save(true));
  newBtn.addEventListener('click', newSong);
  nameEl.addEventListener('input', () => { S.songName = nameEl.value; app.touch(); });
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's'){ e.preventDefault(); save(false); }
  });

  nameEl.value = S.songName;
  renderSaveState();
  refresh();

  return {
    renderSaveState, renderList,
    setRemote(col){ remote = col; renderSaveState(); refresh(); },
    setName(n){ nameEl.value = n; }
  };
}
