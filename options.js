import { CHECKOUT_URL, HOMEPAGE, PRO_FEATURES, PRO_PRICE, TEST_MODE_PRO, TRIAL_DAYS } from './config.js';
import { PROVIDER_LIST } from './lib/engines.js';
import { activateLicense, getProStatus, isPro, removeLicense } from './lib/license.js';
import { getByokKeys, getLicense, getSettings, getTrial, setByokKey, setTrial, updateSettings } from './lib/storage.js';

const $ = (sel) => document.querySelector(sel);
const show = (sel, text, tone = '') => { const el = $(sel); el.textContent = text; el.dataset.tone = tone; };
let settings;

async function load() {
  settings = await getSettings();
  const { pro, source, trial } = await getProStatus();
  $('#pro-badge').textContent = source === 'trial' ? `Trial · ${trial.daysLeft} ${trial.daysLeft === 1 ? 'day' : 'days'} left` : pro ? 'Pro' : 'Free';
  $('#pro-list').textContent = Object.values(PRO_FEATURES).join(', ');
  $('#pro-price').textContent = PRO_PRICE; $('#trial-days').textContent = String(TRIAL_DAYS); $('#buy').textContent = `Keep Pro for ${PRO_PRICE}`;
  const ends = trial.endsAt ? new Date(trial.endsAt).toLocaleDateString() : '';
  show('#trial-status', source === 'license' ? '' : source === 'trial' ? `Your free Pro trial has ${trial.daysLeft} ${trial.daysLeft === 1 ? 'day' : 'days'} left (ends ${ends}).` : trial.started ? `Your free Pro trial ended on ${ends}. Keep Pro below, or carry on with the free plan.` : '', source === 'trial' ? 'ok' : '');
  $('#test-mode').hidden = !TEST_MODE_PRO;
  $('#homepage').href = HOMEPAGE;
  $('#showToolbar').checked = settings.showToolbar !== false;
  $('#theme').value = settings.theme;
  $('#aboutMe').value = settings.aboutMe;
  $('#aboutMeAuto').checked = Boolean(settings.aboutMeAuto);
  $('#projectOnInsert').checked = Boolean(settings.projectOnInsert);
  $('#engine').value = settings.engine;
  $('#byokProvider').value = settings.byokProvider;
  $('#byokModel').value = settings.byokModel;
  $('#byokModel').placeholder = PROVIDER_LIST.find(p => p.id === settings.byokProvider)?.defaultModel || '';
  $('#byok').hidden = settings.engine !== 'byok';
  const keys = await getByokKeys();
  $('#byokKey').placeholder = keys[settings.byokProvider] ? 'A key is saved (hidden). Paste a new one to replace it.' : 'Paste a key from your provider';
  const license = await getLicense();
  $('#licenseKey').value = license.key ? license.key.slice(0, 4) + '…' + license.key.slice(-4) : '';
  if (license.status === 'active') show('#license-result', 'Pro is active on this device.', 'ok');
  else if (license.status === 'invalid') show('#license-result', 'This key is no longer valid. Contact support if that is a surprise.', 'error');
  applyTheme();
  if (settings.engine === 'nano') checkNano();
}
function applyTheme() { if (settings.theme === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = settings.theme; }

async function save(patch) { settings = await updateSettings(patch); applyTheme(); }

$('#showToolbar').addEventListener('change', e => save({ showToolbar: e.target.checked }));
$('#theme').addEventListener('change', e => save({ theme: e.target.value }));
$('#projectOnInsert').addEventListener('change', e => save({ projectOnInsert: e.target.checked }));
$('#aboutMe').addEventListener('input', debounce(e => save({ aboutMe: e.target.value.slice(0, 2000) }), 400));
$('#aboutMeAuto').addEventListener('change', async e => {
  if (e.target.checked && !(await isPro())) { e.target.checked = false; return alert('Auto-adding About me is a Pro feature. You can still write {{about_me}} inside any prompt for free.'); }
  save({ aboutMeAuto: e.target.checked });
});
$('#engine').addEventListener('change', async e => {
  const engine = e.target.value;
  if ((engine === 'nano' || engine === 'byok') && !(await isPro())) { e.target.value = settings.engine; return alert('AI engines are a Pro feature. The instant Structure engine and "Ask this AI" are free.'); }
  await save({ engine }); $('#byok').hidden = engine !== 'byok'; show('#nano-status', '');
  if (engine === 'nano') checkNano();
});
async function checkNano() {
  const r = await chrome.runtime.sendMessage({ type: 'pd:nano-availability' }).catch(() => null);
  const a = r?.availability;
  show('#nano-status', a === 'available' ? 'Chrome built-in AI is ready on this device.' : a === 'downloadable' || a === 'downloading' ? 'Chrome can download its on-device model. The first Improve may take a minute.' : 'Chrome built-in AI is not available on this device or Chrome version. Improve will fall back to the instant Structure engine.', a === 'available' ? 'ok' : a === 'unavailable' ? 'error' : '');
}
$('#byokProvider').addEventListener('change', async e => { await save({ byokProvider: e.target.value }); load(); });
$('#byokModel').addEventListener('input', debounce(e => save({ byokModel: e.target.value.trim().slice(0, 80) }), 400));
$('#byokSave').addEventListener('click', async () => {
  const key = $('#byokKey').value.trim();
  if (!key) return show('#byok-result', 'Paste a key first.', 'error');
  const provider = PROVIDER_LIST.find(p => p.id === settings.byokProvider);
  const granted = await chrome.permissions.request({ origins: [provider.origin] }).catch(() => false);
  if (!granted) return show('#byok-result', 'Permission was not granted, so the key was not saved.', 'error');
  await setByokKey(settings.byokProvider, key); $('#byokKey').value = '';
  show('#byok-result', 'Key saved on this device.', 'ok'); load();
});
$('#byokRemove').addEventListener('click', async () => {
  const provider = PROVIDER_LIST.find(p => p.id === settings.byokProvider);
  await setByokKey(settings.byokProvider, ''); await chrome.permissions.remove({ origins: [provider.origin] }).catch(() => {});
  show('#byok-result', 'Key removed.', 'ok'); load();
});
$('#licenseActivate').addEventListener('click', async () => {
  const key = $('#licenseKey').value.trim();
  if (!key || key.includes('…')) return show('#license-result', 'Paste the full key from your receipt.', 'error');
  const granted = await chrome.permissions.request({ origins: ['https://api.lemonsqueezy.com/*'] }).catch(() => false);
  if (!granted) return show('#license-result', 'Permission to contact the licence server was not granted.', 'error');
  try { await activateLicense(key); show('#license-result', 'Pro is active on this device. Thank you!', 'ok'); load(); }
  catch (error) { show('#license-result', String(error.message).startsWith('license-format') ? 'That does not look like a licence key.' : 'Could not activate: ' + error.message, 'error'); }
});
$('#licenseRemove').addEventListener('click', async () => { await removeLicense(); show('#license-result', 'Licence removed from this device.'); load(); });
$('#buy').addEventListener('click', () => chrome.tabs.create({ url: CHECKOUT_URL }));
$('#wipe').addEventListener('click', async () => {
  if (!confirm('Delete every prompt, setting and key stored by PromptDrawer on this device? Export first if you want a copy. This cannot be undone.')) return;
  const trial = await getTrial(); // deleting your data is not a way to restart the trial
  await chrome.storage.local.clear(); if (trial.startedAt) await setTrial(trial);
  show('#wipe-result', 'Everything was deleted.', 'ok'); load();
});
function debounce(fn, ms) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; }
load();
