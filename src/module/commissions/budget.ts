/** Parse a PHP amount without silently accepting malformed grouping or text. */
export function parseProposedBudget(input: string): string | null {
  const value = input.trim().replace(/^(?:PHP\s*|₱\s*)/i, '');
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value)) return null;
  const amount = Number(value.replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 9999999999.99) return null;
  return amount.toFixed(2);
}
