export const $ = id => document.getElementById(id);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 브라우저 저장소 (막혀 있어도 앱은 동작)
export const ls = {
  get(k){ try { return localStorage.getItem(k); } catch (e){ return null; } },
  set(k, v){ try { localStorage.setItem(k, v); } catch (e){} }
};

export function readTokens(names){
  const cs = getComputedStyle(document.documentElement);
  const o = {};
  names.forEach(n => o[n] = cs.getPropertyValue('--' + n).trim());
  return o;
}

// 되돌릴 수 없는 동작은 3초 안에 한 번 더 눌러야 실행
let armed = { key: null };
export function confirmTwice(key, btn, msg){
  const now = Date.now();
  if (armed.key === key && now < armed.until){ restore(); return true; }
  restore();
  armed = { key, until: now + 3000, btn, html: btn.innerHTML };
  btn.textContent = msg;
  const mine = armed;
  setTimeout(() => { if (armed === mine) restore(); }, 3000);
  return false;
}
function restore(){
  if (armed.btn && armed.btn.isConnected) armed.btn.innerHTML = armed.html;
  armed = { key: null };
}

export function fmtTime(sec){
  const s = Math.round(sec);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
