// Optional AI engines. Both are off unless the person turns them on.
import { SYSTEM_PROMPT } from './improver.js';
import { getByokKeys, getSettings } from './storage.js';

const PROVIDERS = {
  anthropic: { origin: 'https://api.anthropic.com/*', model: 'claude-haiku-5-5' },
  openai: { origin: 'https://api.openai.com/*', model: 'gpt-4o-mini' },
  gemini: { origin: 'https://generativelanguage.googleapis.com/*', model: 'gemini-2.0-flash' },
};
export const PROVIDER_LIST = Object.entries(PROVIDERS).map(([id, p]) => ({ id, defaultModel: p.model, origin: p.origin }));

export async function nanoAvailability() {
  try {
    if (typeof LanguageModel === 'undefined') return 'unavailable';
    return await LanguageModel.availability();
  } catch { return 'unavailable'; }
}

export async function improveWithNano(rough, aboutMe) {
  const availability = await nanoAvailability();
  if (availability === 'unavailable') throw new Error('nano-unavailable');
  let session;
  try { session = await LanguageModel.create({ initialPrompts: [{ role: 'system', content: SYSTEM_PROMPT }] }); }
  catch (error) { throw new Error('nano-unavailable: ' + (error?.message || error)); }
  try {
    const context = aboutMe ? `\n\nAbout the person asking:\n${aboutMe}` : '';
    const result = await session.prompt(`Rough request:\n${rough}${context}`);
    return (result || '').trim();
  } finally { session.destroy?.(); }
}

export async function improveWithByok(rough, aboutMe) {
  const settings = await getSettings();
  const keys = await getByokKeys();
  const provider = PROVIDERS[settings.byokProvider];
  const key = keys[settings.byokProvider];
  if (!provider || !key) throw new Error('byok-missing-key');
  const granted = await chrome.permissions.contains({ origins: [provider.origin] });
  if (!granted) throw new Error('byok-permission');
  const model = settings.byokModel || provider.model;
  const user = `Rough request:\n${rough}${aboutMe ? `\n\nAbout the person asking:\n${aboutMe}` : ''}`;
  let response, text;
  if (settings.byokProvider === 'anthropic') {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model, max_tokens: 1200, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: user }] }),
    });
    const data = await parse(response);
    text = (data.content || []).map(part => part.text || '').join('');
  } else if (settings.byokProvider === 'openai') {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: user }] }),
    });
    const data = await parse(response);
    text = data.choices?.[0]?.message?.content || '';
  } else {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }, contents: [{ role: 'user', parts: [{ text: user }] }] }),
    });
    const data = await parse(response);
    text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  }
  return stripFence(text.trim());
}

async function parse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('byok-http-' + response.status + (data?.error?.message ? ': ' + data.error.message : ''));
  return data;
}

export function stripFence(text) {
  const match = text.match(/^```[a-z]*\n([\s\S]*?)\n```$/i);
  return match ? match[1].trim() : text;
}
