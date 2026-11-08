// Pro licence and the free trial. The core is open source; Pro is a one-time
// key checked against the store's public licence API only when a person pastes
// one in. Every install also gets TRIAL_DAYS of Pro for free, no card.
import { LICENSE_ACTIVATE_URL, LICENSE_VALIDATE_URL, TEST_MODE_PRO, TRIAL_DAYS } from '../config.js';
import { getLicense, getTrial, setLicense, setTrial } from './storage.js';

const DAY = 24 * 60 * 60 * 1000;

// Pure: works out where a trial stands at `now`. Exported so it can be unit tested.
// A clock set backwards simply extends the trial; it is not worth policing.
export function trialStatus(trial, now = Date.now()) {
  const startedAt = Date.parse(trial?.startedAt || '');
  if (!Number.isFinite(startedAt)) return { started: false, active: false, daysLeft: 0, endsAt: null };
  const endsAt = startedAt + TRIAL_DAYS * DAY;
  const msLeft = endsAt - now;
  const daysLeft = msLeft > 0 ? Math.min(TRIAL_DAYS, Math.ceil(msLeft / DAY)) : 0;
  return { started: true, active: msLeft > 0, daysLeft, endsAt: new Date(endsAt).toISOString() };
}

// Starts the trial the first time it is asked for; a no-op after that.
export async function ensureTrial() {
  const trial = await getTrial();
  if (trial.startedAt) return trial;
  const next = { startedAt: new Date().toISOString() };
  await setTrial(next);
  return next;
}

// What unlocks Pro right now, in order: a licence key, the free trial, the
// test build switch. `trial` is always filled in so the UI can show a countdown.
export async function getProStatus() {
  const license = await getLicense();
  const trial = trialStatus(await ensureTrial());
  if (license.status === 'active') return { pro: true, source: 'license', trial };
  if (trial.active) return { pro: true, source: 'trial', trial };
  if (TEST_MODE_PRO) return { pro: true, source: 'test', trial };
  return { pro: false, source: 'none', trial };
}

export async function isPro() {
  return (await getProStatus()).pro;
}

export async function activateLicense(rawKey) {
  const key = (rawKey || '').trim();
  if (!/^[A-Za-z0-9-]{16,64}$/.test(key)) throw new Error('license-format');
  const granted = await chrome.permissions.contains({ origins: ['https://api.lemonsqueezy.com/*'] });
  if (!granted) throw new Error('license-permission');
  const body = new URLSearchParams({ license_key: key, instance_name: 'PromptDrawer ' + navigator.platform });
  const response = await fetch(LICENSE_ACTIVATE_URL, { method: 'POST', headers: { accept: 'application/json' }, body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.activated) throw new Error('license-rejected: ' + (data.error || response.status));
  const license = { key, status: 'active', checkedAt: new Date().toISOString(), instanceId: data.instance?.id || null };
  await setLicense(license);
  return license;
}

export async function revalidateLicense() {
  const license = await getLicense();
  if (!license.key) return license;
  try {
    const body = new URLSearchParams({ license_key: license.key, instance_id: license.instanceId || '' });
    const response = await fetch(LICENSE_VALIDATE_URL, { method: 'POST', headers: { accept: 'application/json' }, body });
    const data = await response.json().catch(() => ({}));
    const next = { ...license, status: data.valid ? 'active' : 'invalid', checkedAt: new Date().toISOString() };
    await setLicense(next);
    return next;
  } catch { return license; }
}

export async function removeLicense() {
  await setLicense({ key: '', status: 'none', checkedAt: null, instanceId: null });
}
