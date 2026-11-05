// Three ways to improve a rough request. None of them need a server.
//  - local:  instant, offline. Turns a rough line into a structured prompt.
//  - inchat: wraps the rough line in a meta-prompt that the AI you are already
//            talking to turns into a better prompt. Zero cost.
//  - nano / byok: handled in engines.js; they use SYSTEM_PROMPT below.

// Every engine writes the improved prompt in the CIDI shape:
//   Context, Instructions, Details, Input. Same four labels everywhere, so
//   people learn the framework just by reading what Improve gives them.
export const CIDI = ['Context', 'Instructions', 'Details', 'Input'];

export const SYSTEM_PROMPT = `You are a prompt engineer. Rewrite the user's rough request into a clear, complete prompt that an AI assistant can act on well. Use the CIDI structure: four labelled sections, in this order.
Context: who the assistant should be (a role), the background, who the result is for, and the goal.
Instructions: the task itself as concrete actions (write, summarise, compare, list...).
Details: constraints and preferences: tone, length, style, what to include or avoid, the output format, and a line telling the assistant to ask up to three clarifying questions if something important is missing.
Input: the text, data or material the assistant should work from. If the request contains none, write "(paste the text or details to work from here)".
Keep the person's intent and any facts they gave. Write in the same language as the request. Return only the improved prompt, no commentary.`;

export function buildMetaPrompt(rough, context = '') {
  const extra = context.trim() ? `\n\nBackground you should fold into the Context section (keep the facts, do not drop them):\n"""\n${context.trim()}\n"""` : '';
  return `Please act as a prompt engineer. Below is a rough request. Rewrite it into a clear, complete prompt that you (or any AI assistant) could act on well, in the CIDI structure with four labelled sections in this order:
Context: the role to take, the background, who it is for, the goal.
Instructions: the task as concrete actions.
Details: tone, length, style, what to include or avoid, the output format, plus a line asking up to three clarifying questions if anything important is missing.
Input: the text or data to work from, or "(paste the text or details to work from here)" if there is none.
Keep my intent and facts. Return only the improved prompt inside a code block, no commentary.

Rough request:
"""
${rough.trim()}
"""${extra}`;
}

// Joins the About me block and the active project's brief into one context
// string for the engines. Either part may be empty.
export function buildContext({ aboutMe = '', project = '' } = {}) {
  return [project.trim(), aboutMe.trim() ? 'About me:\n' + aboutMe.trim() : ''].filter(Boolean).join('\n\n');
}

const DOMAINS = [
  [/\b(bug|error|function|code|script|python|javascript|typescript|sql|regex|api|json|html|css|refactor|unit test)\b/i, 'senior software engineer'],
  [/\b(email|reply|message|letter|outreach|follow[- ]?up|cold)\b/i, 'communications specialist'],
  [/\b(blog|article|post|newsletter|caption|headline|copy|landing page|tagline|script)\b/i, 'content writer and editor'],
  [/\b(business|startup|strategy|pricing|marketing|launch|competitor|market|revenue|plan)\b/i, 'business strategist'],
  [/\b(recipe|meal|cook|dinner|ingredients)\b/i, 'home cook and nutrition-aware recipe developer'],
  [/\b(study|learn|explain|teach|understand|lesson|exam|revise)\b/i, 'patient teacher'],
  [/\b(resume|cv|cover letter|interview|job)\b/i, 'career coach'],
  [/\b(trip|travel|itinerary|holiday|flight|hotel)\b/i, 'travel planner'],
  [/\b(workout|fitness|exercise|pain|health|symptom|doctor)\b/i, 'careful health and wellbeing guide (not a substitute for a clinician)'],
  [/\b(summar|tl;dr|key points|notes)\b/i, 'precise summariser'],
  [/\b(story|poem|novel|character|fiction|song|lyrics)\b/i, 'creative writer'],
  [/\b(spreadsheet|excel|sheets|formula|budget|finance|invoice|tax)\b/i, 'finance and spreadsheet expert'],
];

