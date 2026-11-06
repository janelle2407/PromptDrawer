// Prompt-quality eval for the offline improver (lib/improver.js).
//
//   node test/prompt-eval.mjs            compare every fixture against its checks + golden snapshot
//   node test/prompt-eval.mjs --update   rewrite the golden snapshots (review the diff in the PR)
//   node test/prompt-eval.mjs --invented list capitalised words / numbers the output adds (to grow the allowlist)
//
// Fixtures are labelled with what a good prompt should decide:
//   type         the task-type profile the improver should pick
//   size         small | medium | brief   (small = compact CIDI, no boilerplate)
//   missingSlots the type's slots the rough text does NOT fill; the clarifying line must name exactly these
//   expectClarify whether the output should ask clarifying questions at all
//
// Checks that apply to every version of the improver:
//   labels     Context / Instructions / Details / Input, in that order, each at the start of a line
//   faithful   every number, URL and capitalised name in the input appears in the output
//   invented   no capitalised word or number in the output that is not in the input or the allowlist
//   length     small <= 320 chars, medium <= 1200, brief <= 2500
//   clarify    the clarifying line is present only when expectClarify is true
//   golden     output matches test/golden/<id>.txt
// Checks that only run once the improver exports them (0.4.0+):
//   size       improver.sizeOf(rough) === fixture.size
//   slots      improver.missingSlots(rough) deep-equals fixture.missingSlots
//   scope      a brief rule starting with no / don't / exclude produces an "Out of scope" line

import fs from 'node:fs';
import path from 'node:path';
import * as improver from '../lib/improver.js';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const GOLDEN = path.join(DIR, 'golden');
const ALLOW_FILE = path.join(DIR, 'prompt-eval-allowlist.json');
const UPDATE = process.argv.includes('--update');
const LIST_INVENTED = process.argv.includes('--invented');
const BANDS = { small: 320, medium: 1200, brief: 2500 };

