import { normalizeText } from "./normalize";

// Tokenizer goals:
// - "Plain text" in, plain text tokens out (no information loss by default)
// - Preserve Unicode characters (smart quotes, en/em dashes, subscripts/superscripts)
// - Handle edge cases like 2024–2025, CO₂-equivalent, p < 0.05, (n = 1,048), “quoted.”
//
// Output is a list of display tokens (no whitespace tokens).
export function tokenizeText(input: string): string[] {
  const t = normalizeText(input);
  if (!t) return [];

  const tokens: string[] = [];
  const len = t.length;

  const isWs = (ch: string) => ch === " " || ch === "\n" || ch === "\t" || ch === "\r";
  const isAlphaNum = (ch: string) => /[\p{L}\p{N}\p{M}]/u.test(ch);
  const isDigit = (ch: string) => /\p{N}/u.test(ch);

  const OPENERS = new Set(["(", "[", "{", "<", "“", "‘", '"', "'"]);
  const CLOSERS = new Set([")", "]", "}", ">", "”", "’", '"', "'"]);

  const isHyphenLike = (ch: string) => ch === "-" || ch === "‑" || ch === "–"; // hyphen, non-breaking hyphen, en-dash
  const isAposLike = (ch: string) => ch === "'" || ch === "’";
  const isEmDash = (ch: string) => ch === "—";

  // Footnote-style markers often show up as superscripts or a plain digit right after a closer.
  const isFootnoteMarker = (ch: string) => /[¹²³⁴⁵⁶⁷⁸⁹⁰]/u.test(ch);

  let i = 0;
  while (i < len) {
    // skip whitespace
    while (i < len && isWs(t[i]!)) i++;
    if (i >= len) break;

    // Start token; attach leading openers directly to the next core (e.g., “The, (n, [see)
    let tok = "";
    while (i < len && OPENERS.has(t[i]!)) {
      tok += t[i]!;
      i++;
    }
    if (i >= len) {
      if (tok) tokens.push(tok);
      break;
    }

    // Core scan
    const startCore = i;

    // Prefix that should stay with the core for readability (e.g., ~12.7%)
    if (t[i] === "~" || t[i] === "+" || t[i] === "-" || t[i] === "±") {
      // Only attach if followed by a digit/letter (avoid eating separators)
      const next = t[i + 1];
      if (next && (isDigit(next) || isAlphaNum(next))) {
        tok += t[i]!;
        i++;
      }
    }

    // If the next char is a standalone em dash (or similar), emit as its own token
    // (this typically happens when there are spaces around it).
    if (isEmDash(t[i]!)) {
      tok += t[i]!;
      i++;
      tokens.push(tok);
      continue;
    }

    // Main loop: build a core token of word/number-ish characters plus joiners.
    while (i < len) {
      const ch = t[i]!;
      if (isWs(ch)) break;

      // Em dash breaks a token (methodology—while => "methodology—" + "while")
      if (isEmDash(ch)) break;

      // Keep letters/numbers/marks
      if (isAlphaNum(ch)) {
        tok += ch;
        i++;
        continue;
      }

      // Joiners inside tokens (apostrophes, hyphen/en-dash) if surrounded by alnum
      if (isAposLike(ch) || isHyphenLike(ch)) {
        const prev = tok.length > 0 ? tok[tok.length - 1] : "";
        const next = i + 1 < len ? t[i + 1]! : "";
        if (prev && next && isAlphaNum(prev) && isAlphaNum(next)) {
          tok += ch;
          i++;
          continue;
        }
        // Otherwise treat as a boundary
        break;
      }

      // Numeric glue: keep commas/decimals inside number runs (1,048 / 12.7 / 0.05)
      if (ch === "," || ch === ".") {
        const prev = tok.length > 0 ? tok[tok.length - 1] : "";
        const next = i + 1 < len ? t[i + 1]! : "";
        if (prev && next && isDigit(prev) && isDigit(next)) {
          tok += ch;
          i++;
          continue;
        }
        break;
      }

      // Comparators / equals: keep as standalone tokens (p < 0.05, μ = 0)
      // For readability, break before these symbols unless token is empty.
      if (ch === "<" || ch === ">" || ch === "=") break;

      // Everything else ends the core (punctuation will be handled as trailing/standalone)
      break;
    }

    // If we didn't consume anything for the core and no prefix/openers were added,
    // then the current char is punctuation/symbol; consume a minimal token.
    if (i === startCore && tok.length === 0) {
      tok = t[i]!;
      i++;
      tokens.push(tok);
      continue;
    }

    // Attach a single em dash to the end of the token if it's immediately next (no whitespace)
    if (i < len && isEmDash(t[i]!)) {
      tok += t[i]!;
      i++;
    }

    // Attach trailing punctuation/closers/footnote markers to the token (e.g., accepted., dependent.”, 1,048), skip.”)
    while (i < len) {
      const ch = t[i]!;
      if (isWs(ch)) break;

      // Always attach closers and common trailing punctuation to preserve "plain text" display tokens
      if (
        CLOSERS.has(ch) ||
        isFootnoteMarker(ch) ||
        /[.!?;,:%]/.test(ch) ||
        ch === "…" // ellipsis
      ) {
        tok += ch;
        i++;
        continue;
      }

      break;
    }

    if (tok) tokens.push(tok);
  }

  return tokens;
}
