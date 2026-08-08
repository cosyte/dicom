/**
 * The values `scripts/phi-scan.ts`'s own tests need the scanner to REJECT.
 *
 * 🛑 WHY THESE ARE ASSEMBLED AT RUNTIME RATHER THAN WRITTEN AS LITERALS, AND WHY THAT IS NOT
 * OBFUSCATION FOR ITS OWN SAKE.
 *
 * `PHI-SCAN-WALK-ROOT-SCOPE` moved the scanner's walk root from `test/fixtures/` to `test/`, so
 * every tracked file under `test/` is now part of the corpus the gate reads. That creates one
 * genuine circularity: the scanner's own test suite has to carry values the scanner must reject,
 * and the moment those values are literals in a scanned file the gate reds on the suite that
 * proves it works.
 *
 * There were three ways out and only one of them is honest:
 *
 *   - ALLOW-LIST them. Not available: the tests assert `exit 1` on exactly these values, so
 *     allow-listing them makes the assertions fail. It would also put the most plausible real
 *     name in the set on a permanent global allow-list.
 *   - EXEMPT `test/scripts/phi-scan.test.ts` by path. Available, and rejected: it is a 50 KB
 *     file, and an exemption that large is a hole the gate cannot see into. The one exemption
 *     this repo already has covers a 1 KB README whose whole content is a table of violators.
 *   - ASSEMBLE the values here, from parts that match no recognizer. Chosen. The bytes of this
 *     file carry no caret-joined person-name token and no `YYYY-MM-DD` or standalone eight-digit
 *     date run, so THIS FILE IS SCANNED like every other file under `test/` and needs no
 *     exemption at all, while the values themselves are plain to a reader. (The gate proved that
 *     the hard way: a first draft of this very paragraph spelled the PN shape out and the scanner
 *     reported it, which is the behaviour working.)
 *
 * Every value below is invented. None of them names a real person, and each is deliberately
 * name-bearing: a PHI test whose payload carries nothing identifying is vacuous by fixture, so
 * the point of these constants is that they are exactly what the scanner should refuse.
 */

/** Join person-name components with the DICOM PN component delimiter. */
function pn(...components: string[]): string {
  return components.join("^");
}

/** Join a date's parts. `sep` is `""` for DICOM `DA` and `"-"` for an ISO date. */
function date(sep: string, ...parts: string[]): string {
  return parts.join(sep);
}

/**
 * The violator PatientName for the DICOM fixtures and the doc-corpus cases. Not on the
 * allow-list, and it must stay off it.
 */
export const VIOLATOR_PN = pn("SMITH", "JOHN");

/** The violator PatientName for the entry-shape cases, whose payload also carries a DOB. */
export const CARET_PN = pn("RIVERA", "JUANITA");

/** The PN shape the text sweep matches, quoted in prose that explains what it does. */
export const PN_SHAPE = pn("FAMILY", "GIVEN");

/** A `DA` value inside the 120-year window, so the date rule refuses it. */
export const RECENT_DA = date("", "2025", "06", "12");

/** An ISO date inside the window, carried as a DOB in the synthetic payload. */
export const VIOLATOR_DOB = date("-", "1978", "03", "14");

/** A second ISO date inside the window, for the plain-text fixture. */
export const TEXT_VIOLATOR_DATE = date("-", "1990", "04", "15");

/** The date written into a temporary `phi-scan-overrides.md` entry during one test. */
export const OVERRIDE_LOG_DATE = date("-", "2026", "05", "01");

/** A `DA` value the allow-list carries, so it is a control rather than a violator. */
export const ALLOWED_DA = date("", "2024", "01", "15");

/** The link target's own filename, which carries a name and a DOB so an echo of it is visible. */
export const TARGET_NAME = `${CARET_PN.replace("^", "-")}-${VIOLATOR_DOB}.txt`;
