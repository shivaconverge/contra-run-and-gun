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
const browser=await pptr.launch({executablePath:findChrome(),headless:'new',args:['--no-sandbox','--disable-gpu'],defaultViewport:{width:640,height:400}});
for(const n of [540,560,580,600]){
  const page=await browser.newPage();
  await page.goto(`http://localhost:8137/index.html?headless=1&frames=${n}&seed=1234`,{waitUntil:'networkidle2',timeout:30000});
  await page.waitForSelector('#headless-done',{timeout:15000}).catch(()=>{});
  await sleep(150);
  const info=await page.evaluate(()=>{
    const w=window.__game; if(!w) return null;
    const cam = w.camera ? (w.camera.x||0) : (w.cameraX||0);
    const es=(w.enemies||[]).filter(e=>e.alive!==false).map(e=>({kind:e.kind,x:Math.round(e.x),screenX:Math.round(e.x-cam)}));
    return {cam:Math.round(cam), playerX:Math.round(w.player.x), enemies:es};
  });
  const dataUrl=await page.evaluate(()=>{const c=document.getElementById('game');return c?c.toDataURL('image/png'):null;});
  if(dataUrl) await writeFile(path.join(out,`probe-${n}.png`),Buffer.from(dataUrl.replace(/^data:image\/png;base64,/,''),'base64'));
  console.log(`frame ${n}:`, JSON.stringify(info));
  await page.close();
}
await browser.close();
