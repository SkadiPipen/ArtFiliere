export type ChangeSpan = { kind: 'same' | 'removed' | 'added'; text: string };

/** Inline word edits, retaining punctuation and whitespace without duplicating text. */
export function inlineChanges(before: string, after: string): ChangeSpan[] {
  const old = before.match(/\s+|\S+/g) || [], next = after.match(/\s+|\S+/g) || [];
  let start = 0, end = 0;
  while (start < old.length && start < next.length && old[start] === next[start]) start++;
  while (end < old.length - start && end < next.length - start && old[old.length - 1 - end] === next[next.length - 1 - end]) end++;
  const left = old.slice(start, old.length - end), right = next.slice(start, next.length - end);
  const spans: ChangeSpan[] = [];
  const push = (kind: ChangeSpan['kind'], text: string) => {
    if (!text) return;
    const last = spans[spans.length - 1];
    if (last?.kind === kind) last.text += text;
    else spans.push({ kind, text });
  };
  push('same', old.slice(0, start).join(''));
  if (left.length * right.length > 40000) {
    push('removed', left.join('')); push('added', right.join(''));
  } else {
    const table = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1));
    for (let i = left.length - 1; i >= 0; i--) for (let j = right.length - 1; j >= 0; j--) {
      table[i][j] = left[i] === right[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
    let i = 0, j = 0;
    while (i < left.length || j < right.length) {
      if (i < left.length && j < right.length && left[i] === right[j]) { push('same', left[i++]); j++; }
      else if (i < left.length && (j === right.length || table[i + 1][j] >= table[i][j + 1])) push('removed', left[i++]);
      else push('added', right[j++]);
    }
  }
  push('same', end ? old.slice(old.length - end).join('') : '');
  return spans;
}

/** For long terms, only show changed lines; full attempt terms remain in history. */
export function compactChanges(before: string, after: string): ChangeSpan[][] {
  if (!before.includes('\n') && !after.includes('\n')) return [inlineChanges(before, after)];
  const old = before.split('\n'), next = after.split('\n');
  if (old.length * next.length > 40000) return [inlineChanges(before, after)];
  const table = Array.from({ length: old.length + 1 }, () => new Uint16Array(next.length + 1));
  for (let i = old.length - 1; i >= 0; i--) for (let j = next.length - 1; j >= 0; j--) table[i][j] = old[i] === next[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const result: ChangeSpan[][] = [];
  let removed: string[] = [], added: string[] = [], i = 0, j = 0;
  const flush = () => { if (removed.length || added.length) result.push(inlineChanges(removed.join('\n'), added.join('\n'))); removed = []; added = []; };
  while (i < old.length || j < next.length) {
    if (i < old.length && j < next.length && old[i] === next[j]) { flush(); i++; j++; }
    else if (i < old.length && (j === next.length || table[i + 1][j] >= table[i][j + 1])) removed.push(old[i++]);
    else added.push(next[j++]);
  }
  flush();
  return result;
}
