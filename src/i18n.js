// 언어 전환 (한국어 / English)
//
// 화면 글자는 한국어로 쓰고, 영어일 때 i18n-en.js 사전에서 같은 한국어 문장을 찾아 바꿔 보여줌.
// 언어는 페이지를 열 때 한 번 정해짐: 주소의 ?lang=en|ko → 저장된 선택 → 브라우저 언어 순서
import { EN_DICT } from './i18n-en.js';

const KEY = 'coin-disc-lang';
function store(k, v){ try { localStorage.setItem(k, v); } catch (e){} }
function load(k){ try { return localStorage.getItem(k); } catch (e){ return null; } }

let fromUrl = null;
try { fromUrl = new URLSearchParams(location.search).get('lang'); } catch (e){}
if (fromUrl !== 'en' && fromUrl !== 'ko') fromUrl = null;
if (fromUrl) store(KEY, fromUrl);
const saved = load(KEY);

export const LANG = fromUrl || (saved === 'en' || saved === 'ko' ? saved
  : ((navigator.language || '').toLowerCase().startsWith('ko') ? 'ko' : 'en'));
export const IS_EN = LANG === 'en';

// T('코인 {n}개', { n: 3 }) → 영어면 사전의 영어 문장에 값을 채워 돌려줌
export function T(ko, vars){
  let s = IS_EN ? (EN_DICT[ko] ?? ko) : ko;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
  return s;
}

// HTML에 적힌 글자와 placeholder·aria-label·title을 한꺼번에 번역
export function translateDOM(root){
  if (!IS_EN) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(n => {
    const raw = n.nodeValue, t = raw.trim();
    if (t && EN_DICT[t] !== undefined) n.nodeValue = raw.replace(t, EN_DICT[t]);
  });
  root.querySelectorAll('[placeholder],[aria-label],[title],[alt]').forEach(el => {
    ['placeholder', 'aria-label', 'title', 'alt'].forEach(a => {
      const v = el.getAttribute(a);
      if (v && EN_DICT[v] !== undefined) el.setAttribute(a, EN_DICT[v]);
    });
  });
}

// 언어를 바꾸면 저장해 두고 페이지를 다시 엶 (작업 중인 곡은 브라우저에 저장돼 있어 그대로 이어짐)
export function setLang(l){
  store(KEY, l);
  try {
    const u = new URL(location.href);
    u.searchParams.delete('lang');
    history.replaceState(null, '', u.pathname + u.search + u.hash);
  } catch (e){}
  location.reload();
}

export const dateLocale = IS_EN ? 'en-US' : 'ko-KR';
