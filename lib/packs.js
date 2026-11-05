// Three starter packs. Original prompts written for PromptDrawer (MIT).
// Variables use {{name}} or {{name|default}}. {{about_me}} pulls in your About me block.
export const STARTER_PACKS = [
  {
    id: 'everyday',
    name: 'Everyday writing',
    blurb: 'Emails, replies and messages that sound like you.',
    prompts: [
      { title: 'Reply to this email', folder: 'Writing', tags: ['email'], body: 'Write a reply to the email below. Tone: {{tone|friendly and professional}}. Keep it under {{length|120}} words. Say yes/no clearly if a decision is needed, and end with one clear next step.\n\nEmail:\n{{email}}' },
      { title: 'Make this shorter', folder: 'Writing', tags: ['edit'], body: 'Cut the text below to about half its length without losing any facts, names or numbers. Keep my voice. Return only the shortened text.\n\n{{text}}' },
      { title: 'Fix tone, keep meaning', folder: 'Writing', tags: ['edit'], body: 'Rewrite the text below so it sounds {{tone|warm but direct}}. Keep every fact and the same length. Return only the rewritten text.\n\n{{text}}' },
      { title: 'Chase a late reply (kindly)', folder: 'Writing', tags: ['email'], body: 'Write a short, kind follow-up to {{name}} about {{topic}}. I last wrote {{when|a week ago}}. No guilt-tripping. One clear ask with a suggested deadline of {{deadline|end of this week}}.' },
      { title: 'Explain it to me simply', folder: 'Learning', tags: ['learn'], body: 'Explain {{topic}} as if I am a smart {{age|14}} year old. Use one everyday analogy, then three short bullet points on what matters most, then one thing people commonly get wrong.' },
      { title: 'Turn my notes into a summary', folder: 'Writing', tags: ['summary'], body: 'Turn these rough notes into a clean summary with a one-line headline, 3 to 5 bullets, and a "Next actions" list with an owner for each action.\n\nNotes:\n{{notes}}' },
    ],
  },
  {
    id: 'business',
    name: 'Small business',
    blurb: 'Plans, pricing, launches and customer messages.',
    prompts: [
      { title: 'Pressure-test my idea', folder: 'Business', tags: ['strategy'], body: '{{about_me}}\n\nHere is a business idea: {{idea}}.\n\nAct as a sceptical but fair advisor. Give me: the 3 biggest risks, the cheapest way to test each one this month, who the first 10 customers would realistically be, and a one-line verdict. Be honest, not encouraging.' },
      { title: 'Price this product', folder: 'Business', tags: ['pricing'], body: 'I sell {{product}} to {{customer}}. Competitors charge roughly {{competitor_prices}}. Suggest a launch price, a later price, and the reasoning for each. Include what would make a buyer feel it is cheap for the value. Keep it to a short table plus five bullets.' },
      { title: 'Launch announcement, 3 versions', folder: 'Business', tags: ['marketing'], body: 'Write three launch posts for {{product}}: one for a friends-and-family email, one for LinkedIn, one for a casual social post. Lead with the one problem it solves for {{customer}}. No hype words. Each under {{length|90}} words.' },
      { title: 'Customer reply, calm and clear', folder: 'Business', tags: ['support'], body: 'A customer wrote the message below. Write a reply that acknowledges the issue in one sentence, says exactly what I will do and by when, and offers {{offer|a refund or a fix, their choice}}. Warm, no corporate filler.\n\nMessage:\n{{message}}' },
      { title: 'Weekly plan from my task list', folder: 'Business', tags: ['planning'], body: 'Here is my task list with rough urgency. Build me a realistic plan for this week assuming I have about {{hours|10}} working hours and may lose a day to illness. Put the urgent items first, group small tasks, and mark anything that can be delegated or dropped.\n\nTasks:\n{{tasks}}' },
      { title: 'Compare two options', folder: 'Business', tags: ['decision'], body: 'Compare {{option_a}} and {{option_b}} for {{goal}}. Give a table with cost, effort, risk, and upside, then a clear recommendation with one sentence of reasoning. If you need a fact to decide, ask me before answering.' },
    ],
  },
  {
    id: 'thinking',
    name: 'Thinking and learning',
    blurb: 'Get better answers by asking better questions.',
    prompts: [
      { title: 'Ask me questions first', folder: 'Thinking', tags: ['method'], body: 'I want help with: {{goal}}. Before you answer, ask me the 5 questions whose answers would most change your advice. Wait for my replies, then give the advice.' },
      { title: 'Steelman the other side', folder: 'Thinking', tags: ['method'], body: 'I believe {{belief}}. Give me the strongest honest case against it, as its best advocate would make it. Then list what evidence would change my mind either way.' },
      { title: 'Teach me with a quiz', folder: 'Learning', tags: ['learn'], body: 'Teach me {{topic}} in 5 short lessons. After each lesson, ask me one question and wait for my answer before continuing. Correct me gently and briefly when I am wrong.' },
      { title: 'Decision in 10 minutes', folder: 'Thinking', tags: ['decision'], body: 'Help me decide: {{decision}}. Constraints: {{constraints}}. Walk me through it in this order: what I actually want, the options, the worst realistic outcome of each, what I can undo later, then your recommendation in one line.' },
      { title: 'Find the holes in this plan', folder: 'Thinking', tags: ['review'], body: 'Here is my plan. Find the gaps, the hidden assumptions, and the step most likely to fail. Then suggest the smallest change that fixes the biggest risk.\n\nPlan:\n{{plan}}' },
      { title: 'Rewrite my prompt for better answers', folder: 'Thinking', tags: ['prompt'], body: 'Here is a prompt I was going to send to an AI. Rewrite it so the answer will be more specific and useful: add the role, the context, the format I want, and a line asking for clarifying questions. Return only the new prompt.\n\nMy prompt:\n{{prompt}}' },
    ],
  },
];
