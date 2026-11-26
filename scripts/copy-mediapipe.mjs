// MediaPipe の WASM を public/mediapipe/ にコピーする（自前配信して外部CDNに依存しないため）
import { cpSync, mkdirSync } from 'node:fs';
const src = 'node_modules/@mediapipe/tasks-vision/wasm';
const dst = 'public/mediapipe';
mkdirSync(dst, { recursive: true });
cpSync(src, dst, { recursive: true });
console.log(`copied ${src} -> ${dst}`);
