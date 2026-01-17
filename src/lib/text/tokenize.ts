import { normalizeText } from "./normalize";

export function tokenizeText(input: string): string[] {
  const t = normalizeText(input);
  if (!t) return [];
  return t.split(" ");
}
