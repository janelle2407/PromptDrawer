// All data lives in chrome.storage.local on this device. Nothing leaves it
// unless the person exports a file or turns on a bring-your-own-key engine.
import { LIMITS } from '../config.js';

export const DEFAULT_SETTINGS = Object.freeze({
  theme: 'system',
  engine: 'local',            // local | inchat | nano | byok
  improveMode: 'prompt',      // prompt | brief: which side of Improve opens first
  byokProvider: 'anthropic',  // anthropic | openai | gemini
  byokModel: '',
  aboutMe: '',
  aboutMeAuto: false,
  askAllSend: false,
  showToolbar: true,
  onboarded: false,
  activeProject: '',       // id of the project Improve and {{project}} use, '' = none
  projectOnInsert: false,  // also prepend the project brief when inserting a saved prompt
});

const KEYS = { prompts: 'prompts', settings: 'settings', license: 'license', byokKeys: 'byokKeys', projects: 'projects' };

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

export const clampText = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');

export function normalisePrompt(raw = {}) {
  const now = new Date().toISOString();
  const body = clampText(raw.body, LIMITS.promptBody);
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    title: clampText(raw.title, LIMITS.promptTitle).trim() || titleFrom(body),
    body,
    folder: clampText(raw.folder, 60).trim() || 'Inbox',
    tags: Array.isArray(raw.tags) ? raw.tags.map(tag => clampText(tag, 30).trim()).filter(Boolean).slice(0, 12) : [],
    favorite: Boolean(raw.favorite),
    source: clampText(raw.source, 40),
    uses: Number.isFinite(raw.uses) ? raw.uses : 0,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
    versions: Array.isArray(raw.versions)
      ? raw.versions.filter(v => v && typeof v.body === 'string').slice(-LIMITS.versionsPerPrompt)
      : [],
  };
}

export function titleFrom(body) {
  const line = (body || '').split('\n').map(l => l.trim()).find(Boolean) || 'Untitled prompt';
  const words = line.replace(/[#*_`>\-]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 8).join(' ');
  return words.length > 60 ? words.slice(0, 57) + '…' : words;
}

export async function getPrompts() {
  const stored = await chrome.storage.local.get({ [KEYS.prompts]: [] });
  return Array.isArray(stored[KEYS.prompts]) ? stored[KEYS.prompts].map(normalisePrompt) : [];
}

export async function setPrompts(prompts) {
  await chrome.storage.local.set({ [KEYS.prompts]: prompts.slice(0, LIMITS.prompts) });
}

export async function savePrompt(partial) {
  const prompts = await getPrompts();
  const index = prompts.findIndex(p => p.id === partial.id);
  if (index === -1) {
    if (prompts.length >= LIMITS.prompts) throw new Error('prompt-limit');
    const prompt = normalisePrompt(partial);
    await setPrompts([prompt, ...prompts]);
    return prompt;
  }
  const existing = prompts[index];
  const next = normalisePrompt({ ...existing, ...partial, updatedAt: new Date().toISOString() });
  if (existing.body !== next.body) {
    next.versions = [...existing.versions, { body: existing.body, savedAt: existing.updatedAt }].slice(-LIMITS.versionsPerPrompt);
  }
  prompts[index] = next;
  await setPrompts(prompts);
  return next;
}

export async function deletePrompt(id) {
  const prompts = await getPrompts();
  await setPrompts(prompts.filter(p => p.id !== id));
}

export async function bumpUse(id) {
  const prompts = await getPrompts();
  const prompt = prompts.find(p => p.id === id);
  if (!prompt) return;
  prompt.uses += 1;
  await setPrompts(prompts);
}

export async function importPrompts(list, { replace = false } = {}) {
  const incoming = (Array.isArray(list) ? list : []).map(normalisePrompt);
  if (replace) { await setPrompts(incoming); return { added: incoming.length, updated: 0 }; }
  const prompts = await getPrompts();
  const byId = new Map(prompts.map(p => [p.id, p]));
  let added = 0, updated = 0;
  for (const prompt of incoming) {
    if (byId.has(prompt.id)) { byId.set(prompt.id, { ...byId.get(prompt.id), ...prompt }); updated += 1; }
    else { byId.set(prompt.id, prompt); added += 1; }
  }
  await setPrompts([...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  return { added, updated };
}

// --- Projects ---------------------------------------------------------------
// A project is a reusable brief: who/what the AI is helping with (context) and
// how it should behave (instructions). Improve adds the active one; prompts can
// pull it in with {{project}}.
export function normaliseProject(raw = {}) {
  const now = new Date().toISOString();
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    name: clampText(raw.name, LIMITS.projectName).trim() || 'Untitled project',
    instructions: clampText(raw.instructions, LIMITS.projectText).trim(),
    context: clampText(raw.context, LIMITS.projectText).trim(),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
  };
}

export async function getProjects() {
  const stored = await chrome.storage.local.get({ [KEYS.projects]: [] });
  return Array.isArray(stored[KEYS.projects]) ? stored[KEYS.projects].map(normaliseProject) : [];
}

export async function setProjects(projects) {
  await chrome.storage.local.set({ [KEYS.projects]: projects.slice(0, LIMITS.projects) });
}

export async function saveProject(partial, { max = LIMITS.projects } = {}) {
  const projects = await getProjects();
  const index = projects.findIndex(p => p.id === partial.id);
  if (index === -1) {
    if (projects.length >= max) throw new Error('project-limit');
    const project = normaliseProject(partial);
    await setProjects([...projects, project].sort((a, b) => a.name.localeCompare(b.name)));
    return project;
  }
  const next = normaliseProject({ ...projects[index], ...partial, updatedAt: new Date().toISOString() });
  projects[index] = next;
  await setProjects(projects.sort((a, b) => a.name.localeCompare(b.name)));
  return next;
}

export async function deleteProject(id) {
  const projects = await getProjects();
  await setProjects(projects.filter(p => p.id !== id));
  const settings = await getSettings();
  if (settings.activeProject === id) await updateSettings({ activeProject: '' });
}

export async function getActiveProject() {
  const settings = await getSettings();
  if (!settings.activeProject) return null;
  const projects = await getProjects();
  return projects.find(p => p.id === settings.activeProject) || null;
}

// The text that goes to the AI. Plain labelled paragraphs; no markdown tricks
// so it reads the same in every chat site.
export function projectBrief(project) {
  if (!project) return '';
  const lines = [`Project: ${project.name}`];
  if (project.context) lines.push('', 'Context for this project:', project.context);
  if (project.instructions) lines.push('', 'How I want you to work on this project:', project.instructions);
  return lines.join('\n');
}

export async function importProjects(list) {
  const incoming = (Array.isArray(list) ? list : []).map(normaliseProject);
  const projects = await getProjects();
  const byId = new Map(projects.map(p => [p.id, p]));
  let added = 0, updated = 0;
  for (const project of incoming) {
    if (byId.has(project.id)) { byId.set(project.id, { ...byId.get(project.id), ...project }); updated += 1; }
    else { byId.set(project.id, project); added += 1; }
  }
  await setProjects([...byId.values()].sort((a, b) => a.name.localeCompare(b.name)));
  return { added, updated };
}

export async function getSettings() {
  const stored = await chrome.storage.local.get({ [KEYS.settings]: {} });
  return { ...DEFAULT_SETTINGS, ...(stored[KEYS.settings] || {}) };
}

export async function updateSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [KEYS.settings]: next });
  return next;
}

