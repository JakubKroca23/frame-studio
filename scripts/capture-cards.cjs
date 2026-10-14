const { chromium } = require('playwright-core'); const fs = require('fs'); const { execSync } = require('child_process');
const U = 'http://localhost:4333/', N = +(process.env.N || 36), ONLY = process.env.ONLY;
const orbit = (dx) => async (p, box) => { const x = box.x + box.width / 2, y = box.y + box.height / 2; await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + dx, y, { steps: 2 }); await p.mouse.up() };
const openFile = async (p, file) => { await p.locator('.topbar input[type=file]').setInputFiles(file) };
const cards = {
  config: { url: '#novy/scania-r-6x2-rigid', frame: orbit(-14) },
  hooklift: { keepSide: true, url: '#multilift/ULTIMA%2021S.56',  frame: orbit(-14) },
  crane: { keepSide: true, url: '#jeraby/408',  frame: async (p, b, t) => p.evaluate((t) => window.__craneAnim(t), t) },
  stability: { url: '#novy', setup: async (p) => { await openFile(p, '/workspace/e2e/mock-stab.json'); await p.waitForTimeout(6000) }, frame: async (p, b, t) => p.evaluate((t) => window.__slew(Math.round(t * 360)), t) },
  dxf: { url: '', setup: async (p) => { await openFile(p, '/workspace/frame-studio/public/samples/scania-icd-sample.dxf'); await p.waitForTimeout(12000); await p.locator('button', { hasText: 'Vygenerovat vše' }).first().click(); await p.waitForTimeout(10000); const hb = p.locator('button', { hasText: 'Skrýt' }); if (await hb.count()) await hb.first().click() }, frame: orbit(-14) },
};
(async () => { const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
 for (const [k, c] of Object.entries(cards)) { if (ONLY && !ONLY.split(',').includes(k)) continue
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); const p = await ctx.newPage(); p.setDefaultTimeout(180000); p.on('pageerror', e => console.log(k, 'ERR', e.message));
  await p.goto(U + c.url, { waitUntil: 'networkidle' }); await p.waitForTimeout(4000); if (c.setup) await c.setup(p);
  if (!c.keepSide) await p.evaluate(() => document.body.classList.add('hide-side')); await p.waitForTimeout(2500);
  await p.screenshot({ path: `/tmp/cards/${k}-page.png` });
  const cvs = await p.locator('main canvas, .app-main canvas, .viewport canvas, canvas').all(); let cv = cvs[0], box = null; for (const c of cvs) { const bb = await c.boundingBox(); if (bb && (!box || bb.width * bb.height > box.width * box.height)) { box = bb; cv = c } }
  fs.rmSync(`/tmp/cards/${k}`, { recursive: true, force: true }); fs.mkdirSync(`/tmp/cards/${k}`);
  for (let i = 0; i < N; i++) { await c.frame(p, box, i / N); await p.waitForTimeout(180); await p.screenshot({ path: `/tmp/cards/${k}/${String(i).padStart(3, '0')}.png`, clip: box }) }
  console.log(k, 'done', JSON.stringify(box)); await ctx.close() }
 await b.close() })();
