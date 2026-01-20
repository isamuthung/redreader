/**
 * Anchored ORP rendering:
 * - left side is right-aligned
 * - ORP letter sits at the anchor
 * - right side is left-aligned
 *
 * Responsive notes:
 * - We avoid fixed-width boxes so the word stays inside the container on mobile.
 * - Left/right sides can truncate with ellipsis for extremely long tokens.
 */
export function OrpWord({
  word,
  orpIndex,
  accentColor = "#7a1f2b",
}: {
  word: string;
  orpIndex: number;
  accentColor?: string;
}) {
  const left = word.slice(0, orpIndex);
  const mid = word[orpIndex] ?? "";
  const right = word.slice(orpIndex + 1);

  return (
    <span
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "baseline",
        columnGap: "0.08em",
        maxWidth: "100%",
      }}
    >
      <span
        style={{
          minWidth: 0,
          textAlign: "right",
          opacity: 0.95,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {left}
      </span>

      <span style={{ color: accentColor, padding: "0 0.05em", justifySelf: "center" }}>
        {mid}
      </span>

      <span
        style={{
          minWidth: 0,
          textAlign: "left",
          opacity: 0.95,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {right}
      </span>
    </span>
  );
}
