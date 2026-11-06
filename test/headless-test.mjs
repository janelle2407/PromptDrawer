import pw from '/opt/node-tools/node_modules/playwright/index.js'; const { chromium } = pw;
import fs from 'node:fs';
const EXT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const userData = '/tmp/claude-0/-home-user/e3bcbd6b-ae7f-5919-a1b3-1c00faf18e9d/scratchpad/pdtest/profile';
fs.rmSync(userData, { recursive: true, force: true });
const ctx = await chromium.launchPersistentContext(userData, {
  headless: true, channel: 'chromium',
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'],
});
const results = [];
const log = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' :: ' + extra : '')); };
try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const id = new URL(sw.url()).host;
  log('service worker registered', true, sw.url());
  const errors = [];
  // --- side panel ---
  const panel = await ctx.newPage();
  panel.on('pageerror', e => errors.push('panel: ' + e.message));
  panel.on('console', m => { if (m.type() === 'error') errors.push('panel console: ' + m.text()); });
  await panel.goto(`chrome-extension://${id}/side-panel.html`);
  await panel.waitForSelector('#improve:not([hidden])', { timeout: 5000 });
  log('panel opens on the Improve tab', (await panel.getAttribute('#tab-improve', 'aria-selected')) === 'true' && (await panel.textContent('#imp-help')).length > 20);
  await panel.fill('#imp-in', 'write an email to my landlord about the broken heater');
  await panel.click('#imp-go');
  await panel.waitForSelector('#imp-result:not([hidden])', { timeout: 5000 });
  const firstOut = await panel.inputValue('#imp-out');
  log('drawer Improve produces a CIDI result', ['Context:', 'Instructions:', 'Details:', 'Input:'].every(l => firstOut.includes(l)) && firstOut.indexOf('Context:') < firstOut.indexOf('Instructions:') && firstOut.indexOf('Instructions:') < firstOut.indexOf('Details:') && firstOut.indexOf('Details:') < firstOut.indexOf('Input:'), JSON.stringify(firstOut.slice(0, 80)));
  await panel.click('#imp-save'); await panel.waitForTimeout(300);
  const savedFromImprove = await panel.evaluate(() => chrome.storage.local.get('prompts'));
  log('drawer Improve can save the result', (savedFromImprove.prompts || []).length === 1 && savedFromImprove.prompts[0].source === 'improve');
  await panel.evaluate(() => chrome.storage.local.set({ prompts: [] })); await panel.waitForTimeout(300);
  await panel.selectOption('#imp-engine', 'inchat'); await panel.waitForTimeout(400);
  log('drawer Improve switches engine on change', /prompt engineer/.test(await panel.inputValue('#imp-out')) && (await panel.textContent('#imp-insert')).includes('Enter'));
  await panel.selectOption('#imp-engine', 'local'); await panel.waitForTimeout(300);
  // --- projects ---
  await panel.selectOption('#project-select', '__new');
  await panel.waitForSelector('#project-editor:not([hidden])', { timeout: 3000 });
  await panel.fill('#pj-name', 'Poppiwink'); await panel.fill('#pj-context', 'A kids picture-book brand about a curious puppy.'); await panel.fill('#pj-instructions', 'Australian spelling. Keep it warm and short.');
  await panel.click('#pj-save'); await panel.waitForSelector('#project-editor', { state: 'hidden' }); await panel.waitForTimeout(300);
  const pjSettings = await panel.evaluate(() => chrome.storage.local.get(['projects', 'settings']));
  log('project editor saves and activates the project', (pjSettings.projects || []).length === 1 && pjSettings.settings.activeProject === pjSettings.projects[0].id && (await panel.locator('#project-select option').count()) === 3);
  await panel.fill('#imp-in', 'write a caption for the new book'); await panel.click('#imp-go'); await panel.waitForSelector('#imp-result:not([hidden])');
  const pjOut = await panel.inputValue('#imp-out');
  log('drawer Improve folds the project in (local engine)', /Project: Poppiwink/.test(pjOut) && /Australian spelling/.test(pjOut) && /Used project/.test(await panel.textContent('#imp-note')));
  const pjInchat = await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'pd:improve', text: 'write a caption', engine: 'inchat' }));
  log('in-chat meta-prompt carries the project', pjInchat?.ok && /curious puppy/.test(pjInchat.improved) && pjInchat.usedProject === 'Poppiwink');
  const filled = await panel.evaluate(() => import(chrome.runtime.getURL('lib/storage.js')).then(m => m.fillVariables('Hi {{project}} and {{about_me}} and {{x|y}}', {}, 'ME', 'BRIEF')));
  log('{{project}} variable fills', filled === 'Hi BRIEF and ME and y');
  await panel.click('#project-edit'); await panel.waitForSelector('#project-editor:not([hidden])');
  log('edit button opens the active project', (await panel.inputValue('#pj-name')) === 'Poppiwink' && !(await panel.isHidden('#pj-delete')));
  await panel.click('#pj-cancel');
  await panel.selectOption('#project-select', ''); await panel.waitForTimeout(300);
  await panel.click('#imp-go'); await panel.waitForTimeout(300);
  log('"No project" switches it off again', !/Project: Poppiwink/.test(await panel.inputValue('#imp-out')) && (await panel.evaluate(() => chrome.storage.local.get('settings'))).settings.activeProject === '');
  await panel.selectOption('#project-select', pjSettings.projects[0].id); await panel.waitForTimeout(200);
  await panel.click('#tab-help'); log('How-to tab shows steps', (await panel.locator('#help .steps li').count()) === 5);
  await panel.click('#tab-library');
  await panel.waitForSelector('#empty:not([hidden])', { timeout: 5000 });
  log('panel shows empty state with packs', (await panel.locator('#packs button').count()) === 3);
  await panel.locator('#packs button').first().click();
  await panel.waitForSelector('#list .card');
  const cards = await panel.locator('#list .card').count();
  log('starter pack imported', cards === 6, cards + ' cards');
  await panel.fill('#search', 'shorter');
  log('search filters', (await panel.locator('#list .card').count()) === 1);
  await panel.fill('#search', '');
  // new prompt via editor
  await panel.click('#new');
  await panel.fill('#e-title', 'Test prompt'); await panel.fill('#e-folder', 'Tests'); await panel.fill('#e-tags', 'a, b'); await panel.fill('#e-body', 'Hello {{name|world}}, {{about_me}}');
  await panel.click('#e-save');
  await panel.waitForSelector('#editor', { state: 'hidden' });
  log('editor saves new prompt', (await panel.locator('#list .card').count()) === 7 && (await panel.locator('#folders button', { hasText: 'Tests' }).count()) === 1);
  // edit creates version
  await panel.locator('#list .card', { hasText: 'Test prompt' }).locator('.edit').click();
  await panel.fill('#e-body', 'Hello again {{name|world}}'); await panel.click('#e-save'); await panel.waitForSelector('#editor', { state: 'hidden' });
  await panel.locator('#list .card', { hasText: 'Test prompt' }).locator('.edit').click();
  log('version history recorded', (await panel.locator('#version-list li').count()) === 1);
  await panel.click('#e-cancel');
  // copy with variables → modal
  await panel.locator('#list .card', { hasText: 'Test prompt' }).locator('.copy').click();
  await panel.waitForSelector('.modal');
  log('variable modal appears', (await panel.locator('.modal input, .modal textarea').count()) === 1);
  await panel.keyboard.press('Escape');
  // improve via SW message (local engine)
  const improved = await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'pd:improve', text: 'write an email to my landlord about the broken heater, friendly' }));
  log('improve local engine', improved?.ok && improved.mode === 'replace' && /Context:/.test(improved.improved) && improved.diff.length > 1, (improved?.improved || '').split('\n')[0]);
  const inchat = await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'pd:improve', text: 'plan a trip', engine: 'inchat' }));
  log('improve in-chat engine', inchat?.ok && inchat.mode === 'inchat' && /prompt engineer/.test(inchat.improved));
  const nano = await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'pd:improve', text: 'plan a trip', engine: 'nano' }));
  log('nano falls back gracefully', nano?.ok && nano.engine === 'local' && /built-in AI/.test(nano.note), nano?.note);
  const byok = await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'pd:improve', text: 'plan a trip', engine: 'byok' }));
  log('byok without key falls back', byok?.ok && byok.engine === 'local' && /No API key/.test(byok.note));
  const notAi = await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'pd:insert-active', text: 'x' }));
  log('insert refuses non-AI tab', notAi?.error === 'not-ai-tab');
  const sites = await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'pd:sites' }));
  log('sites listed', sites?.sites?.length === 5 && Array.isArray(sites.open));
  const askall = await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'pd:ask-all', text: 'hello' }));
  log('ask-all reports missing tabs', askall?.ok && askall.missing.length === 5 && askall.delivered.length === 0);
  // export json
  const [download] = await Promise.all([panel.waitForEvent('download'), panel.click('#export-json')]);
  const path = await download.path(); const json = JSON.parse(fs.readFileSync(path, 'utf8'));
  log('export json includes projects, never keys', json.prompts.length === 7 && json.projects?.length === 1 && !JSON.stringify(json).includes('byokKeys'));
  // --- welcome page ---
  const welcome = await ctx.newPage(); welcome.on('pageerror', e => errors.push('welcome: ' + e.message));
  await welcome.goto(`chrome-extension://${id}/welcome.html`); await welcome.waitForSelector('#try-go');
  await welcome.click('#try-go'); await welcome.waitForSelector('#try-result:not([hidden])', { timeout: 5000 });
  log('welcome page try-it box improves', /Context:/.test(await welcome.inputValue('#try-out')));
  await welcome.close();
  // --- options ---
  const opts = await ctx.newPage();
  opts.on('pageerror', e => errors.push('options: ' + e.message));
  await opts.goto(`chrome-extension://${id}/options.html`);
  await opts.waitForSelector('#engine');
  await opts.selectOption('#engine', 'inchat');
  await opts.fill('#aboutMe', 'I am a tester.'); await opts.waitForTimeout(600);
  const settings = await opts.evaluate(() => chrome.storage.local.get('settings'));
  log('options persist settings', settings.settings.engine === 'inchat' && settings.settings.aboutMe === 'I am a tester.');
  const badge = await opts.textContent('#pro-badge');
  log('test mode shows Pro', badge.trim() === 'Pro');
  // --- end-to-end on routed fake chat hosts (real content script, real SW) ---
  const copilotHtml = `<!doctype html><html><body><textarea id="userInput" placeholder="Message Copilot"></textarea><button aria-label="Submit message" id="send">Send</button><script>window.sent=0;document.getElementById('send').addEventListener('click',()=>{window.sent++});</script></body></html>`;
  const chatgptHtml = `<!doctype html><html><body><div id="prompt-textarea" class="ProseMirror" contenteditable="true"><p><br></p></div><button data-testid="send-button" id="send">Send</button><script>
    const ed=document.getElementById('prompt-textarea');window.sent=0;
    ed.addEventListener('paste',e=>{e.preventDefault();const t=e.clipboardData.getData('text/plain');const sel=window.getSelection();const collapsed=sel.rangeCount&&sel.getRangeAt(0).collapsed;const html=t.replace(/^\\n/,'').split('\\n').map(l=>'<p>'+(l||'<br>')+'</p>').join('');if(collapsed&&ed.innerText.trim()){ed.insertAdjacentHTML('beforeend',html);}else{ed.innerHTML=html;}});
    document.getElementById('send').addEventListener('click',()=>{window.sent++});</script></body></html>`;
  await ctx.route('https://copilot.microsoft.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: copilotHtml }));
  await ctx.route('https://chatgpt.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: chatgptHtml }));
  const copilot = await ctx.newPage(); copilot.on('pageerror', e => errors.push('copilot: ' + e.message));
  await copilot.goto('https://copilot.microsoft.com/'); await copilot.waitForSelector('#promptdrawer-root', { state: 'attached', timeout: 8000 });
  const gpt = await ctx.newPage(); gpt.on('pageerror', e => errors.push('chatgpt: ' + e.message));
  await gpt.goto('https://chatgpt.com/'); await gpt.waitForSelector('#promptdrawer-root', { state: 'attached', timeout: 8000 });
  log('content script mounted on both routed hosts', true);
  const sitesNow = await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'pd:sites' }));
  log('SW sees both open AI tabs', sitesNow.open.map(t => t.site).sort().join(',') === 'chatgpt,copilot', JSON.stringify(sitesNow.open.map(t => t.site)));
  const aa = await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'pd:ask-all', text: 'Compare apples\nand oranges', send: true }));
  log('ask-all delivered to both', aa?.ok && aa.delivered.length === 2 && aa.delivered.every(d => d.ok) && aa.missing.length === 3, JSON.stringify(aa));
  await copilot.waitForTimeout(400);
  log('copilot textarea filled + sent', (await copilot.inputValue('#userInput')) === 'Compare apples\nand oranges' && (await copilot.evaluate(() => window.sent)) === 1);
  log('chatgpt editor filled + sent', (await gpt.evaluate(() => document.getElementById('prompt-textarea').innerText)).includes('oranges') && (await gpt.evaluate(() => window.sent)) === 1);
  await gpt.bringToFront();
  const gt = await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'pd:get-active-text' }));
  log('get-active-text reads ChatGPT composer (needs focused window)', gt?.ok && gt.text === 'Compare apples\nand oranges', JSON.stringify(gt));
  const ia = await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'pd:insert-active', text: 'Appended line', replace: false }));
  const gptText = await gpt.evaluate(() => document.getElementById('prompt-textarea').innerText);
  log('insert-active appends (keeps existing text)', ia?.ok && gptText.includes('Appended line') && gptText.includes('oranges'), JSON.stringify(gptText));
  // Alt+S in the page opens the save dialog (content script), Ctrl+Enter saves through the SW.
  await gpt.bringToFront(); await gpt.focus('#prompt-textarea');
  gpt.on('console', m => console.log('GPT console:', m.text()));
  await gpt.keyboard.press('Alt+i'); await gpt.waitForTimeout(700);
  await gpt.screenshot({ path: 'after-alt-i.png' });
  const tipSeen = await panel.evaluate(() => chrome.storage.local.get('settings'));
  log('Alt+I opens Improve and marks the first-run tip as seen', tipSeen.settings?.tipSeen === true);
  await gpt.keyboard.press('Escape'); await gpt.waitForTimeout(200);
  await gpt.keyboard.press('Alt+s'); await gpt.waitForTimeout(400);
  await gpt.screenshot({ path: 'after-alt-s.png' });
  await gpt.keyboard.press('Control+Enter'); await gpt.waitForTimeout(600);
  await gpt.screenshot({ path: 'after-ctrl-enter.png' });
  const all = await panel.evaluate(() => chrome.storage.local.get('prompts'));
  const fromPage = (all.prompts || []).find(p => p.body.includes('Appended line'));
  log('Alt+S save from page lands in storage with source', Boolean(fromPage) && fromPage.source === 'ChatGPT', JSON.stringify(fromPage && { title: fromPage.title, source: fromPage.source }));
  // --- two chat boxes side by side (claude.ai project chat + thread) ---
  const claudeHtml = `<!doctype html><html><body><div id="left" class="ProseMirror" contenteditable="true"><p><br></p></div><div id="right" class="ProseMirror" contenteditable="true"><p><br></p></div><script>
    for (const ed of document.querySelectorAll('.ProseMirror')) ed.addEventListener('paste',e=>{e.preventDefault();const t=e.clipboardData.getData('text/plain');const html=t.replace(/^\\n/,'').split('\\n').map(l=>'<p>'+(l||'<br>')+'</p>').join('');ed.innerHTML=html;});</script></body></html>`;
  await ctx.route('https://claude.ai/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: claudeHtml }));
  const claude = await ctx.newPage(); claude.on('pageerror', e => errors.push('claude: ' + e.message));
  await claude.goto('https://claude.ai/'); await claude.waitForSelector('#promptdrawer-root', { state: 'attached', timeout: 8000 });
  await claude.bringToFront();
  const g1 = await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'pd:insert-active', text: 'Hello thread', replace: true }));
  const boxes1 = await claude.evaluate(() => [document.getElementById('left').innerText, document.getElementById('right').innerText]);
  log('two chat boxes, none used yet: insert goes to the last one and is flagged as a guess', g1?.ok && g1.guessed === true && boxes1[1].includes('Hello thread') && !boxes1[0].includes('Hello thread'), JSON.stringify([g1, boxes1]));
  await claude.focus('#left'); await claude.waitForTimeout(100);
  const g2 = await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'pd:insert-active', text: 'Hello project', replace: true }));
  const boxes2 = await claude.evaluate(() => [document.getElementById('left').innerText, document.getElementById('right').innerText]);
  log('two chat boxes: insert goes to the one you clicked in', g2?.ok && g2.guessed === false && boxes2[0].includes('Hello project') && !boxes2[1].includes('Hello project'), JSON.stringify([g2, boxes2]));
  await claude.evaluate(() => document.getElementById('left').blur());
  const g3 = await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'pd:insert-active', text: 'Still project', replace: true }));
  const boxes3 = await claude.evaluate(() => [document.getElementById('left').innerText, document.getElementById('right').innerText]);
  log('two chat boxes: after clicking away, insert still goes to the one used last', g3?.ok && boxes3[0].includes('Still project') && !boxes3[1].includes('Still project'), JSON.stringify([g3, boxes3]));
  await claude.close();
  // --- 0.2.3: copilot.com (new hostname) gets the Copilot adapter, not the generic fallback ---
  // A decoy textarea after the real one: the generic fallback would pick the last box; the adapter picks #userInput and finds the send button.
  const copilotComHtml = copilotHtml.replace('<button', '<textarea id="decoy"></textarea><button');
  await ctx.route('https://copilot.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: copilotComHtml }));
  const cc = await ctx.newPage(); cc.on('pageerror', e => errors.push('copilot.com: ' + e.message));
  await cc.goto('https://copilot.com/'); await cc.waitForSelector('#promptdrawer-root', { state: 'attached', timeout: 8000 });
  await cc.bringToFront();
  const ccIns = await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'pd:insert-active', text: 'Hello new Copilot', send: true }));
  await cc.waitForTimeout(300);
  const ccState = await cc.evaluate(() => ({ main: document.getElementById('userInput').value, decoy: document.getElementById('decoy').value, sent: window.sent }));
  log('copilot.com uses the Copilot adapter (right box, send button found)', ccIns?.ok && ccIns.guessed === false && ccState.main === 'Hello new Copilot' && ccState.decoy === '' && ccState.sent === 1, JSON.stringify([ccIns, ccState]));
  await cc.close();
  // --- 0.2.3: closed-shadow-root probe via CDP (the toolbar lives in a closed shadow root) ---
  async function inShadow(page, selector, expr) {
    const cdp = await ctx.newCDPSession(page);
    try {
      const { root: doc } = await cdp.send('DOM.getDocument', { depth: 0 });
      const { nodeId: hostId } = await cdp.send('DOM.querySelector', { nodeId: doc.nodeId, selector: '#promptdrawer-root' });
      const { node } = await cdp.send('DOM.describeNode', { nodeId: hostId, depth: 0, pierce: true });
      const { nodeIds } = await cdp.send('DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds: [node.shadowRoots[0].backendNodeId] });
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: nodeIds[0], selector });
      if (!nodeId) return null;
      const { object } = await cdp.send('DOM.resolveNode', { nodeId });
      const { result } = await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: `function(){ return ${expr}; }`, returnByValue: true });
      return result.value;
    } finally { await cdp.detach(); }
  }
  // --- 0.2.3: macOS Option+I sends key "ˆ" with code "KeyI"; the fallback shortcut must still open Improve ---
  await gpt.bringToFront(); await gpt.focus('#prompt-textarea');
  await gpt.keyboard.press('Escape'); await gpt.waitForTimeout(150);
  log('no Improve dialog before the Option-key test', (await inShadow(gpt, '#pd-out', 'true')) === null);
  const kb = await ctx.newCDPSession(gpt);
  await kb.send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 1, key: 'ˆ', code: 'KeyI', windowsVirtualKeyCode: 73, nativeVirtualKeyCode: 73 });
  await kb.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 1, key: 'ˆ', code: 'KeyI', windowsVirtualKeyCode: 73, nativeVirtualKeyCode: 73 });
  await kb.detach(); await gpt.waitForTimeout(700);
  log('Option+I on a Mac keyboard (key "ˆ", code KeyI) opens Improve', (await inShadow(gpt, '#pd-out', 'true')) === true);
  await gpt.keyboard.press('Escape'); await gpt.waitForTimeout(150);
  // --- 0.2.3: turning the toolbar off in Settings also hides the first-run tip; tipSeen is applied live ---
  const before = (await panel.evaluate(() => chrome.storage.local.get('settings'))).settings || {};
  await panel.evaluate(s => chrome.storage.local.set({ settings: { ...s, showToolbar: true, tipSeen: false } }), before);
  await gpt.waitForTimeout(200);
  log('tip shows again when tipSeen is cleared', (await inShadow(gpt, '#tip', 'this.hidden')) === false && (await inShadow(gpt, '#bar', 'this.hidden')) === false);
  await panel.evaluate(s => chrome.storage.local.set({ settings: { ...s, showToolbar: false, tipSeen: false } }), before);
  await gpt.waitForTimeout(200);
  log('toolbar off hides the tip too', (await inShadow(gpt, '#tip', 'this.hidden')) === true && (await inShadow(gpt, '#bar', 'this.hidden')) === true);
  await panel.evaluate(s => chrome.storage.local.set({ settings: { ...s, showToolbar: true, tipSeen: true } }), before);
  await gpt.waitForTimeout(200);
  log('toolbar back on with tipSeen keeps the tip hidden', (await inShadow(gpt, '#tip', 'this.hidden')) === true && (await inShadow(gpt, '#bar', 'this.hidden')) === false);
  // --- 0.2.3: a slow earlier engine reply must not overwrite a newer one (panel Improve) ---
  await panel.bringToFront(); await panel.click('#tab-improve'); await panel.waitForSelector('#imp-in', { state: 'visible' });
  await panel.evaluate(() => {
    const orig = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = (m, ...rest) => { const p = orig(m, ...rest); return (m?.type === 'pd:improve' && m.engine === 'inchat') ? p.then(v => new Promise(res => setTimeout(() => res(v), 900))) : p; };
  });
  await panel.fill('#imp-in', 'write a product description for a mug');
  await panel.selectOption('#imp-engine', 'local'); await panel.click('#imp-go'); await panel.waitForSelector('#imp-result:not([hidden])', { timeout: 5000 });
  await panel.selectOption('#imp-engine', 'inchat'); // slow reply (900 ms)
  await panel.selectOption('#imp-engine', 'local');  // fast reply
  await panel.waitForTimeout(1500);
  const raceOut = await panel.inputValue('#imp-out'); const raceEngine = await panel.inputValue('#imp-engine'); const raceBtn = await panel.textContent('#imp-go');
  log('late reply from an older engine is ignored (panel)', raceEngine === 'local' && /Context:/.test(raceOut) && !/better prompt|improve/i.test(raceOut.split('\n')[0]) && raceBtn.trim() === 'Improve', JSON.stringify({ raceEngine, first: raceOut.split('\n')[0], raceBtn }));
  // real site mount check (network may block; informational)
  const real = await ctx.newPage();
  await ctx.unroute('https://chatgpt.com/**');
  try { await real.goto('https://chatgpt.com/', { timeout: 20000, waitUntil: 'domcontentloaded' }); await real.waitForTimeout(2500); log('content script mounted on real chatgpt.com (page title: ' + (await real.title()).slice(0, 30) + ')', (await real.locator('#promptdrawer-root').count()) === 1); }
  catch (e) { log('real chatgpt.com reachable', false, e.message.slice(0, 80)); }
  await real.close();
  if (errors.length) console.log('ERRORS:', errors);
} catch (e) { console.log('TEST CRASH', e); }
finally { await ctx.close(); }
console.log(JSON.stringify({ passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length }));
