import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path'; import os from 'node:os';
const require = createRequire(import.meta.url);
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
function findChrome(){const c=['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];const cache=path.join(os.homedir(),'.cache','puppeteer');for(const k of ['chrome-headless-shell','chrome']){const b=path.join(cache,k);if(existsSync(b)){try{const h=execSync(`ls ${b}/*/*/${k}* 2>/dev/null|head -1`).toString().trim();if(h)c.push(h);}catch{}}}for(const x of c)if(existsSync(x))return x;throw new Error('no chrome');}
const pptr=require('puppeteer-core');
const browser=await pptr.launch({executablePath:findChrome(),headless:'new',args:['--no-sandbox','--disable-gpu'],defaultViewport:{width:480,height:270}});
const page=await browser.newPage();
await page.goto('http://localhost:8137/index.html?seed=1234',{waitUntil:'networkidle2',timeout:30000});
await page.waitForFunction('window.__game && window.__game.player',{timeout:15000});
await page.keyboard.press('Enter'); await sleep(120); await page.keyboard.press('KeyZ'); await sleep(300);
const pre = await page.evaluate(()=>{const w=window.__game,L=w.level,p=w.player;w.status='playing';p.x=2205;p.y=L.gravityFloor-40;p.vx=0;p.vy=0;p.dead=false;return {lives:w.lives,floor:L.gravityFloor,leftSeg:'0..2220',rightSeg:'2278..2400'};});
await page.keyboard.down('ArrowRight');
let trace=[];
for(let i=0;i<28;i++){await sleep(80);const s=await page.evaluate(()=>{const w=window.__game,p=w.player;return {t:w.frame,lives:w.lives,px:Math.round(p.x),py:Math.round(p.y),dead:!!p.dead};});trace.push(s);}
await page.keyboard.up('ArrowRight');
// settle then read final resting position
await sleep(600);
const post=await page.evaluate(()=>{const w=window.__game,p=w.player;return {lives:w.lives,px:Math.round(p.x),py:Math.round(p.y),dead:!!p.dead};});
console.log('PRE:',JSON.stringify(pre));
console.log('FULL TRACE:',JSON.stringify(trace));
console.log('POST(settled):',JSON.stringify(post));
await browser.close();
