// PromptDrawer content script. Runs only on the five AI chat sites listed in
// manifest.json. It reads and writes the chat composer, shows a small toolbar
// and the save / improve dialogs. It never reads the conversation itself.
(() => {
  if (window.__promptDrawerLoaded) return;
  window.__promptDrawerLoaded = true;

  const ADAPTERS = {
    'chatgpt.com': { name: 'ChatGPT', composer: ['#prompt-textarea', 'div.ProseMirror[contenteditable="true"]', 'form textarea'], send: ['button[data-testid="send-button"]', 'button[aria-label="Send prompt"]', 'form button[type="submit"]'] },
    'claude.ai': { name: 'Claude', composer: ['div.ProseMirror[contenteditable="true"]', 'fieldset div[contenteditable="true"]', 'div[contenteditable="true"][data-placeholder]'], send: ['button[aria-label="Send message"]', 'button[aria-label="Send Message"]'] },
    'gemini.google.com': { name: 'Gemini', composer: ['div.ql-editor[contenteditable="true"]', 'rich-textarea div[contenteditable="true"]', 'div[contenteditable="true"][aria-label*="prompt" i]'], send: ['button[aria-label="Send message"]', 'button.send-button', 'button[aria-label*="Send" i]'] },
    'www.perplexity.ai': { name: 'Perplexity', composer: ['#ask-input', 'div[contenteditable="true"][role="textbox"]', 'textarea[placeholder*="Ask" i]'], send: ['button[aria-label="Submit"]', 'button[data-testid="submit-button"]'] },
    'copilot.microsoft.com': { name: 'Copilot', composer: ['#userInput', 'textarea[data-testid="composer-input"]', 'div[contenteditable="true"][role="textbox"]', 'textarea[placeholder*="Message" i]'], send: ['button[aria-label="Submit message"]', 'button[data-testid="submit-button"]', 'button[aria-label="Send"]'] },
  };
  ADAPTERS['copilot.com'] = ADAPTERS['copilot.microsoft.com']; // same app, newer hostname
  const adapter = ADAPTERS[location.hostname] || { name: location.hostname, composer: [], send: [] };

  // --- Composer access ----------------------------------------------------
  const visible = (el) => el && el.isConnected && el.getClientRects().length > 0;
  const editable = (el) => el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable);

  // Sites such as claude.ai can show two chat boxes side by side (a project chat and a thread).
  // Remember the one the person used last so inserts land there, not in the first one on the page.
  let lastUsed = null;
  document.addEventListener('focusin', event => {
    const target = event.composedPath()[0];
    if (editable(target) && !root.contains(target)) lastUsed = target;
  }, true);

  function findComposer() {
    let candidates = [];
    for (const selector of adapter.composer) {
      candidates = [...document.querySelectorAll(selector)].filter(visible);
      if (candidates.length) break;
    }
    if (!candidates.length) {
      const active = document.activeElement;
      if (editable(active) && !root.contains(active) && visible(active)) return active;
      const all = [...document.querySelectorAll('textarea, [contenteditable="true"]')].filter(visible).filter(el => !root.contains(el));
      candidates = all;
    }
    if (candidates.length <= 1) return candidates[0] || null;
    // More than one chat box: the one the person is in, then the one used last,
    // then the last on the page (threads and side panels come after the main chat).
    const active = document.activeElement;
    if (candidates.includes(active)) return active;
    if (candidates.includes(lastUsed)) return lastUsed;
    return candidates[candidates.length - 1];
  }

  // True when the page shows several chat boxes and none has been used yet, so the pick is a guess.
  function composerGuessed() {
    for (const selector of adapter.composer) {
      const found = [...document.querySelectorAll(selector)].filter(visible);
      if (found.length) return found.length > 1 && !found.includes(document.activeElement) && !found.includes(lastUsed);
    }
    return false;
  }

  function readComposer(el = findComposer()) {
    if (!el) return '';
    if (el instanceof HTMLTextAreaElement) return el.value;
    // Rich editors keep one <p> or <div> per line; innerText would double the newlines.
    const blocks = [...el.children];
    const clean = (s) => (s || '').replace(/\u200b/g, '');
    if (blocks.length && blocks.every(b => /^(P|DIV)$/.test(b.tagName))) {
      return blocks.map(b => clean(b.innerText).replace(/\n$/, '')).join('\n').replace(/\n+$/, '');
    }
    return clean(el.innerText).replace(/\n+$/, '');
  }

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  async function writeComposer(text, { replace = true } = {}) {
    const el = findComposer();
    if (!el) return { ok: false, error: 'no-composer' };
    const guessed = composerGuessed();
    el.focus();
    if (el instanceof HTMLTextAreaElement) {
      const next = replace ? text : (el.value ? el.value + '\n' + text : text);
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) setter.call(el, next); else el.value = next;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.selectionStart = el.selectionEnd = el.value.length;
      return { ok: true, guessed };
    }
    const selection = window.getSelection();
    const selectAll = () => { const range = document.createRange(); range.selectNodeContents(el); selection.removeAllRanges(); selection.addRange(range); };
    const placeCaretAtEnd = () => { const range = document.createRange(); range.selectNodeContents(el); range.collapse(false); selection.removeAllRanges(); selection.addRange(range); };
    const want = replace ? text : (readComposer(el) ? readComposer(el) + '\n' + text : text);
    const norm = (s) => s.replace(/\s+/g, ' ').trim();
    const probe = norm(text.slice(0, 60));
    const landed = () => { const now = norm(readComposer(el)); return now.includes(probe) && (!replace || now.startsWith(probe.slice(0, 20))); };

    // 1. Synthetic paste: editors like ProseMirror, Lexical and Quill handle it natively.
    try {
      if (replace) selectAll(); else placeCaretAtEnd();
      await sleep(10);
      const data = new DataTransfer();
      data.setData('text/plain', replace ? text : '\n' + text);
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
      await sleep(60);
      if (landed()) return { ok: true, method: 'paste', guessed };
    } catch { /* fall through */ }
    // 2. execCommand insertText (still works in Chrome for contenteditable).
    try {
      if (replace) document.execCommand('selectAll', false); else placeCaretAtEnd();
      document.execCommand('insertText', false, replace ? text : '\n' + text);
      await sleep(60);
      if (landed()) return { ok: true, method: 'insertText', guessed };
    } catch { /* fall through */ }
    // 3. Last resort: set the text and tell the framework something changed.
    el.innerText = want;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: want }));
    await sleep(30);
    placeCaretAtEnd();
    return { ok: landed(), method: 'innerText', guessed, error: landed() ? '' : 'insert-failed' };
  }

  async function pressSend() {
    await sleep(150);
    for (const selector of adapter.send) {
      const button = [...document.querySelectorAll(selector)].find(visible);
      if (button && !button.disabled && button.getAttribute('aria-disabled') !== 'true') { button.click(); return true; }
    }
    const el = findComposer();
    if (!el) return false;
    const init = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent('keydown', init));
    el.dispatchEvent(new KeyboardEvent('keyup', init));
    return true;
  }

  // --- UI (shadow DOM so site CSS cannot leak in or out) -------------------
  const root = document.createElement('div');
  root.id = 'promptdrawer-root';
  const shadow = root.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `<style>
    :host{all:initial}
    *{box-sizing:border-box;font:13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1b1f23}
    .bar{position:fixed;right:18px;bottom:92px;display:flex;gap:4px;padding:4px;border-radius:999px;background:#fff;border:1px solid #d9dee5;box-shadow:0 6px 20px rgba(16,24,40,.14);pointer-events:auto}
    .bar button{border:0;background:transparent;border-radius:999px;padding:6px 10px;cursor:pointer;font-weight:600;color:#30363d;display:flex;align-items:center;gap:6px}
    .bar button:hover{background:#eef2f7}.bar .logo{background:#4f46e5;color:#fff;width:28px;height:28px;padding:0;justify-content:center;font-weight:800}
    .bar[hidden]{display:none}
    [hidden]{display:none!important}
    #pd-toggle-wrap{display:flex;align-items:center;gap:6px;margin:8px 0 0;font-weight:500}#pd-toggle-wrap input{width:auto;margin:0}
    #pd-out{min-height:200px}
    .tip{position:fixed;right:18px;bottom:140px;max-width:280px;background:#1b1f23;color:#fff;padding:10px 12px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.3);pointer-events:auto;font-size:13px;line-height:1.4}
    .tip strong,.tip b{color:#fff}.tip:after{content:'';position:absolute;right:28px;bottom:-7px;border:7px solid transparent;border-bottom:0;border-top-color:#1b1f23}
    .tip button{margin-top:8px;border:0;background:#fff;color:#1b1f23;border-radius:7px;padding:4px 10px;font-weight:700;cursor:pointer;display:block}
    .tip[hidden]{display:none}
    .toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1b1f23;color:#fff;padding:10px 14px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.25);display:flex;gap:12px;align-items:center;pointer-events:auto;max-width:min(560px,90vw)}
    .toast button{border:0;background:#fff;color:#1b1f23;border-radius:7px;padding:5px 10px;font-weight:700;cursor:pointer}
    .toast span{color:#fff}
    .scrim{position:fixed;inset:0;background:rgba(16,24,40,.35);display:flex;align-items:center;justify-content:center;pointer-events:auto;padding:16px}
    .card{background:#fff;border-radius:14px;width:min(620px,100%);max-height:88vh;overflow:auto;padding:18px;box-shadow:0 20px 60px rgba(0,0,0,.3)}
    .card h2{margin:0 0 10px;font-size:16px;font-weight:700;display:flex;justify-content:space-between;align-items:center}
    .card h2 small{font-weight:500;color:#6b7280;font-size:12px}
    label{display:block;font-weight:600;font-size:12px;margin:10px 0 4px;color:#374151}
    input,textarea,select{width:100%;border:1px solid #d1d5db;border-radius:8px;padding:8px 10px;background:#fff;font:inherit}
    textarea{min-height:120px;resize:vertical;white-space:pre-wrap}
    textarea.short{min-height:44px;padding:6px 10px}.brief label{margin:8px 0 3px}
    .actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px}
    .btn{border:1px solid #d1d5db;background:#fff;border-radius:8px;padding:8px 12px;font-weight:600;cursor:pointer}
    .btn:hover{background:#f3f4f6}.btn.primary{background:#4f46e5;border-color:#4f46e5;color:#fff}.btn.primary:hover{background:#4338ca}
    .btn:disabled{opacity:.6;cursor:wait}
    .diff{border:1px solid #e5e7eb;border-radius:8px;padding:10px;white-space:pre-wrap;background:#fafafa;max-height:40vh;overflow:auto;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
    .diff ins{background:#dcfce7;text-decoration:none}.diff del{background:#fee2e2;text-decoration:line-through;color:#991b1b}
    .muted{color:#6b7280;font-size:12px;margin:6px 0 0}
    .row{display:flex;gap:8px;align-items:end}.row>*{flex:1}
    .seg{display:flex;gap:4px;flex-wrap:wrap;margin:8px 0}
    .seg button{border:1px solid #d1d5db;background:#fff;border-radius:999px;padding:4px 10px;cursor:pointer;font-size:12px}
    .seg button[aria-pressed="true"]{background:#eef2ff;border-color:#4f46e5;color:#3730a3;font-weight:700}
    .note{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 10px;font-size:12px;margin-top:8px}
    @media (prefers-color-scheme: dark){
      *{color:#e5e7eb}.bar,.card{background:#1f2328;border-color:#3b4149}.bar button{color:#d1d5db}.bar button:hover{background:#2b3139}
      input,textarea,select{background:#15181c;border-color:#3b4149;color:#e5e7eb}label{color:#cbd5e1}
      .btn{background:#2b3139;border-color:#3b4149}.btn:hover{background:#363d47}.diff{background:#15181c;border-color:#3b4149}
      .diff ins{background:#14532d;color:#dcfce7}.diff del{background:#7f1d1d;color:#fecaca}.card h2 small,.muted{color:#9ca3af}
      .seg button{background:#2b3139;border-color:#3b4149}.seg button[aria-pressed="true"]{background:#312e81;color:#e0e7ff}.note{background:#422006;border-color:#92400e}
    }
  </style>
  <div class="bar" id="bar" role="toolbar" aria-label="PromptDrawer">
    <button class="logo" id="open" title="Open PromptDrawer (Alt+D)" aria-label="Open PromptDrawer">P</button>
    <button id="save" title="Save what you are typing (Alt+S)">Save</button>
    <button id="improve" title="Improve what you are typing (Alt+I)">Improve</button>
  </div>
  <div class="tip" id="tip" hidden role="status"><strong>PromptDrawer is on.</strong> Type something in the chat box, then click <b>Improve</b> (or press Alt+I). <button id="tip-ok" aria-label="Got it">Got it</button></div>
  <div id="layer"></div>`;
  (document.body || document.documentElement).append(root);
  const $ = (sel) => shadow.querySelector(sel);
  const layer = $('#layer');

  let toastTimer;
  function toast(text, { action, onAction, ms = 5000 } = {}) {
    clearToast();
    const box = document.createElement('div'); box.className = 'toast'; box.setAttribute('role', 'status');
    const span = document.createElement('span'); span.textContent = text; box.append(span);
    if (action) { const b = document.createElement('button'); b.textContent = action; b.addEventListener('click', () => { clearToast(); onAction?.(); }); box.append(b); }
    layer.append(box);
    toastTimer = setTimeout(clearToast, ms);
    function clearToast() { clearTimeout(toastTimer); shadow.querySelectorAll('.toast').forEach(t => t.remove()); }
  }

  function dialog(title, build) {
    closeDialog();
    const scrim = document.createElement('div'); scrim.className = 'scrim'; scrim.dataset.dialog = '1';
    const card = document.createElement('div'); card.className = 'card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-label', title);
    const h = document.createElement('h2'); h.textContent = title; const small = document.createElement('small'); small.textContent = 'PromptDrawer · ' + adapter.name; h.append(small);
    card.append(h); scrim.append(card); layer.append(scrim);
    scrim.addEventListener('click', e => { if (e.target === scrim) closeDialog(); });
    card.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closeDialog(); } });
    build(card);
    const first = card.querySelector('input, textarea, select, button'); first?.focus();
    return card;
  }
  function closeDialog() { const had = shadow.querySelector('[data-dialog]'); shadow.querySelectorAll('[data-dialog]').forEach(d => d.remove()); if (had) { try { findComposer()?.focus(); } catch { /* ignore */ } } }

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) { if (k === 'text') node.textContent = v; else if (k.startsWith('on')) node.addEventListener(k.slice(2), v); else if (k === 'class') node.className = v; else node.setAttribute(k, v); }
    for (const child of children) node.append(child);
    return node;
  }

  // --- Save ----------------------------------------------------------------
  async function openSave(prefill) {
    const body = (prefill ?? (window.getSelection()?.toString().trim() || readComposer())).trim();
    if (!body) { toast('Type or select something first, then press Save.'); return; }
    const stored = await chrome.storage.local.get({ prompts: [] }).catch(() => ({ prompts: [] }));
    const folders = [...new Set((stored.prompts || []).map(p => p.folder).filter(Boolean))];
    dialog('Save prompt', card => {
      const title = el('input', { id: 'pd-title', maxlength: '120', placeholder: 'Give it a short name' });
      title.value = guessTitle(body);
      const folder = el('input', { id: 'pd-folder', list: 'pd-folders', placeholder: 'Inbox' });
      const list = el('datalist', { id: 'pd-folders' }); for (const f of folders) list.append(el('option', { value: f }));
      const tags = el('input', { id: 'pd-tags', placeholder: 'comma, separated, tags' });
      const text = el('textarea', { id: 'pd-body' }); text.value = body;
      const save = el('button', { class: 'btn primary', text: 'Save' });
      const cancel = el('button', { class: 'btn', text: 'Cancel', onclick: closeDialog });
      card.append(
        el('label', { for: 'pd-title', text: 'Name' }), title,
        el('div', { class: 'row' }, [el('div', {}, [el('label', { for: 'pd-folder', text: 'Folder' }), folder, list]), el('div', {}, [el('label', { for: 'pd-tags', text: 'Tags' }), tags])]),
        el('label', { for: 'pd-body', text: 'Prompt' }), text,
        el('p', { class: 'muted', text: 'Tip: write {{name}} for a blank you fill in each time. Saved on this device only.' }),
        el('div', { class: 'actions' }, [cancel, save]),
      );
      const submit = async () => {
        save.disabled = true;
        const result = await send({ type: 'pd:save', title: title.value, body: text.value, folder: folder.value, tags: tags.value.split(',').map(t => t.trim()).filter(Boolean) });
        save.disabled = false;
        if (result?.ok) { closeDialog(); toast('Saved to PromptDrawer.', { action: 'Open drawer', onAction: () => send({ type: 'pd:open-panel' }) }); }
        else toast(result?.error === 'prompt-limit' ? 'Your drawer is full. Delete a few prompts first.' : 'Could not save. Reload this tab and try again.');
      };
      save.addEventListener('click', submit);
      card.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(); });
    });
  }

  function guessTitle(body) {
    const line = body.split('\n').map(l => l.trim()).find(Boolean) || 'Untitled prompt';
    const words = line.replace(/[#*_`>\-]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 8).join(' ');
    return words.length > 60 ? words.slice(0, 57) + '…' : words;
  }

  // --- Improve -------------------------------------------------------------
  const ENGINES = [['local', 'Quick tidy-up'], ['inchat', 'Ask this AI'], ['nano', 'Chrome AI'], ['byok', 'My API key']];
  const ENGINE_HELP = {
    local: 'No AI: lays your request out in the CIDI structure (Context, Instructions, Details, Input). Instant, works offline.',
    inchat: 'Turns your request into a message that asks this AI to write a better prompt for you. Free.',
    nano: "Chrome's small built-in model, on your device. Needs Chrome 138+; the first run downloads it.",
    byok: 'Your own Anthropic / OpenAI / Google key from Settings. Best quality.',
  };
  // Brief mode: four short boxes (job, why, rules, done) for bigger jobs.
  const BRIEF_FIELDS = [
    ['job', 'The job', 'e.g. research competitor pricing'],
    ['why', 'Why', 'e.g. we are setting the price we compete with'],
    ['rules', 'Rules', 'e.g. last 6 months only; Australian market; no guesses'],
    ['done', 'Done looks like', 'e.g. one page, 8 competitors, a table with sources'],
  ];
  const HINT_PROMPT = 'You can edit the result. Nothing changes in the chat box until you press Use this.';
  const HINT_INCHAT = 'This is a message asking the AI to improve your request. Press Use this, then Enter, and copy what the AI replies.';
  const HINT_BRIEF = 'Fill in the four boxes (short is fine), then press Write the prompt. Only the job is required.';
  async function openImprove(prefill, startMode) {
    const rough = (prefill ?? readComposer()).trim();
    const settings = (await chrome.storage.local.get({ settings: {} }).catch(() => ({ settings: {} }))).settings || {};
    let engine = settings.engine || 'local';
    // Nothing typed yet? Open straight on the Brief side, so there is still something useful to do.
    let mode = startMode || (rough ? (settings.improveMode === 'brief' ? 'brief' : 'prompt') : 'brief');
    let current = null;
    let gen = 0; // each run() gets a number; a reply from an older run is ignored
    const card = dialog('Improve prompt', card => {
      const modeSeg = el('div', { class: 'seg', id: 'pd-modes', role: 'group', 'aria-label': 'Prompt or brief' });
      for (const [id, label, title] of [['prompt', 'Prompt', 'One rough line, tidied into a clear prompt'], ['brief', 'Brief', 'Bigger job: the job, why, rules and what done looks like']]) {
        modeSeg.append(el('button', { text: label, title, 'aria-pressed': String(id === mode), 'data-mode': id, onclick: () => setMode(id) }));
      }
      const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'How to improve it' });
      for (const [id, label] of ENGINES) seg.append(el('button', { text: label, 'aria-pressed': String(id === engine), 'data-engine': id, onclick: () => { engine = id; seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.engine === id))); help.textContent = ENGINE_HELP[id]; if (mode === 'prompt' || current) run(); } }));
      const help = el('p', { class: 'muted', id: 'pd-engine-help', text: ENGINE_HELP[engine] });
      const brief = el('div', { class: 'brief', id: 'pd-brief', hidden: '' });
      for (const [key, label, placeholder] of BRIEF_FIELDS) {
        const field = el('textarea', { id: 'pd-' + key, class: 'short', placeholder, rows: '2', 'aria-label': label });
        if (key === 'job') field.value = rough;
        brief.append(el('label', { for: 'pd-' + key, text: label }), field);
      }
      const briefGo = el('button', { class: 'btn primary', id: 'pd-brief-go', text: 'Write the prompt', onclick: () => run() });
      brief.append(el('div', { class: 'actions', style: 'margin-top:8px;justify-content:flex-start' }, [briefGo]));
      const out = el('textarea', { id: 'pd-out', 'aria-label': 'Improved prompt', spellcheck: 'true' });
      const diff = el('div', { class: 'diff', id: 'pd-diff', 'aria-live': 'polite', hidden: '' });
      const toggle = el('label', { class: 'muted', id: 'pd-toggle-wrap' }, [el('input', { type: 'checkbox', id: 'pd-toggle', onchange: (e) => { diff.hidden = !e.target.checked; out.hidden = e.target.checked; } }), document.createTextNode(' Show what changed')]);
      const note = el('div', { class: 'note', id: 'pd-note', hidden: '' });
      const use = el('button', { class: 'btn primary', id: 'pd-use', text: 'Use this', disabled: '' });
      const save = el('button', { class: 'btn', id: 'pd-save-improved', text: 'Save to drawer', disabled: '', onclick: async () => { const r = await send({ type: 'pd:save', body: out.value, folder: 'Inbox' }); toast(r?.ok ? 'Saved to PromptDrawer.' : 'Could not save.'); } });
      const copy = el('button', { class: 'btn', text: 'Copy', onclick: () => navigator.clipboard?.writeText(out.value).then(() => toast('Copied.')) });
      const cancel = el('button', { class: 'btn', text: 'Cancel', onclick: closeDialog });
      card.append(modeSeg, seg, help, brief, out, diff, toggle, note, el('p', { class: 'muted', id: 'pd-hint', text: HINT_PROMPT }), el('div', { class: 'actions' }, [cancel, copy, save, use]));
      brief.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run(); } });
      use.addEventListener('click', async () => {
        if (!current) return;
        const improved = out.value;
        closeDialog();
        const result = await writeComposer(improved, { replace: true });
        if (!result.ok) { toast('Could not write into the chat box. Copy instead?', { action: 'Copy', onAction: () => navigator.clipboard?.writeText(improved) }); return; }
        let message = current.mode === 'inchat' ? 'Now press Enter. The AI will reply with an improved prompt you can copy or save.' : 'Prompt improved. Press Enter to send it.';
        if (result.guessed) message += ' Wrong chat box? Undo, click in the one you want, then Use this again.';
        toast(message, { action: 'Undo', onAction: () => writeComposer(rough, { replace: true }), ms: 9000 });
      });
    });
    const q = sel => card.querySelector(sel);
    const readBrief = () => Object.fromEntries(BRIEF_FIELDS.map(([key]) => [key, q('#pd-' + key).value]));
    // Switches between the one-line Prompt side and the four-box Brief side. Remembered for next time.
    function setMode(next, { remember = true } = {}) {
      mode = next; gen++; current = null;
      card.querySelectorAll('#pd-modes button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === next)));
      q('#pd-brief').hidden = next !== 'brief';
      q('#pd-toggle-wrap').hidden = next === 'brief';
      q('#pd-toggle').checked = false; q('#pd-diff').hidden = true; q('#pd-out').hidden = false; q('#pd-note').hidden = true;
      q('#pd-use').disabled = true; q('#pd-save-improved').disabled = true;
      if (remember) patchSettings({ improveMode: next }); // only a click on Prompt/Brief is remembered; an empty chat box opening on Brief is not a choice
      if (next === 'brief') { q('#pd-out').value = ''; q('#pd-out').placeholder = 'Your long, detailed prompt appears here.'; q('#pd-hint').textContent = HINT_BRIEF; (q('#pd-job').value ? q('#pd-why') : q('#pd-job')).focus(); }
      else if (rough) { q('#pd-hint').textContent = HINT_PROMPT; run(); }
      else { q('#pd-out').value = ''; q('#pd-out').placeholder = 'Type something in the chat box first, or switch to Brief.'; q('#pd-hint').textContent = 'Nothing is typed in the chat box yet. Close this, type a rough request, then press Improve again.'; }
    }
    const run = async () => {
      const out = q('#pd-out'), diff = q('#pd-diff'), note = q('#pd-note'), use = q('#pd-use'), save = q('#pd-save-improved'), toggle = q('#pd-toggle');
      const payload = mode === 'brief' ? { type: 'pd:improve', brief: readBrief(), engine } : { type: 'pd:improve', text: rough, engine };
      if (mode === 'brief' && !payload.brief.job.trim()) { q('#pd-hint').textContent = 'Say what the job is first (one line is enough).'; q('#pd-job').focus(); return; }
      out.value = 'Improving…'; use.disabled = true; save.disabled = true; note.hidden = true; current = null;
      const my = ++gen;
      const result = await send(payload);
      if (my !== gen || !card.isConnected) return; // a newer engine or mode was picked (or the dialog closed) while this ran
      if (!result?.ok) { out.value = 'Something went wrong: ' + (result?.error || 'no response') + '. Reload this tab and try again.'; return; }
      current = result;
      out.value = result.improved;
      diff.replaceChildren();
      for (const part of result.diff || [{ type: 'same', text: result.improved }]) {
        const node = part.type === 'add' ? document.createElement('ins') : part.type === 'del' ? document.createElement('del') : document.createElement('span');
        node.textContent = part.text; diff.append(node);
      }
      q('#pd-toggle-wrap').hidden = result.mode === 'inchat' || mode === 'brief';
      if (result.mode === 'inchat' || mode === 'brief') { toggle.checked = false; diff.hidden = true; out.hidden = false; }
      q('#pd-hint').textContent = result.mode === 'inchat' ? HINT_INCHAT : mode === 'brief' ? 'Your brief, written out as a full prompt. Edit anything, then press Use this.' : HINT_PROMPT;
      if (result.note) { note.textContent = result.note; note.hidden = false; }
      const pressed = q('.seg button[aria-pressed="true"][data-engine]');
      if (pressed && pressed.dataset.engine !== result.engine) { card.querySelectorAll('.seg button[data-engine]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.engine === result.engine))); q('#pd-engine-help').textContent = ENGINE_HELP[result.engine]; }
      use.disabled = false; save.disabled = false; use.focus();
    };
    setMode(mode, { remember: false });
    markTipSeen();
  }

  // --- Messaging -----------------------------------------------------------
  async function send(message) {
    try { return await chrome.runtime.sendMessage(message); }
    catch { return { ok: false, error: 'extension-reloaded' }; }
  }

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || !message?.type) return false;
    switch (message.type) {
      case 'pd:command':
        if (message.command === 'save') openSave(message.text); else if (message.command === 'improve') openImprove(message.text);
        respond({ ok: true }); return false;
      case 'pd:get-text': respond({ ok: true, text: readComposer() }); return false;
      case 'pd:toast': toast(String(message.text || '')); respond({ ok: true }); return false;
      case 'pd:insert':
        (async () => {
          const result = await writeComposer(String(message.text || ''), { replace: message.replace !== false });
          if (result.ok && message.send) await pressSend();
          else if (result.ok) toast(result.guessed ? 'Inserted from PromptDrawer. Wrong chat box? Click in the one you want, then insert again.' : 'Inserted from PromptDrawer.');
          respond(result);
        })();
        return true;
      default: return false;
    }
  });

  $('#save').addEventListener('click', () => openSave());
  $('#improve').addEventListener('click', () => openImprove());
  $('#open').addEventListener('click', async () => { const r = await send({ type: 'pd:open-panel' }); if (!r?.ok) toast('Click the PromptDrawer icon in your toolbar, or press Alt+D.'); });

  // Keyboard fallback for when Chrome's command shortcuts are not bound.
  document.addEventListener('keydown', event => {
    if (!event.isTrusted || !event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
    // On macOS Option+letter puts a symbol in event.key ("ß", "ˆ", "∂"), so match the physical key first.
    const key = ({ KeyS: 's', KeyI: 'i', KeyD: 'd' })[event.code] || String(event.key || '').toLowerCase();
    if (!['s', 'i', 'd'].includes(key)) return;
    const target = event.composedPath()[0];
    if (!editable(target)) return;
    event.preventDefault();
    if (key === 's') openSave(); else if (key === 'i') openImprove(); else send({ type: 'pd:open-panel' });
  }, true);

  // Settings patches from this page go through one queue, so two read-modify-writes (say tipSeen and improveMode on the first Improve) cannot overwrite each other.
  let settingsWrite = Promise.resolve();
  function patchSettings(patch) {
    settingsWrite = settingsWrite.then(async () => {
      const { settings } = await chrome.storage.local.get({ settings: {} });
      const current = settings || {};
      if (Object.keys(patch).every(k => current[k] === patch[k])) return;
      await chrome.storage.local.set({ settings: { ...current, ...patch } });
    }).catch(() => { /* ignore */ });
    return settingsWrite;
  }
  // First-run tip next to the pill, until Improve has been used once (or dismissed).
  async function markTipSeen() {
    $('#tip').hidden = true;
    await patchSettings({ tipSeen: true });
  }
  $('#tip-ok').addEventListener('click', markTipSeen);
  // Toolbar visibility follows the setting.
  const applyToolbarSettings = (settings) => {
    const hideBar = settings?.showToolbar === false;
    $('#bar').hidden = hideBar;
    $('#tip').hidden = hideBar || Boolean(settings?.tipSeen);
  };
  chrome.storage.local.get({ settings: {} }).then(({ settings }) => applyToolbarSettings(settings)).catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) applyToolbarSettings(changes.settings.newValue);
  });
  // Some sites replace <body> during navigation; keep the host attached.
  new MutationObserver(() => { if (!root.isConnected) (document.body || document.documentElement).append(root); }).observe(document.documentElement, { childList: true });
})();
