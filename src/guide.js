// 안내: 화면을 짚어가며 따라하는 튜토리얼과, 칸 제목 옆 "?" 설명
import { ls } from './util.js';

const TOURS = {
  beginner: [
    { el: '#stage', title: '원판에 코인을 올려요', body: '빈 칸을 누르면 코인이 놓이고, 맨 위 바늘을 지날 때 소리가 나요. 놓인 코인을 다시 누르면 빠져요. 지금 아무 칸이나 눌러보세요.' },
    { el: '.coinbox', title: '코인 상자', body: '놓기 전에 어떤 코인을 놓을지 골라요. 색은 종류(청록은 한 음, 보라는 화음), 모양은 세기, 길이는 소리가 이어지는 칸 수예요. 화음 코인은 하나만 놓아도 어울리는 음 3개가 함께 울려요.' },
    { el: '#play', title: '들어보기', body: '재생을 누르면 원판이 돌면서 연주돼요. 아래 빠르기로 속도를, 밝게·어둡게로 분위기를 바꿀 수 있어요.' },
    { el: '#trackTabs', title: '악기', body: '악기마다 원판이 따로 있고, 모든 악기가 함께 연주돼요. 이름을 누르면 그 악기의 원판으로 바뀌어요. 악기는 최대 4개까지 쓸 수 있어요.' },
    { el: '#count', title: '원판 수', body: '원판을 여러 장 쓰면 1번, 2번… 순서대로 이어서 연주돼서 긴 멜로디가 돼요. 원판 수가 적은 악기는 자기 원판을 반복해요.' },
    { el: '#discTabs', title: '원판 고르기', body: '편집할 원판을 골라요. "앞 원판 복사"로 앞 원판을 그대로 가져온 뒤 조금만 바꾸면 멜로디 만들기가 쉬워요.' },
    { el: '#view3d', title: '전체 구조', body: '모든 악기의 원판을 탑으로 보여줘요. 지금 연주 중인 원판은 노랗게 빛나요. 원판을 누르면 바로 그 원판을 편집할 수 있어요.' },
    { el: '#dice', title: '막막할 때', body: '🎲 랜덤을 누르면 이 원판에 어울리는 코인을 알아서 채워줘요. 마음에 안 드는 코인만 빼거나 옮기면 돼요.' },
    { el: '#songName', title: '저장하고 나누기', body: '곡 이름을 정하고 저장을 누르세요. 아래 "내보내기 · 공유"에서 음악 파일을 만들거나 곡 코드를 친구에게 보낼 수 있어요.' },
    { el: '#helpBtn', title: '언제든 다시', body: '이 안내는 여기서 다시 볼 수 있어요. 각 칸 제목 옆의 ? 를 누르면 짧은 설명이 나와요.' }
  ],
  expert: [
    { el: '#secTabs', title: '구간', body: '노래는 1절, 후렴처럼 부분이 반복돼요. 이 부분 하나하나가 구간이에요. 구간을 누르면 오른쪽에 그 구간의 원판이 나와요.' },
    { el: '#orderStrip', title: '연주 순서', body: '구간을 어떤 순서로 연주할지 정해요. 왼쪽부터 차례로 연주되고, 재생 중에는 지금 칸이 노랗게 표시돼요. 같은 구간을 여러 번 넣어도 돼요.' },
    { el: '#ordAdd', title: '순서 고치기', body: '순서 줄에서 칸을 하나 고른 뒤, 넣기·앞으로·뒤로·빼기로 순서를 바꿔요. "구간 넣기"는 지금 편집 중인 구간을 고른 칸 바로 뒤에 넣어요.' },
    { el: '#secAdd', title: '구간 만들기', body: '새 구간은 빈 원판으로 시작해요. "이 구간 복제"로 비슷한 구간을 만든 뒤 조금 바꾸는 게 쉬워요. 구간마다 "후렴" 같은 이름도 붙일 수 있어요.' },
    { el: '#segMeter', title: '박자', body: '한 바퀴를 몇 박으로 셀지예요. 4/4는 "하나 둘 셋 넷"으로 대부분의 노래가 이거예요. 3/4는 "쿵짝짝" 왈츠, 6/8은 출렁이는 느낌이에요. 원판의 굵은 선이 박이 시작되는 곳이에요.' },
    { el: '#segDiv', title: '박 쪼개기', body: '셋잇단으로 바꾸면 한 박이 3칸으로 나뉘어 "따다닥" 굴러가는 리듬을 만들 수 있어요. 원판마다 따로 정해서, 멜로디만 셋잇단으로 쓸 수도 있어요.' },
    { el: '#segScale', title: '음계', body: '7음을 고르면 파·시 고리(빗금)가 생기고, 코인 상자에 ♯·♭ 반음이 나타나요. 표현은 넓어지지만 어색하게 들릴 수도 있으니 소리를 들어가며 써보세요.' },
    { el: '.check', title: '재생 따라가기', body: '켜두면 재생 중에 편집 화면이 지금 연주되는 구간과 원판으로 따라가요. 곡 전체를 들으며 확인할 때 좋아요.' }
  ]
};

