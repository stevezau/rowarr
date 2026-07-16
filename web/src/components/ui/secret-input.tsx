import type { InputHTMLAttributes } from "react";

import { Input } from "@/components/ui/input";

/** A saved secret always reads back as these dots — never the real value. Shared by every field
 *  that edits an at-rest secret (Connections cards, inline key fields, the OMDb key). */
export const REDACTED = "•••••";

/**
 * Whether a secret field's current value must NOT be sent on save. A value left as the redacted
 * sentinel (the saved key showing as dots) or blank means "no change" — sending either would be a
 * write, not a no-op: the sentinel would be stored verbatim AS the key, and a blank would wipe the
 * saved key just for focusing the box. Clearing a secret is done deliberately (a Clear button), not
 * by leaving the field empty.
 */
export function isSecretUnchanged(value: string): boolean {
  return value === REDACTED || value === "";
}

/**
 * A controlled password input with the shared redacted-sentinel behaviour: focusing clears the dots
 * so a new secret is typed clean (otherwise the caret lands after them and the key becomes
 * "•••••abc"), and blurring an untouched field restores the dots so it's clear the saved secret is
 * still there. The parent owns the value, so this fits both single-field and larger-form call sites.
 */
export function SecretInput({
  value,
  onChange,
  saved,
  ...inputProps
}: {
  value: string;
  onChange: (value: string) => void;
  /** True when a secret is already stored (its value reads back as the redacted sentinel), so
   *  blurring an untouched field restores the dots rather than showing empty. */
  saved: boolean;
} & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "onFocus" | "onBlur" | "type"
>) {
  return (
    <Input
      {...inputProps}
      type="password"
      value={value}
      onFocus={(e) => {
        if (e.target.value === REDACTED) onChange("");
      }}
      onBlur={() => {
        if (value === "" && saved) onChange(REDACTED);
      }}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
