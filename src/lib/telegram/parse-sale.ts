/**
 * Pure parser for the `/sale <phone> <amount>` Telegram command (+ aliases
 * /close /won /deal). Kept in its own module — free of any DB import — so it
 * can be unit-tested without a live database connection.
 */
export function parseSaleCommand(
  text: string
): { phone: string; amount: number } | null {
  // Accept: /sale 0123456789 25000 | /close +60123456789 RM25,000.50
  const m = text
    .trim()
    .match(/^\/(?:sale|close|won|deal)\s+(\S+)\s+(.+)$/i);
  if (!m) return null;
  const phone = m[1];
  const amount = Number(m[2].replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { phone, amount };
}
