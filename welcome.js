import { ENGINE_HELP } from './lib/improver.js';
import { savePrompt } from './lib/storage.js';

const $ = (sel) => document.querySelector(sel);
const send = async (message) => { try { return await chrome.runtime.sendMessage(message); } catch (error) { return { ok: false, error: String(error?.message || error) }; } };
const status = (text, tone = '') => { const s = $('#try-status'); s.textContent = text; s.dataset.tone = tone; };
const help = () => { $('#try-help').textContent = ENGINE_HELP[$('#try-engine').value] || ''; };
$('#try-engine').addEventListener('change', help); help();

async function run() {
  const rough = $('#try-in').value.trim();
  if (!rough) return status('Type a rough request first.', 'error');
  const go = $('#try-go'); go.disabled = true; go.textContent = 'Improving…';
  const result = await send({ type: 'pd:improve', text: rough, engine: $('#try-engine').value });
  go.disabled = false; go.textContent = 'Improve';
  if (!result?.ok) return status('Could not improve: ' + (result?.error || 'no response'), 'error');
  $('#try-result').hidden = false;
  $('#try-out').value = result.improved;
  const note = $('#try-note'); note.hidden = !result.note; note.textContent = result.note || '';
  if ($('#try-engine').value !== result.engine && [...$('#try-engine').options].some(o => o.value === result.engine)) { $('#try-engine').value = result.engine; help(); }
  status('');
}
$('#try-go').addEventListener('click', run);
$('#try-in').addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') run(); });
$('#try-copy').addEventListener('click', async () => { await navigator.clipboard.writeText($('#try-out').value); status('Copied. Paste it into any AI chat.', 'ok'); });
$('#try-save').addEventListener('click', async () => {
  try { await savePrompt({ body: $('#try-out').value.trim(), folder: 'Inbox', source: 'welcome' }); status('Saved. Open the drawer to see it under My prompts.', 'ok'); }
  catch (error) { status('Could not save: ' + error.message, 'error'); }
});
$('#try-chatgpt').addEventListener('click', () => chrome.tabs.create({ url: 'https://chatgpt.com/' }));
$('#open-settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('#open-drawer').addEventListener('click', async () => { const r = await send({ type: 'pd:open-panel' }); if (!r?.ok) status('Click the PromptDrawer icon in your Chrome toolbar (pin it via the puzzle-piece icon).'); });