export const HELP = {
  play: ['재생 · 빠르기 · 분위기', '재생을 누르면 모든 악기가 함께 연주돼요. "처음"은 곡 맨 앞으로 돌아가요. 빠르기는 1분에 몇 박인지(BPM)로, 숫자가 클수록 빨라요. 밝게는 장조, 어둡게는 단조 느낌이에요. 스페이스 키로도 재생과 정지를 할 수 있어요.'],
  arrange: ['곡 구성', '구간(A, B, C…)은 1절이나 후렴 같은 곡의 한 부분이에요. 아래 연주 순서 줄에 구간을 원하는 순서로 넣으면 왼쪽부터 차례로 연주돼요. 순서 줄의 칸을 누르면 그 위치로 이동하고, 그 구간이 편집 화면에 나와요.'],
  meter: ['박자', '4/4는 한 마디에 4박(하나 둘 셋 넷), 3/4는 3박(쿵짝짝), 6/8은 8분음표 6개를 둘로 묶은 출렁이는 박자예요. 구간마다 따로 정할 수 있어요. 4/4에서 3/4로 바꾸면 마지막 박에 있던 코인은 빠져요.'],
  view3d: ['전체 구조', '편집 중인 구간의 모든 악기를 원판 탑으로 보여줘요. 아래부터 1번 원판이에요. 드래그하면 돌려볼 수 있고, 두 손가락이나 마우스 오른쪽 버튼으로 끌면 이동, 휠이나 손가락 벌리기로 확대해요. 원판을 누르면 그 원판이 편집 화면에 나와요.'],
  songs: ['내 곡', '이름을 정하고 저장하면 목록에 쌓여요. 같은 이름으로 저장하면 덮어쓰고, 이름을 바꿔 저장하면 새 곡으로 저장돼요. 목록의 줄을 누르면 불러오고, ⋯ 를 누르면 이름 바꾸기·복제·삭제를 할 수 있어요.'],
  export: ['내보내기 · 공유', '오디오 파일 만들기는 곡을 실제 길이만큼 녹음해서 MP4 파일로 만들어요. 곡 코드 복사를 누르면 곡 전체가 담긴 글자 코드가 복사되고, 받은 사람은 아래 칸에 붙여넣어 같은 곡을 열 수 있어요.'],
  tracks: ['악기', '악기마다 원판 탑이 하나씩 있고 모두 함께 연주돼요. 원판 수를 늘리면 1번부터 차례로 이어서 연주돼요. 원판 수가 적은 악기는 자기 원판을 반복해요. 음소거로 잠깐 소리를 끌 수 있고, 악기 삭제는 모든 구간에서 그 악기를 지워요.'],
  scale: ['음계', '5음은 도·레·미·솔·라만 써서 어디에 놓아도 잘 어울려요. 7음은 파·시가 더해지고(빗금 고리) ♯·♭ 반음도 쓸 수 있어요. 바꿔도 코인은 같은 음 높이로 옮겨가요.'],
  disc: ['원판', '편집할 원판을 골라요. 노란 점이 있는 원판이 지금 연주 중이에요. 안쪽 고리일수록 낮은 음이고, 바늘 오른쪽 이름표가 고리의 음이에요. 같은 바퀴살에 여러 코인을 놓으면 함께 울려요.'],
  div: ['박 쪼개기', '기본은 한 박을 4칸(16분음표)으로 나눠요. 셋잇단은 한 박을 3칸으로 나눠서 셋잇단음표 리듬을 만들어요. 6/8박자는 이미 셋으로 나뉘는 박자라 셋잇단이 없어요.'],
  coin: ['코인 상자', '원판에 놓을 코인을 골라요. 종류: 한 음은 그 음 하나, 화음은 어울리는 음 3개. 세기: 속이 빈 원은 여리게, 꽉 찬 원은 보통, 테두리 있는 원은 세게. 길이: 고른 칸 수만큼 소리가 이어지고 꼬리로 보여요.']
};

