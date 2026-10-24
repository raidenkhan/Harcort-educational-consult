/**
 * FormData entry → trimmed string, or `undefined` when the input was absent
 * (a form control the current role never renders yields `null`) or empty.
 * `z.string().optional()` rejects `null` but accepts `undefined`, and an empty
 * `<input>` yields `""` — both must collapse here so an optional field the user
 * left blank can't fail validation.
 */
export function optionalText(value: FormDataEntryValue | null): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : undefined;
}

/**
 * FormData entry → plain string, never `null`.
 *
 * A REQUIRED field can still arrive as `null`: the control wasn't in the DOM
 * when the form posted (a form submitted before React hydrated, a browser
 * extension that dropped an input, a password manager calling `form.submit()`,
 * which skips `required` validation). Feeding that straight to a Zod
 * `z.string()` produces the developer message
 *
 *     Invalid input: expected string, received null
 *
 * which is what a real user ends up staring at. Collapsing it to `""` lets the
 * schema's own human message ("Enter a password", "Enter your full name") be
 * the one they see.
 */
export function formText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}
