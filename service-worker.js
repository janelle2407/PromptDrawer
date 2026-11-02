// PromptDrawer service worker: routes commands, context menus and messages.
// It holds no state of its own; everything is read from chrome.storage.local.
import { PRO_FEATURES } from './config.js';
import { wordDiff } from './lib/diff.js';
import { improveWithByok, improveWithNano, nanoAvailability } from './lib/engines.js';
import { buildContext, buildMetaPrompt, localImprove } from './lib/improver.js';
import { isPro } from './lib/license.js';
import { bumpUse, getActiveProject, getSettings, projectBrief, savePrompt, titleFrom } from './lib/storage.js';
import { LIMITS } from './config.js';

export const SITES = [
  { id: 'chatgpt', name: 'ChatGPT', hosts: ['chatgpt.com'], home: 'https://chatgpt.com/' },
  { id: 'claude', name: 'Claude', hosts: ['claude.ai'], home: 'https://claude.ai/new' },
  { id: 'gemini', name: 'Gemini', hosts: ['gemini.google.com'], home: 'https://gemini.google.com/app' },
  { id: 'perplexity', name: 'Perplexity', hosts: ['www.perplexity.ai'], home: 'https://www.perplexity.ai/' },
  { id: 'copilot', name: 'Copilot', hosts: ['copilot.microsoft.com', 'copilot.com'], home: 'https://copilot.microsoft.com/' },
].map(s => ({ ...s, pattern: `https://${s.hosts[0]}/*`, patterns: s.hosts.map(h => `https://${h}/*`) }));
const ALL_PATTERNS = SITES.flatMap(s => s.patterns);
const siteFor = (url) => { try { const host = new URL(url).hostname; return SITES.find(s => s.hosts.includes(host)) || null; } catch { return null; } };

chrome.runtime.onInstalled.addListener((details) => {
  chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  if (details?.reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') }).catch(() => {});
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'pd-save-selection', title: 'Save selection to PromptDrawer', contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'pd-improve-selection', title: 'Improve selection with PromptDrawer', contexts: ['selection'], documentUrlPatterns: ALL_PATTERNS });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const text = (info.selectionText || '').trim();
  if (!text) return;
  if (info.menuItemId === 'pd-save-selection') {
    try {
      await savePrompt({ body: text, source: siteFor(info.pageUrl)?.name || 'web', folder: 'Inbox' });
      if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'pd:toast', text: 'Saved to PromptDrawer.' }).catch(() => {});
    } catch { /* nothing to show outside a matched tab */ }
  }
  if (info.menuItemId === 'pd-improve-selection' && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'pd:command', command: 'improve', text }).catch(() => {});
  }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'open-drawer') { openPanel(tab); return; }
  const target = tab?.id ? tab : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!target?.id || !siteFor(target.url)) return;
  const map = { 'save-prompt': 'save', 'improve-prompt': 'improve' };
  if (map[command]) chrome.tabs.sendMessage(target.id, { type: 'pd:command', command: map[command] }).catch(() => {});
});

async function openPanel(tab) {
  try {
    if (tab?.windowId != null) await chrome.sidePanel.open({ windowId: tab.windowId });
    else { const current = await chrome.windows.getCurrent(); await chrome.sidePanel.open({ windowId: current.id }); }
    return true;
  } catch { return false; }
}

// --- Message routing ------------------------------------------------------
// Extension pages (side panel, options) may or may not sit in a tab; the URL is what matters.
const fromExtensionPage = (sender) => sender.id === chrome.runtime.id && (sender.url || '').startsWith('chrome-extension://' + chrome.runtime.id + '/');
const fromMatchedTab = (sender) => sender.id === chrome.runtime.id && Boolean(sender.tab) && Boolean(siteFor(sender.url));

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!message || typeof message.type !== 'string') return false;
  const trusted = fromExtensionPage(sender) || fromMatchedTab(sender);
  if (!trusted) return false;
  handle(message, sender).then(respond, error => respond({ ok: false, error: String(error?.message || error) }));
  return true;
});

async function handle(message, sender) {
  switch (message.type) {
    case 'pd:save': {
      const body = typeof message.body === 'string' ? message.body.trim() : '';
      if (!body) return { ok: false, error: 'empty' };
      const prompt = await savePrompt({
        title: message.title, body: body.slice(0, LIMITS.promptBody), folder: message.folder, tags: message.tags,
        source: siteFor(sender.url)?.name || message.source || '',
      });
      return { ok: true, prompt };
    }
    case 'pd:improve': return improve(message.text, message.engine);
    case 'pd:open-panel': return { ok: await openPanel(sender.tab) };
    case 'pd:sites': return { ok: true, sites: SITES.map(({ id, name, home }) => ({ id, name, home })), open: await openSites() };
    case 'pd:insert-active': return insertActive(message);
    case 'pd:get-active-text': return getActiveText();
    case 'pd:ask-all': return askAll(message);
    case 'pd:open-sites': {
      const wanted = SITES.filter(s => (message.sites || []).includes(s.id));
      for (const site of wanted) await chrome.tabs.create({ url: site.home, active: false });
      return { ok: true, opened: wanted.length };
    }
    case 'pd:open-welcome': await chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') }); return { ok: true };
    case 'pd:nano-availability': return { ok: true, availability: await nanoAvailability() };
    case 'pd:used': if (typeof message.id === 'string') await bumpUse(message.id); return { ok: true };
    default: return { ok: false, error: 'unknown-message' };
  }
}

