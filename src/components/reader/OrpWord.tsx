/**
 * OrpWord: render a word with a highlighted ORP character.
 * Placeholder file — we'll implement anchored alignment soon.
 */
export function OrpWord({ word, orpIndex }: { word: string; orpIndex: number }) {
  const left = word.slice(0, orpIndex);
  const mid = word[orpIndex] ?? "";
  const right = word.slice(orpIndex + 1);
  return (
    <span>
      {left}
      <span style={{ color: "#7a1f2b" }}>{mid}</span>
      {right}
    </span>
  );
}
