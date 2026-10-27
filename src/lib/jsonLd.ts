/**
 * Serialising structured data for a `<script type="application/ld+json">`.
 *
 * `JSON.stringify` alone is NOT safe to drop into HTML. The HTML tokenizer
 * ends a script element at the first `</script` it sees, *inside the JSON
 * string as well*, so a tutor whose bio contains
 *
 *     </script><img src=x onerror=alert(document.cookie)>
 *
 * closes the JSON-LD block and the rest is parsed as markup — a stored XSS on
 * a public page (the directory lists every approved tutor). `dangerouslySetInnerHTML`
 * is required for the script tag, and React does not sanitise its value.
 *
 * The fix is the usual one: JSON's `\uXXXX` escapes are valid inside JSON
 * strings and decode back to the same characters, so escaping the characters
 * that matter for the HTML parser makes the payload inert without changing
 * what a crawler reads. `&` is included because it starts a character
 * reference, and U+2028/U+2029 because they are line terminators in
 * JavaScript contexts.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