const FIXTURES = [
  // email: slots recipient, goal, call to action
  { id: 'em-landlord', type: 'email', size: 'medium', rough: 'email my landlord about the broken heater, ask them to send someone this week', missingSlots: [], expectClarify: false },
  { id: 'em-reply-sam', type: 'email', size: 'medium', rough: 'reply to Sam: yes to Thursday 3pm, ask for the address', missingSlots: [], expectClarify: false },
  { id: 'em-cold', type: 'email', size: 'small', rough: 'write a cold outreach email', missingSlots: ['recipient', 'goal', 'call to action'], expectClarify: true },
  // code: slots language, expected behaviour
  { id: 'code-fib', type: 'code', size: 'medium', rough: 'write a python function that returns the nth fibonacci number, with unit tests', missingSlots: [], expectClarify: false },
  { id: 'code-regex', type: 'code', size: 'small', rough: 'why does my regex not match', missingSlots: ['language', 'expected behaviour'], expectClarify: true },
  { id: 'code-sql', type: 'code', size: 'medium', rough: 'sql query: customers who ordered more than 3 times in 2025', missingSlots: [], expectClarify: false },
  // research: slot subject
  { id: 'res-pricing', type: 'research', size: 'medium', rough: 'research competitor pricing for meal kit boxes in Australia over the last 6 months', missingSlots: [], expectClarify: false },
  { id: 'res-notion', type: 'research', size: 'medium', rough: 'compare Notion vs Obsidian for a 4 person team', missingSlots: [], expectClarify: false },
  { id: 'res-vague', type: 'research', size: 'small', rough: 'do some research for me', missingSlots: ['subject'], expectClarify: true },
  // writing: slot audience
  { id: 'wr-blog', type: 'writing', size: 'medium', rough: 'write a blog post about sleep hygiene for shift workers, about 800 words', missingSlots: [], expectClarify: false },
  { id: 'wr-caption', type: 'writing', size: 'small', rough: 'instagram caption for our new candle', missingSlots: ['audience'], expectClarify: true },
  { id: 'wr-headlines', type: 'writing', size: 'small', rough: '10 headline ideas for a newsletter about budgeting for parents', missingSlots: [], expectClarify: false },
  // summary: no slots (the text arrives in Input)
  { id: 'sum-tldr', type: 'summary', size: 'small', rough: 'tl;dr this', missingSlots: [], expectClarify: false },
  { id: 'sum-meeting', type: 'summary', size: 'medium', rough: 'summarise these meeting notes into 5 action items with owners', missingSlots: [], expectClarify: false },
  { id: 'sum-article', type: 'summary', size: 'small', rough: 'key points of this article, plain english', missingSlots: [], expectClarify: false },
  // plan: slots goal, timeframe
  { id: 'plan-launch', type: 'plan', size: 'medium', rough: 'plan a 2 week launch for my chrome extension', missingSlots: [], expectClarify: false },
  { id: 'plan-hobart', type: 'plan', size: 'medium', rough: '3 day itinerary for Hobart in June, we like food and walks', missingSlots: [], expectClarify: false },
  { id: 'plan-vague', type: 'plan', size: 'small', rough: 'make me a plan', missingSlots: ['goal', 'timeframe'], expectClarify: true },
  // analysis / spreadsheet: slots data source, question
  { id: 'an-formula', type: 'analysis', size: 'medium', rough: 'excel formula to sum column B when column A says Paid', missingSlots: [], expectClarify: false },
  { id: 'an-budget', type: 'analysis', size: 'medium', rough: 'help me build a monthly budget on $4,200 income with $1,900 rent', missingSlots: [], expectClarify: false },
  { id: 'an-vague', type: 'analysis', size: 'small', rough: 'analyse this data', missingSlots: ['question'], expectClarify: true },
  // learning: slot level
  { id: 'lr-interest', type: 'learning', size: 'small', rough: "explain compound interest like I'm 12", missingSlots: [], expectClarify: false },
  { id: 'lr-hsc', type: 'learning', size: 'medium', rough: 'study plan for the HSC chemistry exam in 8 weeks', missingSlots: [], expectClarify: false },
  { id: 'lr-vague', type: 'learning', size: 'small', rough: 'teach me statistics', missingSlots: ['level'], expectClarify: true },
  // creative: slots form, subject
  { id: 'cr-poem', type: 'creative', size: 'small', rough: 'a short poem about my dog Biscuit for her birthday', missingSlots: [], expectClarify: false },
  { id: 'cr-story', type: 'creative', size: 'small', rough: 'write a story', missingSlots: ['subject'], expectClarify: true },
  { id: 'cr-song', type: 'creative', size: 'medium', rough: 'song lyrics about leaving Sydney, folk style, 3 verses and a chorus', missingSlots: [], expectClarify: false },
  // generic: no slots
  { id: 'gen-typo', type: 'generic', size: 'small', rough: 'fix this typo', missingSlots: [], expectClarify: false },
  { id: 'gen-ideas', type: 'generic', size: 'small', rough: 'ideas for a rainy Sunday with two kids under 5', missingSlots: [], expectClarify: false },
  { id: 'gen-shoulder', type: 'generic', size: 'medium', rough: 'my shoulder hurts after sitting, what can I do', missingSlots: [], expectClarify: false },
  // briefs: only the job is required; why + done missing -> ask
  { id: 'brief-pricing', type: 'brief', size: 'brief', brief: { job: 'research competitor pricing', why: 'we are setting the price we compete with', rules: 'last 6 months only; Australian market; no guesses', done: 'one page, 8 competitors, a table with sources' }, missingSlots: [], expectClarify: false },
  { id: 'brief-newsletter', type: 'brief', size: 'brief', brief: { job: 'write our November newsletter', why: 'subscribers have gone quiet since the move to Kit', rules: 'under 300 words\nno discount codes\nwarm, not salesy', done: 'subject line, 3 short sections, one link' }, missingSlots: [], expectClarify: false },
  { id: 'brief-darkmode', type: 'brief', size: 'brief', brief: { job: 'add dark mode to the settings page', why: 'testers asked for it', rules: 'no new dependencies; keep the existing colour tokens', done: 'a toggle in settings, remembered across restarts, screenshots of both modes' }, missingSlots: [], expectClarify: false },
  { id: 'brief-vague', type: 'brief', size: 'brief', brief: { job: 'sort out my inbox', why: '', rules: '', done: '' }, missingSlots: ['why', 'done looks like'], expectClarify: true },
  { id: 'brief-crm', type: 'brief', size: 'brief', brief: { job: 'shortlist 5 CRMs for a 3 person agency', why: 'we outgrew spreadsheets', rules: "exclude anything over $50 per user per month; don't include HubSpot", done: 'a table with price, pros, cons and a pick' }, missingSlots: [], expectClarify: false, expectScope: true },
];

const allow = fs.existsSync(ALLOW_FILE) ? JSON.parse(fs.readFileSync(ALLOW_FILE, 'utf8')) : { words: [], numbers: [] };
const allowWords = new Set(allow.words.map(w => w.toLowerCase()));
const allowNumbers = new Set(allow.numbers.map(String));

