// PromptDrawer side panel: the library.
import { CHECKOUT_URL, FREE_LIMITS, LIMITS, PRO_FEATURES, PRO_PRICE, TRIAL_DAYS } from './config.js';
import { getProStatus } from './lib/license.js';
import { STARTER_PACKS } from './lib/packs.js';
import { SPECIAL_VARIABLES, deletePrompt, deleteProject, fillVariables, findVariables, getProjects, getPrompts, getSettings, importProjects, importPrompts, projectBrief, savePrompt, saveProject, toMarkdown, uid, updateSettings } from './lib/storage.js';
import { ENGINE_HELP } from './lib/improver.js';

const $ = (sel) => document.querySelector(sel);
const state = { prompts: [], projects: [], settings: {}, pro: false, proStatus: null, folder: 'all', query: '', editing: null, editingProject: null, tab: 'improve', improved: null };
const activeProject = () => state.projects.find(p => p.id === state.settings.activeProject) || null;

const report = (text, tone = '') => { const s = $('#status'); s.textContent = text; s.dataset.tone = tone; if (text) setTimeout(() => { if (s.textContent === text) { s.textContent = ''; s.dataset.tone = ''; } }, 6000); };
const applyTheme = () => { if (state.settings.theme === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = state.settings.theme; };
const send = async (message) => { try { return await chrome.runtime.sendMessage(message); } catch (error) { return { ok: false, error: String(error?.message || error) }; } };
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function load() {
  [state.prompts, state.projects, state.settings, state.proStatus] = await Promise.all([getPrompts(), getProjects(), getSettings(), getProStatus()]);
  state.pro = state.proStatus.pro;
  applyTheme();
  renderProjectBar();
  renderProBadge();
  if (!state.loaded) {
    state.loaded = true;
    let tab = 'improve'; try { tab = localStorage.getItem('pd-tab') || 'improve'; } catch { /* ignore */ }
    showTab(['improve', 'library', 'help'].includes(tab) ? tab : 'improve');
    $('#imp-engine').value = state.settings.engine || 'local'; engineHelp();
    if ((state.settings.improveMode === 'brief' ? 'brief' : 'prompt') !== (state.improveMode || 'prompt')) setImproveMode(state.settings.improveMode === 'brief' ? 'brief' : 'prompt', { remember: false });
    const params = new URLSearchParams(location.search);
    if (params.get('tab')) showTab(params.get('tab'));
  }
  render();
}

function folders() { return [...new Set(state.prompts.map(p => p.folder))].sort((a, b) => a.localeCompare(b)); }

function visiblePrompts() {
  const q = state.query.trim().toLowerCase();
  return state.prompts
    .filter(p => state.folder === 'all' || (state.folder === 'fav' ? p.favorite : p.folder === state.folder))
    .filter(p => !q || [p.title, p.body, p.folder, ...p.tags].join(' ').toLowerCase().includes(q))
    .sort((a, b) => (b.favorite - a.favorite) || b.updatedAt.localeCompare(a.updatedAt));
}

function render() {
  const chips = $('#folders'); chips.replaceChildren();
  const addChip = (id, label) => { const b = document.createElement('button'); b.type = 'button'; b.role = 'tab'; b.textContent = label; b.setAttribute('aria-selected', String(state.folder === id)); b.addEventListener('click', () => { state.folder = id; render(); }); chips.append(b); };
  addChip('all', 'All'); addChip('fav', '★');
  for (const f of folders()) addChip(f, f);
  const list = $('#list'); list.replaceChildren();
  const visible = visiblePrompts();
  $('#empty').hidden = state.prompts.length > 0;
  $('#count').textContent = state.prompts.length ? `${state.prompts.length} prompt${state.prompts.length === 1 ? '' : 's'}` : '';
  if (!state.prompts.length) renderPacks();
  if (state.prompts.length && !visible.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Nothing matches. Try another search.'; list.append(li); }
  for (const p of visible) list.append(card(p));
  const datalist = $('#folder-list'); datalist.replaceChildren(); for (const f of folders()) { const o = document.createElement('option'); o.value = f; datalist.append(o); }
}

function card(p) {
  const li = document.createElement('li'); li.className = 'card';
  li.innerHTML = `<div class="head"><p class="title"></p><button class="star" type="button" aria-pressed="${p.favorite}" aria-label="Favourite">★</button></div>
    <p class="snippet"></p>
    <div class="meta-row"><span class="tag folder"></span>${p.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}<span class="uses"></span></div>
    <div class="btns"><button class="primary insert" type="button">Insert</button><button class="copy" type="button">Copy</button><button class="edit" type="button">Edit</button><button class="askall pro" type="button" title="${escapeHtml(PRO_FEATURES.askAll)}">Ask all</button></div>`;
  li.querySelector('.title').textContent = p.title;
  li.querySelector('.snippet').textContent = p.body;
  li.querySelector('.folder').textContent = p.folder;
  li.querySelector('.uses').textContent = p.uses ? `used ${p.uses}×` : '';
  li.querySelector('.star').addEventListener('click', async () => { await savePrompt({ id: p.id, favorite: !p.favorite }); await load(); });
  li.querySelector('.insert').addEventListener('click', () => insertPrompt(p));
  li.querySelector('.copy').addEventListener('click', () => withVariables(p, async text => { await navigator.clipboard.writeText(text); report('Copied.', 'ok'); }));
  li.querySelector('.edit').addEventListener('click', () => openEditor(p));
  li.querySelector('.askall').addEventListener('click', () => withVariables(p, text => askAll(text)));
  return li;
}

function renderPacks() {
  const box = $('#packs'); box.replaceChildren();
  for (const pack of STARTER_PACKS) {
    const b = document.createElement('button'); b.type = 'button';
    b.innerHTML = `${escapeHtml(pack.name)} <small></small>`; b.querySelector('small').textContent = pack.blurb + ` · ${pack.prompts.length} prompts`;
    b.addEventListener('click', () => addPack(pack));
    box.append(b);
  }
}

async function addPack(pack) {
  const list = pack.prompts.map(p => ({ ...p, id: uid(), source: 'starter:' + pack.id }));
  const result = await importPrompts(list);
  report(`Added ${result.added} prompts from "${pack.name}".`, 'ok');
  await load();
}

// --- Variables -------------------------------------------------------------
function withVariables(p, done) {
  const vars = findVariables(p.body).filter(v => !SPECIAL_VARIABLES.includes(v.name));
  const aboutMe = state.settings.aboutMe || '';
  const brief = projectBrief(activeProject());
  const finish = (text) => done(withProjectOnInsert(text, p.body, brief));
  if (!vars.length) return finish(fillVariables(p.body, {}, aboutMe, brief));
  modal('Fill in the blanks', box => {
    const inputs = {};
    for (const v of vars) {
      const label = document.createElement('label'); label.textContent = v.name.replace(/_/g, ' '); label.htmlFor = 'var-' + v.name;
      const input = v.fallback.length > 60 || /\n/.test(v.fallback) ? document.createElement('textarea') : document.createElement('input');
      input.id = 'var-' + v.name; input.placeholder = v.fallback || ''; inputs[v.name] = input;
      box.append(label, input);
    }
    const actions = document.createElement('div'); actions.className = 'actions';
    const cancel = button('Cancel', closeModal); const ok = button('Continue', () => { const values = {}; for (const [k, i] of Object.entries(inputs)) values[k] = i.value; closeModal(); finish(fillVariables(p.body, values, aboutMe, brief)); }, 'primary');
    actions.append(spacer(), cancel, ok); box.append(actions);
    box.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') ok.click(); });
  });
}

// Optional setting: put the project brief in front of every inserted prompt
// that does not already pull it in with {{project}}.
function withProjectOnInsert(text, rawBody, brief) {
  if (!brief || !state.settings.projectOnInsert || /\{\{\s*project\s*(\|[^}]*)?\}\}/.test(rawBody || '')) return text;
  return brief + '\n\n' + text;
}

async function insertPrompt(p) {
  withVariables(p, async text => {
    const result = await send({ type: 'pd:insert-active', text, replace: false });
    if (result?.ok) { report(`Inserted into ${result.site}.`, 'ok'); send({ type: 'pd:used', id: p.id }); }
    else if (result?.error === 'not-ai-tab') { await navigator.clipboard.writeText(text); report('Copied. Switch to an AI chat tab to insert directly.', ''); }
    else if (result?.error === 'reload-tab') report('Reload the chat tab once, then try again.', 'error');
    else { await navigator.clipboard.writeText(text); report('Could not insert, so it was copied instead.', 'error'); }
  });
}

// --- Ask all three ---------------------------------------------------------
async function askAll(presetText) {
  if (!state.pro) return upsell(PRO_FEATURES.askAll);
  let text = presetText;
  if (!text) { const r = await send({ type: 'pd:get-active-text' }); text = r?.ok ? r.text : ''; }
  const sites = await send({ type: 'pd:sites' });
  modal('Ask all three', box => {
    const p = document.createElement('p'); p.textContent = 'Send the same prompt to every open AI tab and compare the answers side by side.'; box.append(p);
    const area = document.createElement('textarea'); area.value = text || ''; area.placeholder = 'Your prompt'; area.setAttribute('aria-label', 'Prompt'); box.append(area);
    const openIds = new Set((sites?.open || []).map(t => t.site));
    const checks = {};
    for (const site of sites?.sites || []) {
      const row = document.createElement('label'); row.className = 'site-row';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = openIds.has(site.id); checks[site.id] = cb;
      const state_ = document.createElement('span'); state_.className = 'state'; state_.textContent = openIds.has(site.id) ? 'open' : 'not open';
      row.append(cb, document.createTextNode(site.name), state_); box.append(row);
    }
    const sendRow = document.createElement('label'); sendRow.className = 'check';
    const sendCb = document.createElement('input'); sendCb.type = 'checkbox'; sendCb.checked = Boolean(state.settings.askAllSend);
    sendRow.append(sendCb, document.createTextNode('Also press send (otherwise it just fills each box)')); box.append(sendRow);
    const actions = document.createElement('div'); actions.className = 'actions';
    const openMissing = button('Open missing tabs', async () => {
      const missing = Object.entries(checks).filter(([id, cb]) => cb.checked && !openIds.has(id)).map(([id]) => id);
      if (!missing.length) return report('All selected sites are already open.');
      await send({ type: 'pd:open-sites', sites: missing }); report(`Opened ${missing.length} tab(s). Wait for them to load, then press Go.`, 'ok');
      for (const id of missing) openIds.add(id);
      box.querySelectorAll('.site-row').forEach((row, i) => { const id = (sites.sites || [])[i]?.id; if (openIds.has(id)) row.querySelector('.state').textContent = 'open'; });
    });
    const go = button('Go', async () => {
      const chosen = Object.entries(checks).filter(([, cb]) => cb.checked).map(([id]) => id);
      go.disabled = true;
      const result = await send({ type: 'pd:ask-all', text: area.value, send: sendCb.checked, sites: chosen });
      go.disabled = false;
      if (!result?.ok) return report(result?.error === 'pro' ? 'Ask all three is a Pro feature.' : 'Nothing sent: ' + (result?.error || 'unknown error'), 'error');
      const ok = result.delivered.filter(d => d.ok).map(d => d.name);
      const failed = result.delivered.filter(d => !d.ok).map(d => d.name + (d.error === 'reload-tab' ? ' (reload that tab)' : ''));
      const missing = result.missing.map(m => m.name);
      closeModal();
      report([ok.length ? 'Sent to ' + ok.join(', ') + '.' : '', failed.length ? 'Failed: ' + failed.join(', ') + '.' : '', missing.length ? 'Not open: ' + missing.join(', ') + '.' : ''].filter(Boolean).join(' '), failed.length ? 'error' : 'ok');
    }, 'primary');
    actions.append(button('Cancel', closeModal), openMissing, spacer(), go); box.append(actions);
  });
}

// Badge under the name plus the one-line trial note under the header.
function renderProBadge() {
  const { source, trial } = state.proStatus;
  const days = trial.daysLeft;
  $('#pro-badge').textContent = source === 'trial' ? `Trial · ${days} ${days === 1 ? 'day' : 'days'} left` : state.pro ? 'Pro' : 'Free';
  const note = $('#trial-note'); note.textContent = ''; note.hidden = true;
  const keep = () => chrome.tabs.create({ url: CHECKOUT_URL });
  if (source === 'trial') {
    note.append(`Every Pro feature is free for ${days} more ${days === 1 ? 'day' : 'days'}. `, button(`Keep Pro for ${PRO_PRICE}`, keep, 'link'));
    note.hidden = false;
  } else if (source === 'none' && trial.started && !state.settings.trialNoteDismissed) {
    note.append(`Your free ${TRIAL_DAYS}-day Pro trial has ended. Everything you saved is still here. `, button(`Keep Pro for ${PRO_PRICE}`, keep, 'link'), ' ', button('Hide', () => updateSettings({ trialNoteDismissed: true }), 'link'));
    note.hidden = false;
  }
}

function upsell(feature) {
  modal('Pro feature', box => {
    const ended = state.proStatus?.trial?.started && !state.proStatus.trial.active;
    const p = document.createElement('p');
    p.textContent = (ended ? `Your free ${TRIAL_DAYS}-day Pro trial has ended. ` : '') + `${feature} is part of PromptDrawer Pro: one-time ${PRO_PRICE}, no subscription, 7-day refund if it is not for you.`;
    box.append(p);
    const actions = document.createElement('div'); actions.className = 'actions';
    actions.append(button('Not now', closeModal), spacer(), button(`Keep Pro for ${PRO_PRICE}`, () => chrome.tabs.create({ url: CHECKOUT_URL }), 'primary'), button('I have a key', () => chrome.runtime.openOptionsPage()));
    box.append(actions);
  });
}

// --- Editor ----------------------------------------------------------------
function openEditor(p) {
  state.editing = p ? { ...p } : { id: null, title: '', folder: state.folder !== 'all' && state.folder !== 'fav' ? state.folder : '', tags: [], body: '', versions: [] };
  $('#editor-title').textContent = p ? 'Edit prompt' : 'New prompt';
  $('#e-title').value = state.editing.title; $('#e-folder').value = state.editing.folder; $('#e-tags').value = state.editing.tags.join(', '); $('#e-body').value = state.editing.body;
  $('#e-delete').hidden = !p;
  const versions = $('#versions'); versions.hidden = !p || !state.editing.versions.length; versions.open = false;
  const vl = $('#version-list'); vl.replaceChildren();
  if (!state.pro && state.editing.versions?.length) { const li = document.createElement('li'); li.className = 'pro-note'; li.textContent = `${PRO_FEATURES.versions} is a Pro feature. Your earlier versions are kept safely; upgrade any time to see them.`; vl.append(li); }
  else for (const v of [...(state.editing.versions || [])].reverse()) {
    const li = document.createElement('li');
    const when = document.createElement('div'); when.className = 'meta'; when.textContent = new Date(v.savedAt).toLocaleString();
    const pre = document.createElement('pre'); pre.textContent = v.body;
    li.append(when, pre, button('Restore this version', () => { $('#e-body').value = v.body; report('Restored into the editor. Press Save to keep it.'); }));
    vl.append(li);
  }
  for (const id of ['improve', 'library', 'help', 'quick', 'project-editor']) $('#' + id).hidden = true;
  $('#editor').hidden = false; $('#e-title').focus();
}
function closeEditor() { state.editing = null; $('#editor').hidden = true; showTab(state.tab); }

$('#e-save').addEventListener('click', async () => {
  const body = $('#e-body').value.trim();
  if (!body) return report('The prompt itself cannot be empty.', 'error');
  try {
    await savePrompt({ id: state.editing.id || undefined, title: $('#e-title').value, folder: $('#e-folder').value, tags: $('#e-tags').value.split(',').map(t => t.trim()).filter(Boolean), body });
    closeEditor(); report('Saved.', 'ok'); await load();
  } catch (error) { report(error.message === 'prompt-limit' ? 'Your drawer is full. Delete a few prompts first.' : 'Could not save: ' + error.message, 'error'); }
});
$('#e-cancel').addEventListener('click', closeEditor);
$('#e-delete').addEventListener('click', async () => {
  if (!state.editing?.id) return;
  modal('Delete this prompt?', box => {
    const p = document.createElement('p'); p.textContent = `"${state.editing.title}" will be removed from this device. There is no undo.`; box.append(p);
    const actions = document.createElement('div'); actions.className = 'actions';
    actions.append(button('Keep it', closeModal), spacer(), button('Delete', async () => { await deletePrompt(state.editing.id); closeModal(); closeEditor(); report('Deleted.'); await load(); }, 'danger'));
    box.append(actions);
  });
});
$('#new').addEventListener('click', () => openEditor(null));
$('#settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('#search').addEventListener('input', e => { state.query = e.target.value; render(); });

// --- Quick actions ---------------------------------------------------------
$('#quick-save').addEventListener('click', async () => {
  const r = await send({ type: 'pd:get-active-text' });
  if (!r?.ok) return report(r?.error === 'not-ai-tab' ? 'Switch to a ChatGPT, Claude, Gemini, Perplexity or Copilot tab first.' : 'Reload the chat tab once, then try again.', 'error');
  if (!r.text.trim()) return report(`Nothing typed in ${r.site} yet.`);
  openEditor(null); $('#e-body').value = r.text; $('#e-title').value = r.text.split('\n').find(Boolean)?.slice(0, 60) || '';
});
// --- Tabs ------------------------------------------------------------------
function showTab(id) {
  state.tab = id;
  try { localStorage.setItem('pd-tab', id); } catch { /* ignore */ }
  for (const t of ['improve', 'library', 'help']) { $('#' + t).hidden = t !== id; $('#tab-' + t).setAttribute('aria-selected', String(t === id)); }
  $('#quick').hidden = id !== 'library';
  $('#editor').hidden = true; $('#project-editor').hidden = true; $('#project-bar').hidden = id === 'help';
}
for (const t of ['improve', 'library', 'help']) $('#tab-' + t).addEventListener('click', () => showTab(t));
$('#help-welcome').addEventListener('click', () => send({ type: 'pd:open-welcome' }));
$('#help-settings').addEventListener('click', () => chrome.runtime.openOptionsPage());

// --- Projects ---------------------------------------------------------------
function renderProjectBar() {
  const select = $('#project-select'); const current = state.settings.activeProject || '';
  select.replaceChildren();
  const none = document.createElement('option'); none.value = ''; none.textContent = state.projects.length ? 'No project' : 'No project yet'; select.append(none);
  for (const p of state.projects) { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; select.append(o); }
  const add = document.createElement('option'); add.value = '__new'; add.textContent = '+ New project…'; select.append(add);
  select.value = state.projects.some(p => p.id === current) ? current : '';
  const active = activeProject();
  $('#project-bar').dataset.active = String(Boolean(active));
  $('#project-brief').hidden = !active; $('#project-edit').hidden = !active;
}
$('#project-select').addEventListener('change', async e => {
  const value = e.target.value;
  if (value === '__new') { e.target.value = state.settings.activeProject || ''; return openProjectEditor(null); }
  await updateSettings({ activeProject: value });
  const p = state.projects.find(x => x.id === value);
  report(p ? `Improve will use "${p.name}" from now on.` : 'No project in use.', 'ok');
});
$('#project-edit').addEventListener('click', () => { const p = activeProject(); if (p) openProjectEditor(p); });
$('#project-brief').addEventListener('click', async () => {
  const brief = projectBrief(activeProject()); if (!brief) return;
  const text = brief + '\n\nPlease keep all of this in mind for the rest of our chat. Reply with "Got it" and one line on what you understood.';
  const result = await send({ type: 'pd:insert-active', text, replace: false });
  if (result?.ok) report(`Project brief put into ${result.site}. Press Enter there to start the chat.`, 'ok');
  else if (result?.error === 'not-ai-tab') { await navigator.clipboard.writeText(text); report('Copied the project brief. Paste it as the first message of a new chat.', ''); }
  else if (result?.error === 'reload-tab') report('Reload the chat tab once, then try again.', 'error');
  else { await navigator.clipboard.writeText(text); report('Could not write into that chat box, so the brief was copied instead.', 'error'); }
});
function openProjectEditor(p) {
  if (!p && !state.pro && state.projects.length >= FREE_LIMITS.projects) return upsell(`${PRO_FEATURES.projects} (the free plan includes ${FREE_LIMITS.projects})`);
  state.editingProject = p ? { ...p } : { id: null, name: '', context: '', instructions: '' };
  $('#project-editor-title').textContent = p ? 'Edit project' : 'New project';
  $('#pj-name').value = state.editingProject.name; $('#pj-context').value = state.editingProject.context; $('#pj-instructions').value = state.editingProject.instructions;
  $('#pj-delete').hidden = !p; projectCount();
  for (const id of ['improve', 'library', 'help', 'quick', 'editor']) $('#' + id).hidden = true;
  $('#project-editor').hidden = false; $('#pj-name').focus();
}
function closeProjectEditor() { state.editingProject = null; $('#project-editor').hidden = true; showTab(state.tab); }
function projectCount() { const n = ($('#pj-context').value.length + $('#pj-instructions').value.length); $('#pj-count').textContent = n ? `${n.toLocaleString()} characters (roughly ${Math.round(n / 4).toLocaleString()} tokens each time it is used)` : ''; }
$('#pj-context').addEventListener('input', projectCount); $('#pj-instructions').addEventListener('input', projectCount);
$('#pj-save').addEventListener('click', async () => {
  const name = $('#pj-name').value.trim(); const context = $('#pj-context').value.trim(); const instructions = $('#pj-instructions').value.trim();
  if (!name) return report('Give the project a name first.', 'error');
  if (!context && !instructions) return report('Add some context or instructions, otherwise there is nothing for the AI to use.', 'error');
  try {
    const saved = await saveProject({ id: state.editingProject.id || undefined, name, context, instructions }, { max: state.pro ? LIMITS.projects : FREE_LIMITS.projects });
    await updateSettings({ activeProject: saved.id });
    closeProjectEditor(); report(`Saved. Improve will use "${saved.name}" from now on.`, 'ok'); await load();
  } catch (error) { report(error.message === 'project-limit' ? 'Project limit reached.' : 'Could not save: ' + error.message, 'error'); }
});
$('#pj-cancel').addEventListener('click', closeProjectEditor);
$('#pj-delete').addEventListener('click', () => {
  if (!state.editingProject?.id) return;
  modal('Delete this project?', box => {
    const p = document.createElement('p'); p.textContent = `"${state.editingProject.name}" will be removed from this device. Saved prompts are not affected.`; box.append(p);
    const actions = document.createElement('div'); actions.className = 'actions';
    actions.append(button('Keep it', closeModal), spacer(), button('Delete', async () => { await deleteProject(state.editingProject.id); closeModal(); closeProjectEditor(); report('Project deleted.'); await load(); }, 'danger'));
    box.append(actions);
  });
});

// --- Improve (inside the drawer, works without any AI tab) ------------------
const engineHelp = () => { $('#imp-help').textContent = ENGINE_HELP[$('#imp-engine').value] || ''; };
$('#imp-engine').addEventListener('change', () => { engineHelp(); if (state.improved) runImprove(); });
async function grabTyping() {
  const r = await send({ type: 'pd:get-active-text' });
  if (!r?.ok) { report(r?.error === 'not-ai-tab' ? 'Switch to a ChatGPT, Claude, Gemini, Perplexity or Copilot tab first (or just type here).' : 'Reload the chat tab once, then try again.', 'error'); return false; }
  if (!r.text.trim()) { report(`Nothing typed in ${r.site} yet. Type here instead.`); return false; }
  $(state.improveMode === 'brief' ? '#imp-job' : '#imp-in').value = r.text; report(`Grabbed what you typed in ${r.site}.`, 'ok'); return true;
}
$('#imp-grab').addEventListener('click', grabTyping);
// Prompt = one rough line. Brief = four short boxes for a bigger job (the job, why, rules, done looks like).
const BRIEF_KEYS = ['job', 'why', 'rules', 'done'];
const readBrief = () => Object.fromEntries(BRIEF_KEYS.map(k => [k, $('#imp-' + k).value]));
function setImproveMode(mode, { remember = true } = {}) {
  state.improveMode = mode; state.improved = null; improveGen++;
  $('#imp-mode-prompt').setAttribute('aria-pressed', String(mode === 'prompt')); $('#imp-mode-brief').setAttribute('aria-pressed', String(mode === 'brief'));
  $('#imp-prompt-fields').hidden = mode === 'brief'; $('#imp-brief-fields').hidden = mode !== 'brief';
  $('#imp-go').textContent = mode === 'brief' ? 'Write the prompt' : 'Improve'; $('#imp-go').disabled = false; // a run in flight is dropped by the improveGen bump above, so hand the button back here
  $('#imp-lead').textContent = mode === 'brief'
    ? 'Bigger job? Answer four quick questions and PromptDrawer writes the long, detailed CIDI prompt for you. Only the job is required.'
    : 'Type a rough request. PromptDrawer turns it into a CIDI prompt (Context, Instructions, Details, Input) the AI can act on well.';
  $('#imp-result').hidden = true;
  if (mode === 'brief' && !$('#imp-job').value.trim() && $('#imp-in').value.trim()) $('#imp-job').value = $('#imp-in').value.trim();
  if (remember && (state.settings.improveMode || 'prompt') !== mode) updateSettings({ improveMode: mode }).catch(() => {});
}
$('#imp-mode-prompt').addEventListener('click', () => setImproveMode('prompt'));
$('#imp-mode-brief').addEventListener('click', () => setImproveMode('brief'));
let improveGen = 0; // each runImprove() gets a number; a reply from an older run is ignored
async function runImprove() {
  const brief = state.improveMode === 'brief';
  const rough = $('#imp-in').value.trim();
  if (brief && !$('#imp-job').value.trim()) { $('#imp-job').focus(); return report('Say what the job is first (one line is enough).', 'error'); }
  if (!brief && !rough) return report('Type a rough request first.', 'error');
  const go = $('#imp-go'); go.disabled = true; go.textContent = brief ? 'Writing…' : 'Improving…';
  const my = ++improveGen;
  const result = await send(brief ? { type: 'pd:improve', brief: readBrief(), engine: $('#imp-engine').value } : { type: 'pd:improve', text: rough, engine: $('#imp-engine').value });
  if (my !== improveGen) return; // the engine or mode changed while this ran; the newer run owns the UI
  go.disabled = false; go.textContent = brief ? 'Write the prompt' : 'Improve';
  if (!result?.ok) return report('Could not improve: ' + (result?.error || 'no response'), 'error');
  state.improved = result;
  $('#imp-result').hidden = false;
  $('#imp-out').value = result.improved;
  const noteText = [result.note || '', result.usedProject ? `Used project "${result.usedProject}".` : ''].filter(Boolean).join(' ');
  const note = $('#imp-note'); note.hidden = !noteText; note.textContent = noteText;
  const diff = $('#imp-diff'); diff.replaceChildren();
  for (const part of result.diff || [{ type: 'same', text: result.improved }]) {
    const node = part.type === 'add' ? document.createElement('ins') : part.type === 'del' ? document.createElement('del') : document.createElement('span');
    node.textContent = part.text; diff.append(node);
  }
  $('#imp-diff-toggle').disabled = result.mode === 'inchat' || result.brief === true;
  if ($('#imp-diff-toggle').disabled) { $('#imp-diff-toggle').checked = false; $('#imp-diff').hidden = true; $('#imp-out').hidden = false; }
  $('#imp-insert').textContent = result.mode === 'inchat' ? 'Put it in the chat box, then press Enter' : 'Put it in the chat box';
  if ($('#imp-engine').value !== result.engine) { $('#imp-engine').value = result.engine; engineHelp(); }
  $('#imp-out').focus();
}
$('#imp-go').addEventListener('click', runImprove);
for (const id of ['#imp-in', '#imp-job', '#imp-why', '#imp-rules', '#imp-done']) $(id).addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') runImprove(); });
$('#imp-diff-toggle').addEventListener('change', e => { $('#imp-diff').hidden = !e.target.checked; $('#imp-out').hidden = e.target.checked; });
$('#imp-copy').addEventListener('click', async () => { await navigator.clipboard.writeText($('#imp-out').value); report('Copied. Paste it into any AI chat.', 'ok'); });
$('#imp-insert').addEventListener('click', async () => {
  const text = $('#imp-out').value.trim(); if (!text) return;
  const result = await send({ type: 'pd:insert-active', text, replace: true });
  if (result?.ok) report(`Put into ${result.site}. ${state.improved?.mode === 'inchat' ? 'Press Enter there and the AI will reply with an improved prompt.' : 'Press Enter there when you are happy with it.'}`, 'ok');
  else if (result?.error === 'not-ai-tab') { await navigator.clipboard.writeText(text); report('No AI chat tab is active, so it was copied. Paste it wherever you like.'); }
  else if (result?.error === 'reload-tab') report('Reload the chat tab once, then try again.', 'error');
  else { await navigator.clipboard.writeText(text); report('Could not write into that chat box, so it was copied instead.', 'error'); }
});
$('#imp-save').addEventListener('click', async () => {
  const body = $('#imp-out').value.trim(); if (!body) return;
  try { await savePrompt({ body, folder: 'Inbox', source: 'improve' }); report('Saved under My prompts.', 'ok'); }
  catch (error) { report('Could not save: ' + error.message, 'error'); }
});

$('#quick-askall').addEventListener('click', () => askAll());

// --- Export / import -------------------------------------------------------
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const stamp = () => new Date().toISOString().slice(0, 10);
$('#export-json').addEventListener('click', () => { download(`promptdrawer-${stamp()}.json`, JSON.stringify({ app: 'PromptDrawer', version: 2, exportedAt: new Date().toISOString(), prompts: state.prompts, projects: state.projects }, null, 2), 'application/json'); report('Exported. API keys are never included.', 'ok'); });
$('#export-md').addEventListener('click', () => { if (!state.pro) return upsell(PRO_FEATURES.markdownExport); download(`promptdrawer-${stamp()}.md`, toMarkdown(state.prompts), 'text/markdown'); });
$('#import').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async e => {
  const file = e.target.files?.[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const list = Array.isArray(data) ? data : data.prompts;
    if (!Array.isArray(list)) throw new Error('not a PromptDrawer export');
    const result = await importPrompts(list);
    const projects = Array.isArray(data.projects) ? await importProjects(data.projects) : { added: 0, updated: 0 };
    report(`Imported ${result.added} new prompts, updated ${result.updated}${projects.added || projects.updated ? `, plus ${projects.added + projects.updated} project(s)` : ''}.`, 'ok'); await load();
  } catch (error) { report('Could not import: ' + error.message, 'error'); }
  e.target.value = '';
});

// --- Modal helpers ---------------------------------------------------------
function modal(title, build) {
  closeModal();
  const scrim = document.createElement('div'); scrim.className = 'modal-scrim';
  const box = document.createElement('div'); box.className = 'modal'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
  const h = document.createElement('h2'); h.textContent = title; box.append(h);
  scrim.append(box); $('#modal-root').append(scrim);
  scrim.addEventListener('click', e => { if (e.target === scrim) closeModal(); });
  box.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  build(box);
  box.querySelector('input, textarea, button')?.focus();
}
function closeModal() { $('#modal-root').replaceChildren(); }
function button(text, onClick, cls = '') { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; if (cls) b.className = cls; b.addEventListener('click', onClick); return b; }
function spacer() { const s = document.createElement('span'); s.className = 'spacer'; return s; }

chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (changes.prompts || changes.projects || changes.settings || changes.license || changes.trial)) load(); });
load();