const FORMATS = [
  [/\b(compare|comparison|versus|vs\.?|pros and cons|differences)\b/i, 'A comparison table, then a short recommendation.'],
  [/\b(list|ideas|options|examples|ways|tips|suggestions)\b/i, 'A numbered list, one line per item, most useful first.'],
  [/\b(step|how do i|how to|guide|process|set up|setup|install)\b/i, 'Numbered steps, each one short and actionable.'],
  [/\b(code|function|script|regex|sql|query)\b/i, 'The code in a single code block, followed by a two-sentence explanation.'],
  [/\b(email|letter|message|reply)\b/i, 'The full text ready to send, with a subject line if it is an email.'],
  [/\b(summar|tl;dr)\b/i, 'Three to five bullet points, then one sentence on what matters most.'],
  [/\b(plan|schedule|itinerary|roadmap|calendar)\b/i, 'A day-by-day or phase-by-phase plan with headings.'],
  [/\b(table)\b/i, 'A table.'],
];

const TONES = [
  [/\b(friendly|warm|casual|chatty)\b/i, 'friendly and warm'],
  [/\b(formal|professional|polite)\b/i, 'professional and polite'],
  [/\b(funny|witty|playful|humou?r)\b/i, 'light and witty'],
  [/\b(short|brief|concise|quick)\b/i, 'concise'],
  [/\b(simple|plain|eli5|beginner|non[- ]technical)\b/i, 'plain and jargon-free'],
];

function pick(list, text, fallback) {
  for (const [pattern, value] of list) if (pattern.test(text)) return value;
  return fallback;
}

function clean(text) {
  let t = (text || '').trim().replace(/\s+/g, ' ');
  if (!t) return '';
  t = t[0].toUpperCase() + t.slice(1);
  if (!/[.!?]$/.test(t)) t += '.';
  return t;
}

export function localImprove(rough, { aboutMe = '', project = '' } = {}) {
  const text = (rough || '').trim();
  if (!text) return '';
  const role = pick(DOMAINS, text, 'thoughtful expert assistant');
  const format = pick(FORMATS, text, 'Clear headings or short paragraphs. Keep it as short as the task allows.');
  const tone = pick(TONES, text, '');
  const lines = [];
  lines.push(`Context: You are a ${role}.`);
  if (project.trim()) lines.push(project.trim());
  if (aboutMe.trim()) { lines.push('About me:'); lines.push(aboutMe.trim()); }
  lines.push('');
  lines.push(`Instructions: ${clean(text)}`);
  lines.push('');
  lines.push('Details:');
  lines.push('- Be specific and concrete. Use real examples rather than generalities.');
  lines.push('- Do not pad. Leave out caveats and introductions I did not ask for.');
  if (tone) lines.push(`- Tone: ${tone}.`);
  lines.push('- If a fact is uncertain, say so instead of guessing.');
  lines.push(`- Output format: ${format}`);
  lines.push('- Before you answer: if anything important is missing or ambiguous, ask me up to three short clarifying questions first. Otherwise, go ahead.');
  lines.push('');
  lines.push('Input:');
  lines.push('(paste the text, notes or data to work from here, if any)');
  return lines.join('\n');
}

export function describeEngine(engine) {
  return {
    local: 'Quick tidy-up (no AI, instant)',
    inchat: 'Ask the AI in this chat (free)',
    nano: "Chrome's built-in AI (on your device)",
    byok: 'My own API key',
  }[engine] || engine;
}

// One line each, shown under the engine picker so people know what to expect.
export const ENGINE_HELP = {
  local: 'Wraps your request in the CIDI structure (Context, Instructions, Details, Input). No AI involved, so it never rewrites your words.',
  inchat: 'Turns your request into a message that asks this AI to write a better prompt. Press send, copy the result.',
  nano: "Uses the small AI model built into Chrome, on your device. Needs Chrome 138+; the first run downloads the model.",
  byok: 'Sends your request to Anthropic, OpenAI or Google using a key you paste in Settings. Best quality.',
};
