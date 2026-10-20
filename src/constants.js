// 앱 전체에서 쓰는 고정값
import { T, IS_EN } from './i18n.js';

export const INST = {
  piano:    { name: T('피아노'), base: 60 },
  musicbox: { name: T('오르골'), base: 72 },
  kalimba:  { name: T('칼림바'), base: 60 },
  marimba:  { name: T('마림바'), base: 48 },
  violin:   { name: T('바이올린'), base: 60 },
  cello:    { name: T('첼로'), base: 48 },
  bass:     { name: T('베이스'), base: 36 },
  drum:     { name: T('드럼') }
};
export const INST_ORDER = ['musicbox', 'piano', 'kalimba', 'marimba', 'violin', 'cello', 'bass', 'drum'];
export const DRUMS = ['킥', '스네어', '박수', '닫힌 하이햇', '열린 하이햇'].map(s => T(s));
// 원판 이름표용 짧은 이름
export const DRUM_SHORT = ['킥', '스네어', '박수', '하이햇', '열린햇'].map(s => T(s));

// 음계: 5음(펜타토닉) / 7음. 값은 도(C)로부터의 반음 거리
export const SCALE = {
  5: { bright: [0, 2, 4, 7, 9],          dark: [-3, 0, 2, 4, 7] },
  7: { bright: [0, 2, 4, 5, 7, 9, 11],   dark: [-3, -1, 0, 2, 4, 5, 7] }
};
export const DIATONIC = [0, 2, 4, 5, 7, 9, 11];
// 음 이름: 한국어는 도레미, 영어는 C D E
export const PC_NAME = IS_EN
  ? { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' }
  : { 0: '도', 2: '레', 4: '미', 5: '파', 7: '솔', 9: '라', 11: '시' };
export const TENSE = [5, 11]; // 파, 시
export const ACC = { '-1': '♭', '0': '', '1': '♯' };
export const VEL_GAIN = [0.45, 0.85, 1.25];

// 박자표. q = 한 마디의 4분음표 수
// s = 기본 원판, t = 셋잇단 원판. slots = 한 바퀴 칸 수, strong = 몇 칸마다 박이 시작되는지, mid = 보조선 간격
export const METERS = {
  '4/4': { q: 4, s: { slots: 16, strong: 4, mid: 0 }, t: { slots: 12, strong: 3, mid: 0 } },
  '3/4': { q: 3, s: { slots: 12, strong: 4, mid: 0 }, t: { slots: 9,  strong: 3, mid: 0 } },
  '6/8': { q: 3, s: { slots: 12, strong: 6, mid: 2 }, t: null }
};
export const METER_KEYS = ['4/4', '3/4', '6/8'];

export const COUNTS = [1, 2, 4, 8];
export const MAX_TRACKS = 4;
export const MAX_SECTIONS = 6;
export const MAX_ORDER = 24;