// API keys are kept separately so a JSON export never includes them.
export async function getByokKeys() {
  const stored = await chrome.storage.local.get({ [KEYS.byokKeys]: {} });
  return stored[KEYS.byokKeys] || {};
}
export async function setByokKey(provider, key) {
  const keys = await getByokKeys();
  if (key) keys[provider] = key; else delete keys[provider];
  await chrome.storage.local.set({ [KEYS.byokKeys]: keys });
}

export async function getLicense() {
  const stored = await chrome.storage.local.get({ [KEYS.license]: null });
  return stored[KEYS.license] || { key: '', status: 'none', checkedAt: null, instanceId: null };
}
export async function setLicense(license) {
  await chrome.storage.local.set({ [KEYS.license]: license });
}

// Variables look like {{name}} or {{name|default value}}. {{about_me}} and {{project}} are special.
export function findVariables(body) {
  const seen = new Map();
  for (const match of (body || '').matchAll(/\{\{\s*([a-zA-Z0-9_ -]+?)\s*(?:\|([^}]*))?\}\}/g)) {
    const name = match[1].trim();
    if (!seen.has(name)) seen.set(name, (match[2] || '').trim());
  }
  return [...seen].map(([name, fallback]) => ({ name, fallback }));
}

export const SPECIAL_VARIABLES = ['about_me', 'project'];

export function fillVariables(body, values = {}, aboutMe = '', project = '') {
  return (body || '').replace(/\{\{\s*([a-zA-Z0-9_ -]+?)\s*(?:\|([^}]*))?\}\}/g, (_, name, fallback) => {
    const key = name.trim();
    if (key === 'about_me') return aboutMe || '';
    if (key === 'project') return project || '';
    const value = values[key];
    return value != null && value !== '' ? value : (fallback || '').trim();
  });
}

export function toMarkdown(prompts) {
  const groups = new Map();
  for (const p of prompts) { if (!groups.has(p.folder)) groups.set(p.folder, []); groups.get(p.folder).push(p); }
  let out = '# PromptDrawer export\n\nExported ' + new Date().toISOString().slice(0, 10) + '\n';
  for (const [folder, list] of groups) {
    out += '\n## ' + folder + '\n';
    for (const p of list) {
      out += '\n### ' + p.title + '\n';
      if (p.tags.length) out += '\nTags: ' + p.tags.join(', ') + '\n';
      out += '\n```\n' + p.body + '\n```\n';
    }
  }
  return out;
}
