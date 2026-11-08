/**
 * Trims of the padding a DICOM string value can carry, each linear in the
 * value's length.
 *
 * A file chooses how long a value is, so each trim here scans in from an end
 * once instead of using a regular expression such as `/^ +| +$/g`, `/[\0 ]+$/`
 * or `/\0+$/`. Each of those retries its match from every position in a run of
 * pad characters, so a long run followed by any other character costs time
 * quadratic in the run's length: seconds for one value of 100,000 characters.
 *
 * Each helper returns exactly what the expression it replaces returned.
 *
 * @module
 */

const NULL = 0x00;
const SPACE = 0x20;

/**
 * `value` less its leading and trailing SPACE (`0x20`), the result of
 * `value.replace(/^ +| +$/g, "")`.
 *
 * @internal
 */
export function trimSpaces(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value.charCodeAt(start) === SPACE) start++;
  while (end > start && value.charCodeAt(end - 1) === SPACE) end--;
  return value.slice(start, end);
}

/**
 * `value` less its trailing NULL (`0x00`) and SPACE (`0x20`) in any mix, the
 * result of `value.replace(/[\0 ]+$/, "")`.
 *
 * @internal
 */
export function trimTrailingNullsAndSpaces(value: string): string {
  let end = value.length;
  while (end > 0) {
    const code = value.charCodeAt(end - 1);
    if (code !== NULL && code !== SPACE) break;
    end--;
  }
  return value.slice(0, end);
}

/**
 * `value` less its trailing NULL (`0x00`), the result of
 * `value.replace(/\0+$/, "")`.
 *
 * @internal
 */
export function trimTrailingNulls(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === NULL) end--;
  return value.slice(0, end);
}
