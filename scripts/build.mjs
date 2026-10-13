// app.html(Claude 아티팩트용 본문)을 독립 사이트용 index.html로 감싸는 스크립트
// 사용법: node scripts/build.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
const cut = src.indexOf('<div class="app"');
if (cut < 0) throw new Error('app.html에서 <div class="app"를 찾지 못했어요');
const headPart = src.slice(0, cut).trim();
const bodyPart = src.slice(cut).trim();

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="동전 같은 코인을 원판에 올리면 음악이 되는 초보자용 작곡 앱 · Drop coins on spinning discs and they become music">
<meta name="theme-color" content="#24345F">
<meta property="og:title" content="돌려돌려 작곡판 · Spin Spin Studio">
<meta property="og:description" content="동전 같은 코인을 원판에 올리면 음악이 되는 초보자용 작곡 앱 · Drop coins on spinning discs and they become music">
<meta property="og:image" content="icons/icon-512.png">
<link rel="manifest" href="manifest.webmanifest">
${headPart}
<script>window.STANDALONE = true;</script>
<!-- Vercel 방문자 통계 (Vercel 대시보드에서 Analytics를 켜야 동작) -->
<script>window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };</script>
<script defer src="/_vercel/insights/script.js"></script>
</head>
<body>
${bodyPart}
</body>
</html>
`;
fs.writeFileSync(path.join(root, 'index.html'), html);
console.log('index.html을 만들었어요');
