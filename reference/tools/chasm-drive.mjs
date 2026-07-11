import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import path from 'node:path'; import os from 'node:os';
const require = createRequire(import.meta.url);
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
function findChrome(){const c=['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];const cache=path.join(os.homedir(),'.cache','puppeteer');for(const k of ['chrome-headless-shell','chrome']){const b=path.join(cache,k);if(existsSync(b)){try{const h=execSync(`ls ${b}/*/*/${k}* 2>/dev/null|head -1`).toString().trim();if(h)c.push(h);}catch{}}}for(const x of c)if(existsSync(x))return x;throw new Error('no chrome');}
const pptr=require('puppeteer-core');
const out=process.argv[2]; await mkdir(out,{recursive:true});
const browser=await pptr.launch({executablePath:findChrome(),headless:'new',args:['--no-sandbox','--disable-gpu'],defaultViewport:{width:480,height:270}});
const page=await browser.newPage();
await page.goto('http://localhost:8137/index.html?seed=1234',{waitUntil:'networkidle2',timeout:30000});
await page.waitForFunction('window.__game && window.__game.player',{timeout:15000});
// start the game (title -> playing)
await page.keyboard.press('Enter'); await sleep(120); await page.keyboard.press('KeyZ'); await sleep(300);
// snapshot pre: place player at the left edge of the chasm on solid ground
const pre = await page.evaluate(()=>{
  const w=window.__game; const L=w.level;
  w.status='playing';
  const p=w.player; p.x=2205; p.y=L.gravityFloor-40; p.vx=0; p.vy=0; p.dead=false;
  return {status:w.status, lives:w.lives, px:Math.round(p.x), py:Math.round(p.y), floor:L.gravityFloor};
});
// drive RIGHT off the edge (no jump); poll for a pit fall (y past floor) + life loss
await page.keyboard.down('ArrowRight');
let trace=[]; let sawFall=false, livesAfter=pre.lives;
for(let i=0;i<40;i++){
  await sleep(100);
  const s=await page.evaluate(()=>{const w=window.__game,p=w.player;return {t:w.frame,status:w.status,lives:w.lives,px:Math.round(p.x),py:Math.round(p.y),dead:!!p.dead};});
  trace.push(s);
  if(s.py>pre.floor) sawFall=true;
  if(s.lives<pre.lives){livesAfter=s.lives; break;}
}
await page.keyboard.up('ArrowRight');
const dataUrl=await page.evaluate(()=>{const c=document.getElementById('game');return c?c.toDataURL('image/png'):null;});
if(dataUrl) await writeFile(path.join(out,'pit-death-live.png'),Buffer.from(dataUrl.replace(/^data:image\/png;base64,/,''),'base64'));
console.log('PRE:',JSON.stringify(pre));
console.log('VERDICT sawFall=',sawFall,' livesBefore=',pre.lives,' livesAfter=',livesAfter,' pitDeath=',(livesAfter<pre.lives));
console.log('TRACE:',JSON.stringify(trace.filter((s,i)=>i%2===0||s.py>pre.floor||s.lives<pre.lives)));
await browser.close();