export function initGuide(){
  // ---------- "?" 설명 ----------
  const pop = document.createElement('div');
  pop.className = 'help-pop'; pop.hidden = true; pop.setAttribute('role', 'dialog');
  pop.innerHTML = '<div class="help-title"></div><p class="help-body"></p>';
  document.body.appendChild(pop);
  let popFor = null;

  function openHelp(btn){
    const h = HELP[btn.dataset.help];
    if (!h) return;
    pop.querySelector('.help-title').textContent = h[0];
    pop.querySelector('.help-body').textContent = h[1];
    pop.hidden = false;
    const r = btn.getBoundingClientRect(), w = Math.min(320, window.innerWidth - 32);
    pop.style.width = w + 'px';
    const left = Math.max(16, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 16));
    pop.style.left = (left + window.scrollX) + 'px';
    pop.style.top = (r.bottom + 8 + window.scrollY) + 'px';
    btn.setAttribute('aria-expanded', 'true');
    popFor = btn;
  }
  function closeHelp(){
    if (!popFor) return;
    pop.hidden = true;
    popFor.setAttribute('aria-expanded', 'false');
    popFor = null;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('.help');
    if (b){ const same = b === popFor; closeHelp(); if (!same) openHelp(b); return; }
    if (!e.target.closest('.help-pop')) closeHelp();
  });
  window.addEventListener('resize', closeHelp);

  // ---------- 튜토리얼 ----------
  const hole = document.createElement('div'); hole.className = 'tour-hole'; hole.hidden = true;
  const card = document.createElement('div'); card.className = 'tour-card'; card.hidden = true;
  card.setAttribute('role', 'dialog'); card.setAttribute('aria-live', 'polite');
  card.innerHTML = '<div class="tour-top"><span class="tour-step"></span><button type="button" class="tour-x" aria-label="안내 닫기">✕</button></div>'
    + '<div class="tour-title"></div><p class="tour-body"></p>'
    + '<div class="tour-nav"><button type="button" class="tour-prev">이전</button><button type="button" class="tour-next primary">다음</button></div>';
  document.body.append(hole, card);

  let tour = null, steps = [], idx = 0, raf = 0;
  const visible = el => el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

  function place(){
    if (!tour) return;
    const el = document.querySelector(steps[idx].el);
    if (!visible(el)){ raf = requestAnimationFrame(place); return; }
    const r = el.getBoundingClientRect(), pad = 6;
    Object.assign(hole.style, { top: (r.top - pad) + 'px', left: (r.left - pad) + 'px', width: (r.width + pad * 2) + 'px', height: (r.height + pad * 2) + 'px' });
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = Math.min(340, vw - 32), ch = card.offsetHeight;
    card.style.width = w + 'px';
    let top;
    if (r.bottom + 14 + ch < vh) top = r.bottom + 14;
    else if (r.top - 14 - ch > 0) top = r.top - 14 - ch;
    else top = vh - ch - 16;
    card.style.top = Math.max(16, top) + 'px';
    card.style.left = Math.max(16, Math.min(r.left + r.width / 2 - w / 2, vw - w - 16)) + 'px';
    raf = requestAnimationFrame(place);
  }

  function show(i, dir = 1){
    // 지금 화면에 없는 칸은 건너뜀
    while (i >= 0 && i < steps.length && !visible(document.querySelector(steps[i].el))) i += dir;
    if (i < 0) i = 0;
    if (i >= steps.length){ stop(); return; }
    idx = i;
    const s = steps[i];
    const el = document.querySelector(s.el);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    const shown = steps.filter(x => visible(document.querySelector(x.el)));
    card.querySelector('.tour-step').textContent = (shown.indexOf(s) + 1) + ' / ' + shown.length;
    card.querySelector('.tour-title').textContent = s.title;
    card.querySelector('.tour-body').textContent = s.body;
    card.querySelector('.tour-prev').disabled = shown.indexOf(s) === 0;
    card.querySelector('.tour-next').textContent = shown.indexOf(s) === shown.length - 1 ? '끝내기' : '다음';
    card.querySelector('.tour-next').focus({ preventScroll: true });
  }

  function start(name){
    if (!TOURS[name]) return;
    closeHelp();
    stop(false);
    tour = name; steps = TOURS[name];
    hole.hidden = false; card.hidden = false;
    show(0);
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(place);
  }
  function stop(markDone = true){
    if (tour && markDone) ls.set('coin-disc-tour-' + tour, 'done');
    tour = null;
    hole.hidden = true; card.hidden = true;
    cancelAnimationFrame(raf);
  }

  card.querySelector('.tour-next').addEventListener('click', () => show(idx + 1, 1));
  card.querySelector('.tour-prev').addEventListener('click', () => show(idx - 1, -1));
  card.querySelector('.tour-x').addEventListener('click', () => stop());
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape'){ if (tour) stop(); else closeHelp(); }
    if (!tour || e.target.closest('input, textarea, select')) return;
    if (e.key === 'ArrowRight') show(idx + 1, 1);
    if (e.key === 'ArrowLeft') show(idx - 1, -1);
  });

  return {
    start, stop,
    done: name => ls.get('coin-disc-tour-' + name) === 'done',
    get active(){ return !!tour; }
  };
}
