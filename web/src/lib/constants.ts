/** The row-size presets offered wherever a row length is chosen (settings, rows, wizard). */
export const ROW_SIZES = [10, 15, 20] as const;

/**
 * The seeded "Picked for You" row. Its name, size and curation style come from the global Settings
 * (the server drops its stored recipe — see ContextBuilder._build_rows), so the UI must neither
 * offer nor advertise per-row versions of those three on it. Its sources, libraries and audience
 * ARE its own, like any other row.
 */
export const DEFAULT_ROW_SLUG = "picked";

/** Display names for the curation tones (`PROMPT_TONES`), shared by the editor and the row list. */
export const TONE_LABELS: Record<string, string> = {
  balanced: "Balanced",
  warm: "Warm",
  concise: "Concise",
  cinephile: "Cinephile",
  playful: "Playful",
};