const inputOf = f => f.brief ? Object.values(f.brief).join('\n') : f.rough;
const run = f => f.brief ? improver.localBrief(f.brief) : improver.localImprove(f.rough);
const numbers = s => (s.match(/\d[\d,.]*\d|\d/g) || []).map(n => n.replace(/[,.]$/, ''));
const urls = s => s.match(/\b(?:https?:\/\/|www\.)\S+|\b[\w.+-]+@[\w-]+\.[\w.]+/g) || [];
const capitalised = s => s.match(/\b[A-Z][A-Za-z']+\b/g) || [];
const words = s => new Set((s.toLowerCase().match(/[a-z][a-z']*/g) || []));

function check(f) {
  const out = run(f);
  const input = inputOf(f);
  const fails = [];
  const skipped = [];

  // labels, in order, each at a line start
  let pos = 0;
  for (const label of improver.CIDI) {
    const m = out.slice(pos).match(new RegExp(`(^|\\n)${label}:`));
    if (!m) { fails.push(`labels: ${label} missing or out of order`); break; }
    pos += m.index + m[0].length;
  }

  // faithful: input facts survive
  const lower = out.toLowerCase();
  for (const n of numbers(input)) if (!out.includes(n)) fails.push(`faithful: number ${n} dropped`);
  for (const u of urls(input)) if (!out.includes(u)) fails.push(`faithful: ${u} dropped`);
  const inWords = words(input);
  for (const c of new Set(capitalised(input))) if (!lower.includes(c.toLowerCase())) fails.push(`faithful: name ${c} dropped`);

  // invented: nothing capitalised or numeric that the input did not give
  const invented = [];
  for (const c of new Set(capitalised(out))) {
    const w = c.toLowerCase();
    if (!inWords.has(w) && !allowWords.has(w) && !inWords.has(w.replace(/'s$/, ''))) invented.push(c);
  }
  const inNums = new Set(numbers(input));
  for (const n of new Set(numbers(out))) if (!inNums.has(n) && !allowNumbers.has(n)) invented.push(n);
  if (invented.length) fails.push(`invented: ${invented.join(', ')}`);

  // length band
  if (out.length > BANDS[f.size]) fails.push(`length: ${out.length} > ${BANDS[f.size]} for ${f.size}`);

  // clarify line only when wanted
  const asks = /clarifying question/i.test(out);
  if (asks !== f.expectClarify) fails.push(`clarify: ${asks ? 'asks' : 'does not ask'} but expectClarify=${f.expectClarify}`);

  // 0.4.0+ checks, gated on the exports existing
  if (typeof improver.sizeOf === 'function' && !f.brief) {
    const got = improver.sizeOf(f.rough);
    if (got !== f.size) fails.push(`size: got ${got}, want ${f.size}`);
  } else skipped.push('size');
  if (typeof improver.missingSlots === 'function') {
    const got = f.brief ? improver.missingSlots(f.brief) : improver.missingSlots(f.rough);
    if (JSON.stringify(got) !== JSON.stringify(f.missingSlots)) fails.push(`slots: got [${got}], want [${f.missingSlots}]`);
  } else skipped.push('slots');
  if (f.expectScope) {
    if (typeof improver.sizeOf === 'function') { if (!/out of scope/i.test(out)) fails.push('scope: no "Out of scope" line'); }
    else skipped.push('scope');
  }

  // golden snapshot
  const file = path.join(GOLDEN, f.id + '.txt');
  if (UPDATE) fs.writeFileSync(file, out);
  else if (!fs.existsSync(file)) fails.push('golden: no snapshot (run with --update)');
  else if (fs.readFileSync(file, 'utf8') !== out) fails.push('golden: output changed (review, then --update)');

  return { out, fails, skipped, invented };
}

fs.mkdirSync(GOLDEN, { recursive: true });
let pass = 0;
const failed = [];
const skippedChecks = new Set();
const allInvented = new Set();
for (const f of FIXTURES) {
  const r = check(f);
  r.skipped.forEach(s => skippedChecks.add(s));
  r.invented.forEach(i => allInvented.add(i));
  if (r.fails.length) failed.push([f.id, r.fails]); else pass++;
}

if (LIST_INVENTED) {
  console.log('Capitalised words / numbers the output adds that are not in the input or allowlist:');
  console.log([...allInvented].sort().join(', ') || '(none)');
  process.exit(0);
}

for (const [id, fails] of failed) console.log(`FAIL ${id}\n  ${fails.join('\n  ')}`);
const total = FIXTURES.length;
console.log(`\n${pass}/${total} fixtures pass${UPDATE ? ' (golden snapshots rewritten)' : ''}`);
if (skippedChecks.size) console.log(`skipped (not exported by this improver version): ${[...skippedChecks].join(', ')}`);
const byCheck = {};
for (const [, fails] of failed) for (const f of fails) byCheck[f.split(':')[0]] = (byCheck[f.split(':')[0]] || 0) + 1;
if (Object.keys(byCheck).length) console.log('failures by check: ' + Object.entries(byCheck).map(([k, v]) => `${k} ${v}`).join(', '));
process.exit(failed.length ? 1 : 0);