async function improve(text, override) {
  const rough = typeof text === 'string' ? text.trim().slice(0, LIMITS.promptBody) : '';
  if (!rough) return { ok: false, error: 'empty' };
  const settings = await getSettings();
  const pro = await isPro();
  let engine = override || settings.engine;
  if ((engine === 'nano' || engine === 'byok') && !pro) engine = 'local';
  const aboutMe = settings.aboutMeAuto && pro ? settings.aboutMe : '';
  const activeProject = await getActiveProject();
  const project = projectBrief(activeProject);
  const usedProject = activeProject ? activeProject.name : '';
  if (engine === 'inchat') return { ok: true, engine, mode: 'inchat', improved: buildMetaPrompt(rough, buildContext({ aboutMe, project })), usedProject };
  let improved, note = '';
  try {
    if (engine === 'nano') improved = await improveWithNano(rough, buildContext({ aboutMe, project }));
    else if (engine === 'byok') improved = await improveWithByok(rough, buildContext({ aboutMe, project }));
  } catch (error) {
    note = friendlyEngineError(error);
    engine = 'local';
  }
  if (!improved) improved = localImprove(rough, { aboutMe, project });
  return { ok: true, engine, mode: 'replace', improved, diff: wordDiff(rough, improved), note, usedProject };
}

function friendlyEngineError(error) {
  const text = String(error?.message || error);
  if (text.includes('nano-unavailable')) return 'Chrome built-in AI is not available on this device yet, so the instant structure engine was used instead.';
  if (text.includes('byok-missing-key')) return 'No API key saved for your provider, so the instant structure engine was used instead.';
  if (text.includes('byok-permission')) return 'Permission for your API provider was not granted, so the instant structure engine was used instead.';
  if (text.includes('byok-http')) return 'Your API provider returned an error (' + text.replace('byok-http-', '') + '), so the instant structure engine was used instead.';
  return 'The AI engine failed, so the instant structure engine was used instead.';
}

async function openSites() {
  const tabs = await chrome.tabs.query({ url: ALL_PATTERNS });
  return tabs.map(tab => ({ tabId: tab.id, windowId: tab.windowId, site: siteFor(tab.url)?.id, title: tab.title }));
}

async function activeAiTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || !siteFor(tab.url)) return null;
  return tab;
}

async function insertActive(message) {
  const tab = await activeAiTab();
  if (!tab) return { ok: false, error: 'not-ai-tab' };
  try {
    const result = await chrome.tabs.sendMessage(tab.id, { type: 'pd:insert', text: String(message.text || ''), send: Boolean(message.send), replace: message.replace !== false });
    return { ok: Boolean(result?.ok), error: result?.error, site: siteFor(tab.url)?.name };
  } catch { return { ok: false, error: 'reload-tab', site: siteFor(tab.url)?.name }; }
}

async function getActiveText() {
  const tab = await activeAiTab();
  if (!tab) return { ok: false, error: 'not-ai-tab' };
  try {
    const result = await chrome.tabs.sendMessage(tab.id, { type: 'pd:get-text' });
    return { ok: true, text: result?.text || '', site: siteFor(tab.url)?.name };
  } catch { return { ok: false, error: 'reload-tab' }; }
}

async function askAll(message) {
  if (!(await isPro())) return { ok: false, error: 'pro', feature: PRO_FEATURES.askAll };
  const text = String(message.text || '').trim();
  if (!text) return { ok: false, error: 'empty' };
  const wanted = Array.isArray(message.sites) && message.sites.length ? message.sites : SITES.map(s => s.id);
  const tabs = await chrome.tabs.query({ url: ALL_PATTERNS });
  const delivered = [], seen = new Set();
  for (const tab of tabs) {
    const site = siteFor(tab.url);
    if (!site || !wanted.includes(site.id) || seen.has(site.id)) continue;
    seen.add(site.id);
    try {
      const result = await chrome.tabs.sendMessage(tab.id, { type: 'pd:insert', text, send: Boolean(message.send), replace: true });
      delivered.push({ site: site.id, name: site.name, ok: Boolean(result?.ok), error: result?.error || '' });
    } catch { delivered.push({ site: site.id, name: site.name, ok: false, error: 'reload-tab' }); }
  }
  const missing = SITES.filter(s => wanted.includes(s.id) && !seen.has(s.id)).map(s => ({ site: s.id, name: s.name }));
  return { ok: true, delivered, missing };
}

export { titleFrom };
