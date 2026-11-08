# Changelog

## Unreleased

- Prompt-quality eval (`test/prompt-eval.mjs`): 35 labelled fixtures with golden snapshots. 0.3.0 baseline: 1/35 pass; every miss is the always-on clarifying line (26) or a one-size-fits-all prompt that is too long for a small job (15). Facts are never dropped and nothing is invented. 0.4.0 must bring this to 35/35.

## 0.3.3 (2026-11-07)

Two fixes from testing: paste works inside the Improve dialog, and the Input line no longer confuses the AI.
- **Paste, copy and cut work in the dialog.** Chat sites catch every paste on the page and push it into their own composer, so pasting into the Improve dialog did nothing. The extension now catches paste, copy and cut for its own text boxes first and applies them itself. Pasting elsewhere on the page is untouched.
- **Clearer Input line.** The improved prompt used to end with "(paste the text, notes or data to work from here, if any)", which AIs read as a question or a form to fill. It now ends with "Input: none provided. Work from the details above." The "Ask this AI" meta prompts ask for the same line when there is nothing to work from.
- **Hints.** The dialog and the drawer now say: "Have text or data for the AI? Paste it over the Input line."
- Tests: 7 new headless checks (74 total), including a hostile page-level paste handler that must never see a paste meant for the dialog.

## 0.3.2 (2026-11-07)

Pricing: one-time $4.99, with a free 7-day Pro trial on every install. No card, no account.
- **7-day free Pro trial.** Every install gets every Pro feature for 7 days. The clock starts the first time the extension checks Pro on a device (install, or the first open after updating to 0.3.2). Nothing to enter.
- **Countdown in the drawer and settings.** The badge under the name reads "Trial · N days left", with a one-line "Keep Pro for $4.99" link. When the trial ends you drop to the free plan; everything you saved stays. The end-of-trial line can be hidden.
- **Upsell copy updated.** "Keep Pro for $4.99", one-time, no subscription, 7-day refund. A licence key still wins over the trial, and removing a key or deleting your data does not restart the trial.
- Config: `PRO_PRICE` and `TRIAL_DAYS` in `config.js`; new `trial` storage key; `getProStatus()` in `lib/license.js` says what unlocks Pro (licence, trial, or test build).

## 0.3.1 (2026-11-06)

Four fixes from the Cursor Bugbot review of 0.3.0.
- **Drawer Improve button no longer sticks.** Switching Prompt/Brief while an Improve was still running left the button greyed out until the drawer was reloaded.
- **An empty chat box no longer changes your remembered side.** Pressing Improve with nothing typed opens Brief (as before) but only a click on Prompt or Brief is remembered.
- **First-run settings cannot overwrite each other.** The "tip seen" and "last side used" writes on the first Improve went through at the same time and one could be lost; they now go one after the other.
- **Rules that start with a number keep the number.** "10 pages max" or "3 sources only" in the Rules box used to lose the number; only real list markers ("- ", "1. ", "2) ") are stripped now.

## 0.3.0 (2026-11-06)

- **Brief mode** for bigger jobs (Janelle's idea). A Prompt / Brief toggle at the top of Improve (on chat sites and in the drawer). Brief shows four short boxes: **The job**, **Why**, **Rules**, **Done looks like**. The job is pre-filled with whatever you had typed. Press *Write the prompt* and you get the long CIDI version: Why becomes the Context, the job the Instructions, each rule its own Details line, plus a "Done looks like" line the AI must check its answer against. Works on all four engines; no questions asked, only the job is required.
- Pressing Improve with an empty chat box now opens the Brief side instead of a "type something first" message.
- PromptDrawer remembers which side (Prompt or Brief) you used last.
- The extension description, welcome page and How-to tab now explain the difference: Prompt for a small job or one already started, Brief for a bigger job.

## 0.2.3 (2026-11-05)

Four fixes from the code review of the first test build.
- **copilot.com** (Copilot's newer address) now gets the same chat-box and send-button selectors as copilot.microsoft.com, so inserts land in the right box and Send is found.
- **Mac keyboard shortcuts**: Option+S / Option+I / Option+D type a symbol on macOS, so the page shortcut now matches the physical key. Works on every keyboard layout.
- **Switching engines quickly** while an Improve is still running: a slow reply from the earlier engine no longer overwrites the newer one (Improve dialog on chat sites, and the drawer's Improve tab).
- **Toolbar off in Settings** now hides the first-run tip as well as the pill, straight away.

## 0.2.2 (2026-11-02)

- Improve now writes every prompt in the **CIDI** shape: Context, Instructions, Details, Input. Same four labels on all four engines (tidy-up, ask-the-AI, Chrome built-in AI, own key), so the structure is easy to learn and the AI gets a clear Input slot for the text or data to work from.

## 0.2.1 (2026-11-02)

- Two chat boxes on one page (Claude's project chat beside a thread): inserts now go to the box you are in or used last, not the first one on the page. If neither has been used yet, PromptDrawer picks the last one and says so in the toast.

## 0.2.0 (2026-11-02)

Projects: context and instructions that travel with you.
- **Projects** at the top of the drawer: a name, "Context: what the AI should know" and "Instructions: how the AI should work". Pick one and Improve (in the drawer and with Alt+I on chat sites) folds it into every rewrite, on every engine.
- **Brief the AI** button: puts the whole project into the chat box as the first message of a new chat (or copies it if no AI tab is open).
- `{{project}}` works inside any saved prompt, next to `{{about_me}}`.
- Optional setting to prepend the project brief to every inserted prompt (off by default).
- Projects ride along in JSON export/import. Free: 2 projects; Pro: unlimited.

## 0.1.1 (2026-11-01)

Easier first use, after real-person testing.
- Welcome page opens on install with a try-it-here box.
- The drawer now has an **Improve** tab that works without any AI tab open (Grab what I'm typing, Improve, edit, Put it in the chat box / Copy / Save). Plus a **How to** tab.
- Improve dialog on chat sites: plain-English engine names with a one-line explanation each, editable result shown as text (diff behind a "Show what changed" toggle), Save to drawer button, clearer next-step toasts.
- First-run tip next to the pill: "Type something, then click Improve".
- Copilot: also runs on copilot.com (where copilot.microsoft.com redirects when signed out).

## 0.1.0 (2026-11-01)

First test build: save, insert with variables, improve (structure / in-chat / built-in AI / own key), Ask all three, folders, tags, favourites, search, version history, export/import, starter packs, five site adapters.
