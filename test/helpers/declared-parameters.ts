/**
 * Read a function's DECLARED parameter list off its own source text.
 *
 * Shared by `test/parser/fatals.test.ts` and
 * `test/integration/fatal-diagnostic-surface.test.ts`, which both pin the
 * `DICOM-DIAGNOSTIC-PHI-RESIDUALS` bound that a fatal factory accepts no slot
 * for a wire-derived number. It lives here rather than being copied into both
 * because a copied detector goes stale on one side and reads clean there.
 *
 * @module
 */

/**
 * The declared parameter list of `fn`, read off its own source text.
 *
 * **`Function.prototype.length` is not this, and the difference is what the
 * arity pin below was measuring by accident.** `length` counts parameters
 * *before the first one with a default value or a rest element*, so
 * `(frame, offset, remaining = 0)` reports `2` - exactly what the pin asserts
 * for a factory that takes no third parameter at all. A pin that cannot tell
 * those two apart does not pin what it claims. {@link controlWithDefault} and
 * {@link controlWithRest} are the positives that prove this reader can.
 *
 * Only top-level commas split, so a defaulted parameter carrying a call or an
 * object literal still counts as one. A source text this cannot find a balanced
 * parameter list in throws rather than returning an empty list, because a
 * silently empty list would read as "no parameters" - a clean result that is a
 * gap.
 */
export function declaredParameters(fn: (...args: never[]) => unknown): readonly string[] {
  const src = fn.toString();
  const open = src.indexOf("(");
  if (open < 0) throw new Error(`declaredParameters: no parameter list in ${src.slice(0, 60)}`);
  let depth = 0;
  let close = -1;
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "]" || ch === "}") {
      depth -= 1;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close < 0) throw new Error(`declaredParameters: unbalanced parameter list in ${src}`);
  const inner = src.slice(open + 1, close);
  const params: string[] = [];
  let current = "";
  depth = 0;
  for (const ch of inner) {
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "]" || ch === "}") depth -= 1;
    if (ch === "," && depth === 0) {
      params.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim().length > 0) params.push(current.trim());
  return params;
}

/**
 * A non-vacuity control for {@link declaredParameters}: a defaulted parameter
 * stops `Function.prototype.length` counting, so `length` reads `2` here while
 * the declared list has three. Pinning a clean result beside this positive is
 * what stops a green arity row meaning "the reader is broken".
 */
export function controlWithDefault(a: number, b: number, c = 0): number {
  return a + b + c;
}

/** The same, for a rest element: `length` reads `1` and the declared list has two. */
export function controlWithRest(a: number, ...more: readonly number[]): number {
  return a + more.length;
}

/**
 * A value that is typed like a function {@link declaredParameters} accepts and
 * whose source text has no parameter list, so the "fails loudly rather than
 * returning an empty list" branch is exercised without an `as never` cast.
 */
export const controlWithNoParameterList = Object.assign((): number => 0, {
  toString: (): string => "not a function",
});
