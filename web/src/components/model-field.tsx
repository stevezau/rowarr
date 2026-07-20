import { useState } from "react";

import { Input } from "@/components/ui/input";

const CUSTOM_MODEL = "__custom__";

/**
 * The AI curator "model" picker: a real dropdown of the provider's available models, plus a
 * "Custom…" option that reveals a free-text box — so the owner can pick a known model OR type any id
 * to override. The current value is always offered as an option so it is never hidden while the list
 * loads (or when it's a custom id the provider doesn't list). Shared by the settings card and the
 * setup wizard so both behave identically.
 */
export function ModelField({
  id,
  value,
  placeholder,
  models,
  loading,
  onChange,
}: {
  id: string;
  value: string;
  placeholder?: string;
  models: string[];
  loading: boolean;
  onChange: (value: string) => void;
}) {
  const [custom, setCustom] = useState(false);
  const options =
    value && !models.includes(value) ? [value, ...models] : models;
  return (
    <div className="space-y-2">
      <select
        id={id}
        value={custom ? CUSTOM_MODEL : value}
        onChange={(e) => {
          const next = e.target.value;
          if (next === CUSTOM_MODEL) {
            setCustom(true);
          } else {
            setCustom(false);
            onChange(next);
          }
        }}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="">
          {loading ? "Loading models…" : "Sensible default"}
        </option>
        {options.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
        <option value={CUSTOM_MODEL}>Custom…</option>
      </select>
      {custom && (
        <Input
          type="text"
          aria-label="Custom model id"
          // Focus the box the user just revealed by choosing "Custom…".
          autoFocus
          placeholder={placeholder ?? "e.g. claude-sonnet-5"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      <p className="text-xs text-muted-foreground">
        Pick a model, or choose “Custom…” to type any model id. Blank = a
        sensible default.
      </p>
    </div>
  );
}
