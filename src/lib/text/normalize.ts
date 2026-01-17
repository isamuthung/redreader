export function normalizeText(input: string): string {
  // Keep "plain text" semantics while making whitespace predictable.
  // Use NFC (not NFKC) to avoid changing meaning of some scientific glyphs.
  const n = (input ?? "").normalize("NFC");

  // Normalize common whitespace variants to regular spaces, but preserve all other chars.
  return n
    .replace(/\u00A0/g, " ") // NBSP
    .replace(/\u2009/g, " ") // thin space
    .replace(/\u202F/g, " ") // narrow no-break space
    .replace(/\s+/g, " ")
    .trim();
}
