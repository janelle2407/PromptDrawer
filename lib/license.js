// Pro licence. The core is open source; Pro is a one-time key checked against
// the store's public licence API only when a person pastes one in.
import { LICENSE_ACTIVATE_URL, LICENSE_VALIDATE_URL, TEST_MODE_PRO } from '../config.js';
import { getLicense, setLicense } from './storage.js';

export async function isPro() {
  if (TEST_MODE_PRO) return true;
  const license = await getLicense();
  return license.status === 'active';
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
