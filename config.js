// PromptDrawer build configuration. Edit here, nowhere else.

// Set to false for a public release. While true, every Pro feature is unlocked
// so testers (and you) can try everything without a licence key.
export const TEST_MODE_PRO = true;

// Where people buy a Pro licence (one-time). Fill in once the Lemon Squeezy
// product exists. The extension never sends anything here by itself.
export const CHECKOUT_URL = 'https://promptdrawer.lemonsqueezy.com/';

// Lemon Squeezy licence endpoints. Used only when a person pastes a key.
export const LICENSE_VALIDATE_URL = 'https://api.lemonsqueezy.com/v1/licenses/validate';
export const LICENSE_ACTIVATE_URL = 'https://api.lemonsqueezy.com/v1/licenses/activate';

// Which features need Pro. Everything else is free forever.
export const PRO_FEATURES = {
  askAll: 'Ask all three',
  versions: 'Version history',
  markdownExport: 'Markdown export',
  aiEngines: 'Built-in AI and bring-your-own-key engines',
  aboutMeAuto: 'Auto-add your About me block',
  projects: 'Unlimited projects',
};

// What the free tier gets before a Pro key is needed.
export const FREE_LIMITS = {
  projects: 2,
};

export const LIMITS = {
  promptBody: 20000,
  promptTitle: 120,
  prompts: 5000,
  versionsPerPrompt: 20,
  projects: 200,
  projectName: 60,
  projectText: 6000,
};

export const HOMEPAGE = 'https://promptdrawer.com';
