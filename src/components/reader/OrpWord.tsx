/**
 * Anchored ORP rendering:
 * - left side is right-aligned inside a fixed box
 * - ORP letter sits at the anchor
 * - right side is left-aligned
 */
export function OrpWord({ word, orpIndex }: { word: string; orpIndex: number }) {
  const left = word.slice(0, orpIndex);
  const mid = word[orpIndex] ?? "";
  const right = word.slice(orpIndex + 1);

  // tweakable: wider box accommodates longer left halves
  const leftBoxCh = 12;

  return (
    <span style={{ display: "inline-flex", alignItems: "baseline" }}>
      <span
        style={{
          display: "inline-block",
          width: `${leftBoxCh}ch`,
          textAlign: "right",
          opacity: 0.95,
        }}
      >
        {left}
      </span>

      <span style={{ color: "#7a1f2b", padding: "0 0.05em" }}>{mid}</span>

      <span
        style={{
          display: "inline-block",
          width: `${leftBoxCh}ch`,
          textAlign: "left",
          opacity: 0.95,
        }}
      >
        {right}
      </span>
    </span>
  );
}
