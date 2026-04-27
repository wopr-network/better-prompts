/**
 * Operator-side rendering used by the UI's invoke handler. Same shape the
 * library uses internally for its own meta-prompt: handlebars `{{var}}` and
 * shell-style `${var}` placeholders both get substituted. Consumers using the
 * library outside this UI bring their own renderer; this is just a default
 * for the admin surface.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function render(body: string, vars: Record<string, string>): string {
  let out = body;
  for (const [k, v] of Object.entries(vars)) {
    const handlebars = new RegExp(`\\{\\{\\s*${escapeRegex(k)}\\s*\\}\\}`, "g");
    const dollar = new RegExp(`\\$\\{\\s*${escapeRegex(k)}\\s*\\}`, "g");
    out = out.replace(handlebars, v).replace(dollar, v);
  }
  return out;
}
