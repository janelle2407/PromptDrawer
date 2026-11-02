# PromptDrawer

**Your prompts, in every AI.** Save the prompts you keep retyping, reuse them with one click, and turn a rough request into a proper prompt, inside ChatGPT, Claude, Gemini, Perplexity and Copilot. Everything stays on your device.

- **Save** what you are typing with `Alt+S` (or the small toolbar, or the right-click menu).
- **Insert** any saved prompt into the chat you have open. `{{blanks}}` get filled in as you go.
- **Improve** a rough line with `Alt+I`: see a before/after diff, press *Use this*, and *Undo* if you change your mind. Works offline (instant structure), or asks the AI you are already talking to (free), or uses Chrome's on-device model or your own API key (Pro).
- **Projects**: a reusable brief (context + instructions) that Improve folds into every rewrite, in every AI. One click to brief a new chat; `{{project}}` inside any saved prompt. Two free, unlimited with Pro.
- **Ask all three**: send one prompt to every open AI tab and compare the answers (Pro).
- **Folders, tags, favourites, search, version history, JSON/Markdown export**, three starter packs.
- **No account, no server, no analytics.** Open source core (MIT). Pro is a one-time key.

## Try it (unpacked)

1. Download or clone this folder.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, pick the folder.
3. Open ChatGPT, Claude, Gemini, Perplexity or Copilot (reload tabs that were already open).
4. A welcome page opens with a try-it box. On any chat site: type something rough, press `Alt+I` (or click **Improve** on the small pill bottom-right). Press `Alt+S` to save it. Click the toolbar icon to open the drawer, which also has its own **Improve** tab.

Shortcuts can be changed at `chrome://extensions/shortcuts`.

Two chat boxes on one page (for example Claude's project chat next to a thread)? PromptDrawer writes into the box you are in or used last. Click in the one you want first.

## How it is built

Manifest V3, plain JavaScript modules, no build step.

| File | Job |
| --- | --- |
| `manifest.json` | Permissions: `storage`, `sidePanel`, `contextMenus`; host access only to the five chat sites. API providers are optional permissions asked for only when you add a key. |
| `content-script.js` | Runs on the five chat sites. Finds the composer with a per-site adapter table plus a generic fallback, draws the toolbar/dialogs in a closed shadow root, never reads the conversation. |
| `service-worker.js` | Routes keyboard commands, context menus and messages. Verifies every sender. Runs Improve. |
| `side-panel.html` + `panel.js` | The drawer: project picker, Improve tab, My prompts, How to. |
| `welcome.html` + `welcome.js` | First-run page with a try-it box. |
| `options.html` + `options.js` | Settings, About me, engines, licence. |
| `lib/storage.js` | All data in `chrome.storage.local`. API keys live in a separate key so exports never include them. |
| `lib/improver.js` | The instant offline improver and the in-chat meta-prompt. |
| `lib/engines.js` | Chrome built-in AI (Prompt API) and bring-your-own-key calls. |
| `lib/license.js` | Pro key check against the store's public licence API. |
| `lib/packs.js` | Starter packs. |
| `config.js` | Pricing links, which features are Pro, test-mode switch. |

`config.js` has `TEST_MODE_PRO = true` so testers get every feature. Set it to `false` for a public build.

## Privacy

See [PRIVACY.md](PRIVACY.md). Short version: nothing leaves your browser unless you add your own API key (then your prompt goes to that provider only) or paste a licence key (then the key goes to the licence server only).

## Contributing

Issues and pull requests welcome. Keep the core local-first and keep permissions minimal. Site adapters live at the top of `content-script.js`; if a chat site changes its composer, that table is the place to fix.

## Licence

MIT. See [LICENSE](LICENSE).
