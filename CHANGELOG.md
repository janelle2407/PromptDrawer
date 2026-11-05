# Changelog

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
