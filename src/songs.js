// 내 곡: 저장, 불러오기, 이름 바꾸기, 복제, 삭제. 계정 저장소가 있으면 그쪽에, 없으면 이 브라우저에
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
    // 저장된 곡의 이름을 바꾸면 저장 버튼이 새 곡으로 저장한다는 걸 알려줌
    const renamed = isRenamed();
    $('saveSong').textContent = renamed ? '새 곡으로 저장' : '저장';
    if (renamed) stateEl.textContent = '이름이 바뀌어서 새 곡으로 저장돼요';
  }
  function isRenamed(){
    const current = songs.find(s => s.id === S.currentId);
    return !!current && (nameEl.value.trim() || '이름 없는 곡') !== current.name;
  }

  const fmtDate = ts => new Date(ts).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const newId = () => 'song-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // 목록 줄: 누르면 불러오기, ⋯ 를 누르면 그 줄 아래에 이름 바꾸기·복제·삭제가 펼쳐짐
  let menuFor = null, renameFor = null;

  function renderList(){
    listEl.innerHTML = '';
    if (!songs.length){
      const p = document.createElement('p'); p.className = 'hint';
      p.textContent = '저장한 곡이 아직 없어요. 위에서 이름을 정하고 저장을 누르면 여기에 쌓여요.';
      listEl.appendChild(p); return;
    }
    songs.forEach(s => {
      const li = document.createElement('div');
      li.className = 'song' + (s.id === S.currentId ? ' current' : '') + (menuFor === s.id ? ' open' : '');
      const row = document.createElement('div'); row.className = 'song-row';
      const insts = (s.insts || []).map(i => INST[i] ? INST[i].name : i).join('·');
      const metaText = (s.id === S.currentId ? '편집 중 · ' : '') + insts + ' · ' + (s.bars || 1) + '마디 · ' + fmtDate(s.updatedAt);

      if (renameFor === s.id){
        const form = document.createElement('form'); form.className = 'song-rename';
        const input = document.createElement('input');
        input.type = 'text'; input.maxLength = 40; input.value = s.name || ''; input.className = 'text-in';
        input.setAttribute('aria-label', '새 곡 이름'); input.id = 'rename-' + s.id;
        const ok = document.createElement('button'); ok.type = 'submit'; ok.className = 'primary'; ok.textContent = '✓'; ok.setAttribute('aria-label', '이름 바꾸기 확정');
        const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = '✕'; cancel.setAttribute('aria-label', '취소');
        form.onsubmit = e => { e.preventDefault(); renameSong(s, input.value); };
        cancel.onclick = () => { renameFor = null; renderList(); };
        input.onkeydown = e => { if (e.key === 'Escape'){ e.preventDefault(); renameFor = null; renderList(); } };
        form.append(input, ok, cancel);
        row.append(form);
        li.append(row);
        listEl.appendChild(li);
        setTimeout(() => { input.focus(); input.select(); }, 0);
        return;
      }

      const main = document.createElement('button');
      main.type = 'button'; main.className = 'song-main';
      main.setAttribute('aria-label', (s.name || '이름 없는 곡') + ' 불러오기');
      const nm = document.createElement('span'); nm.className = 'song-name'; nm.textContent = s.name || '이름 없는 곡';
      const meta = document.createElement('span'); meta.className = 'song-meta'; meta.textContent = metaText;
      main.append(nm, meta);
      main.onclick = () => loadSong(s, main);
      const more = document.createElement('button');
      more.type = 'button'; more.className = 'song-more'; more.textContent = '⋯';
      more.setAttribute('aria-label', (s.name || '이름 없는 곡') + ' 메뉴');
      more.setAttribute('aria-expanded', menuFor === s.id);
      more.onclick = () => { menuFor = menuFor === s.id ? null : s.id; renderList(); };
      row.append(main, more);
      li.append(row);

      if (menuFor === s.id){
        const menu = document.createElement('div'); menu.className = 'song-menu';
        const ren = document.createElement('button'); ren.type = 'button'; ren.textContent = '이름 바꾸기';
        ren.onclick = () => { menuFor = null; renameFor = s.id; renderList(); };
        const dup = document.createElement('button'); dup.type = 'button'; dup.textContent = '복제';
        dup.onclick = () => duplicateSong(s);
        const del = document.createElement('button'); del.type = 'button'; del.className = 'danger'; del.textContent = '삭제';
        del.onclick = () => deleteSong(s, del);
        menu.append(ren, dup, del);
        li.append(menu);
      }
      listEl.appendChild(li);
    });
  }

  async function renameSong(s, value){
    const name = value.trim().slice(0, 40) || '이름 없는 곡';
    renameFor = null;
    if (name === s.name){ renderList(); return; }
    try {
      if (remote) await remote.doc(s.id).update({ name });
      else { const o = readLocal(); if (o[s.id]){ o[s.id].name = name; writeLocal(o); } }
      if (s.id === S.currentId){ S.songName = name; nameEl.value = name; app.persist(); }
      await refresh();
      stateEl.textContent = '이름을 바꿨어요';
    } catch (e){ stateEl.textContent = '이름을 바꾸지 못했어요. 잠시 후 다시 해 주세요.'; renderList(); }
  }

  async function duplicateSong(s){
    menuFor = null;
    const id = newId();
    const { id: _old, ...body } = s;
    try {
      await store.put(id, { ...body, name: (s.name || '이름 없는 곡').slice(0, 37) + ' 사본', updatedAt: Date.now() });
      await refresh();
      stateEl.textContent = '복제했어요';
    } catch (e){
      stateEl.textContent = e && e.code === 'quota_exceeded' ? '저장 공간이 가득 찼어요. 안 쓰는 곡을 지우고 다시 해 주세요.' : '복제하지 못했어요. 잠시 후 다시 해 주세요.';
      renderList();
    }
  }

  async function refresh(){
    try { songs = await store.list(); }
    catch (e){ stateEl.textContent = '저장 목록을 불러오지 못했어요. 잠시 후 다시 열어 주세요.'; songs = []; renderList(); return; }
    renderList();
    renderSaveState();
  }

  async function save(asNew){
    if (busy) return;
    let name = nameEl.value.trim() || '이름 없는 곡';
    const current = songs.find(s => s.id === S.currentId);
    // 이름을 바꿔서 저장하면 원래 곡은 그대로 두고 새 곡으로 저장
    const renamed = !asNew && isRenamed();
    if (renamed) asNew = true;
    if (asNew && current && current.name === name) name += ' 사본';
    const id = (!asNew && S.currentId) || newId();
    const body = { name, updatedAt: Date.now(), bars: app.player.tl.bars.length, insts: S.song.tracks.map(t => t.inst), song: encodeSong(S.song) };
    busy = true; stateEl.textContent = '저장하는 중…';
    try {
      await store.put(id, body);
      S.currentId = id; S.songName = name; nameEl.value = name; S.dirty = false; S.isDemo = false;
      app.persist(); await refresh();
      stateEl.textContent = renamed ? '새 곡으로 저장했어요. 원래 곡은 그대로 있어요' : '저장했어요';
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
      menuFor = null;
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
    if (e.key === 'Escape' && menuFor){ menuFor = null; renderList(); }
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
