/**
 * Mask a phone/mobile string so middle digits are hidden.
 *   "9876543210"  -> "98xxxxxx10"
 *   "+91 9876543210" -> "98xxxxxx10"
 *   null / short → ""
 */
export function maskMobile(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 6) return "";
  const tail = digits.slice(-10);
  if (tail.length < 6) return "";
  const first = tail.slice(0, 2);
  const last = tail.slice(-2);
  const middle = "x".repeat(Math.max(0, tail.length - 4));
  return `${first}${middle}${last}`;
}
