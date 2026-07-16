import { useMutation } from "@tanstack/react-query";
import { ScanEye } from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { TONE_LABELS, TONE_STARTERS } from "@/lib/constants";
import { PROMPT_TONES } from "@/lib/types";

export interface CurationStyleValue {
  tone: string;
  guidance: string;
  template: string;
}

/**
 * One box, not three. The old UI split style into a `tone` preset, a `guidance` note, and an
 * "advanced" full-prompt `template` — which read as duplicate boxes for the same thing. Now there's a
 * single "Instructions" box (stored as `guidance`, which is layered on top of the built-in prompt so
 * the safety rules always survive), and the tone buttons are quick-fills that drop editable starter
 * text into it. `tone`/`template` are no longer set from here (always sent empty).
 */
export function CurationStyleFields({
  value,
  onChange,
  allowInherit = false,
}: {
  value: CurationStyleValue;
  onChange: (next: CurationStyleValue) => void;
  /** Per-person overrides: an empty box means "inherit the row/global style". Shown as a hint. */
  allowInherit?: boolean;
}) {
  const instructionsId = useId();
  const preview = useMutation({ mutationFn: () => api.previewPrompt(value) });

  // Everything the user types lives in `guidance`; tone/template stay empty so the one box is the
  // whole story (the built-in prompt + its safety rules are always applied underneath it).
  const setInstructions = (guidance: string) =>
    onChange({ tone: "", template: "", guidance });

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Quick styles</legend>
        <p className="text-sm text-muted-foreground">
          Tap one to fill the box below with a starting point, then edit it
          however you like.
        </p>
        <div className="flex flex-wrap gap-2">
          {PROMPT_TONES.filter((tone) => tone !== "balanced").map((tone) => (
            <Button
              key={tone}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setInstructions(TONE_STARTERS[tone] ?? "")}
            >
              {TONE_LABELS[tone] ?? tone}
            </Button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor={instructionsId}>
          Instructions for the AI (optional)
        </Label>
        <Textarea
          id={instructionsId}
          value={value.guidance}
          placeholder="e.g. Prefer hidden gems over blockbusters. Keep the reasons family-friendly."
          onChange={(event) => setInstructions(event.target.value)}
        />
        <p className="text-sm text-muted-foreground">
          {allowInherit
            ? "Leave blank to use this row’s style. Anything here overrides it just for this person."
            : "Plain-English notes for the AI, added on top of the built-in prompt. It can only ever suggest titles already in your library."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={preview.isPending}
          onClick={() => preview.mutate()}
        >
          {!preview.isPending && <ScanEye aria-hidden="true" />}
          Preview prompt
        </Button>
      </div>
      {preview.isSuccess && (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border bg-card p-3 text-xs text-muted-foreground">
          {preview.data.system}
        </pre>
      )}
      {preview.isError && (
        <p role="alert" className="text-sm text-destructive">
          Couldn’t build the preview. Check the instructions and try again.
        </p>
      )}
    </div>
  );
}
