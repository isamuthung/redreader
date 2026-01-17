export function normalizeText(input: string): string {
  // Placeholder: whitespace + unicode normalization will go here
  return input.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
}
