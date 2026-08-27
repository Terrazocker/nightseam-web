// CDP verification helper for the deployed AstroPilot Web.
// Launches headless Chrome, loads the live page, evaluates visibility checks
// (catches the hidden-attribute-overridden-by-display:flex class of bugs),
// and captures a screenshot. Run: node verify_cdp.mjs <url> <out-png>
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9333;
const URL = process.argv[2] || 'https://pitop.net/';
const OUT = process.argv[3] || 'verify-cdp.png';

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + fs.mkdtempSync('apweb-cdp-'),
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function main() {
  // wait for the debugging endpoint
  let ver = null;
  for (let i = 0; i < 40 && !ver; i++) {
    try { ver = await getJson(`http://127.0.0.1:${PORT}/json/version`); }
    catch { await sleep(250); }
  }
  if (!ver) throw new Error('chrome did not start');

  const target = await getJson(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(URL)}`, { method: 'PUT' });
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map();
  const events = [];

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method) {
      events.push(msg);
    }
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

  await new Promise((r) => (ws.onopen = r));
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: URL });
  // wait for load + allow catalog fetch and night computation
  await sleep(10000);

  const expr = `(() => {
    const modal = document.querySelector('#modal');
    const tooltip = document.querySelector('#tooltip');
    return JSON.stringify({
      title: document.title,
      modalRects: modal.getClientRects().length,
      modalVisible: typeof modal.checkVisibility === 'function' ? modal.checkVisibility() : null,
      modalHiddenAttr: modal.hasAttribute('hidden'),
      tooltipVisible: typeof tooltip.checkVisibility === 'function' ? tooltip.checkVisibility() : null,
      hasPickList: !!document.querySelector('.pick'),
      hasDarkTime: !!document.querySelector('.card h3'),
      mainChildren: document.querySelector('main').children.length,
    });
  })()`;
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log('EVAL:', r.result.result.value);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(OUT, Buffer.from(shot.result.data, 'base64'));
  console.log('SCREENSHOT:', OUT, fs.statSync(OUT).size, 'bytes');

  ws.close();
  chrome.kill();
}

main().catch((e) => { console.error('FAIL:', e.message); chrome.kill(); process.exit(1); });