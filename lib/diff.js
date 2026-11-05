// Small word-level diff (LCS). Returns [{type:'same'|'add'|'del', text}].
export function wordDiff(before, after) {
  const a = tokens(before), b = tokens(after);
  const n = a.length, m = b.length;
  if (n * m > 400000) return [{ type: 'del', text: before }, { type: 'add', text: after }];
  const table = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  }
  const out = [];
  const push = (type, text) => { const last = out[out.length - 1]; if (last && last.type === type) last.text += text; else out.push({ type, text }); };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { push('same', a[i]); i++; j++; }
    else if (table[i + 1][j] >= table[i][j + 1]) { push('del', a[i]); i++; }
    else { push('add', b[j]); j++; }
  }
  while (i < n) push('del', a[i++]);
  while (j < m) push('add', b[j++]);
  return out;
}
function tokens(text) { return (text || '').match(/\s+|[^\s]+/g) || []; }
