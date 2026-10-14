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
