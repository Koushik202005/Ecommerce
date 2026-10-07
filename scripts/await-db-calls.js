const fs = require('node:fs');
const file = 'server/index.js';
let source = fs.readFileSync(file, 'utf8');

function closingParen(text, open) {
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')' && --depth === 0) return i;
  }
  throw new Error(`Unclosed parenthesis at ${open}`);
}

const replacements = [];
let cursor = 0;
while ((cursor = source.indexOf('db.prepare(', cursor)) !== -1) {
  const prepareOpen = source.indexOf('(', cursor);
  const prepareClose = closingParen(source, prepareOpen);
  let methodStart = prepareClose + 1;
  while (/\s/.test(source[methodStart] || '')) methodStart++;
  const methodMatch = source.slice(methodStart).match(/^\.(get|all|run)\s*\(/);
  if (!methodMatch) { cursor = prepareClose + 1; continue; }
  const argsOpen = methodStart + methodMatch[0].lastIndexOf('(');
  const argsClose = closingParen(source, argsOpen);
  const before = source.slice(Math.max(0, cursor - 8), cursor);
  if (!/await\s*$/.test(before)) replacements.push(cursor);
  cursor = argsClose + 1;
}
for (const index of replacements.reverse()) source = `${source.slice(0, index)}await ${source.slice(index)}`;
fs.writeFileSync(file, source);
