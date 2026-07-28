#!/usr/bin/env bash
# scripts/check-no-emdash.sh
# Brand rule (founder directive, 2026-07-24): cosyte never uses the em dash.
# The em dash (U+2014) reads as an AI tell, so it is banned outright across
# every cosyte surface. Source of truth: `knowledgebase/06-brand/voice-and-tone.md`
# ("No em dashes. Ever."), which names commit messages explicitly.
#
# Ported into dicom on 2026-07-27 from ncpdp (PR #34, `39212bb`), NOT from the older
# knowledgebase copy. ncpdp's is knowledgebase's TEXT-ONLY shape plus fixes for two
# routes by which the older copies still print OK without reading their input (the `-`
# operand and `-d skip`, both described in the pipeline notes below). Starting from
# knowledgebase / hl7 / fhir / x12 would have inherited both holes.
#
# Measured byte-level over all 178 tracked files before the port:
#   * ONE file holds a NUL byte, `src/dataset/vr/charset.ts`. See the section below.
#   * ZERO tracked files fail to decode as UTF-8.
#   * FOUR tracked files carried a literal em dash, and this slice removed all six
#     occurrences: `.github/CODEOWNERS` (2), `.github/workflows/release.yml` (2),
#     `package.json` (the npm `description`, 1), `vendor/nema/SHA.txt` (1). None is
#     markdown, which is why an earlier markdown-only measurement (0 of 25 `.md`
#     files) read this repo as already clean. It was not. The scan covers every
#     tracked file, so measure every tracked file.
#   * No encoded form (`%E2%80%94`, the JS escape, or the three HTML entities) appears
#     anywhere in the tree.
#
# Do NOT swap in the website copy. That one partitions on the NUL byte to tolerate
# tracked rasters, and here it would be actively wrong: it would silently exempt
# `src/dataset/vr/charset.ts`, first-party TypeScript, from the ban. pathways' preferred
# `git check-attr binary` partition is also not available, because this repo declares
# nothing in `.gitattributes`; adding a declaration is deferred to the cross-repo
# "what is a text file" rule and is deliberately not done here.
#
# The fix is never to re-encode the character: rewrite the sentence with a
# period, a colon, a comma, or parentheses.
#
# Two modes:
#   check-no-emdash.sh                 scan every tracked file
#   check-no-emdash.sh --stdin LABEL   scan text on stdin (CI feeds it the PR
#                                      title, body, and commit messages: the
#                                      voice rule names commit messages, and a
#                                      commit-message em dash is the near-miss
#                                      that prompted the gate in knowledgebase)
#
# Note: this script itself is excluded from the tracked-file scan (it necessarily
# names the encodings it bans). It matches by codepoint and by encoding, so it
# never contains the literal character.
#
# ---------------------------------------------------------------------------
# THE NUL-BEARING SOURCE FILE, which is the one thing specific to dicom and the reason
# this port was wrongly believed impossible for a day. State it plainly, because the
# whole question is what the gate does rather than what it is assumed to do.
#
# `src/dataset/vr/charset.ts` carries a literal NUL inside `/[\x00 ]+$/u`, the regex that
# strips DICOM's own NUL padding from string values. The byte IS the feature and cannot be
# removed. GNU grep therefore classifies that file as binary. It holds ZERO em dashes today,
# in any form, so it scans clean and this gate is green over it. That is the whole of the
# supposed blocker: the red would come from a MATCH, never from the NUL.
#
# What happens if someone later adds one, MEASURED with GNU grep 3.8 rather than reasoned:
# grep exits 0 (it did match), writes NOTHING to stdout, and writes
# `grep: ./src/dataset/vr/charset.ts: binary file matches` to STDERR. So the hit never
# reaches `$HITS`, and `fail_with_hits` never fires. `refuse_if_incomplete` catches it off
# the stderr capture instead, and THE GATE GOES RED. Verified end to end against a seeded
# copy of this repo's real file, not against a synthetic stand-in.
#
# Two properties of that worth keeping in mind:
#   * It fails closed by a DIFFERENT route than an ordinary hit, so the diagnostic below
#     names the case explicitly. Without that the run reds saying "the scan did not read
#     all of its input", which sends a reader hunting an I/O failure that never happened.
#     The branch is a message only: it cannot turn a red into a green, and if grep's
#     wording ever changes the run still reds through the generic path.
#   * On GNU grep older than 3.5 the same diagnostic went to STDOUT instead. That lands in
#     `$HITS` and reds through `fail_with_hits`. Both vintages red; only the message differs.
# ---------------------------------------------------------------------------
# DISCLOSED RESIDUALS. These are inherited from the shared shape knowingly. They
# are ONE cross-repo fix across the copies (knowledgebase, hl7, fhir, pathways, x12,
# ncpdp, and now this one), not one fix per repo, so they are not fixed here. Do not
# patch them in this copy alone: a divergent variant is worse than a known shared limit.
#
#   (i)  A tracked TEXT file holding a NUL is classified binary by grep. Under this shape
#        that is fail-CLOSED (see the section above), which is exactly why this shape and
#        not website's is the right one for this repo. The property that remains unsolved
#        across the whole ecosystem: the shape cannot tell "binary asset" from "text file
#        that gained a NUL", and this repo cannot either, because it declares nothing in
#        `.gitattributes`. dicom simply has no binary assets, so the ambiguity costs it
#        nothing today. A future vendored raster would make it bite, and the answer then is
#        the `.gitattributes` declaration, not website's byte heuristic.
#   (ii) Encoded-form matching is LITERAL: case-sensitive, and the HTML entities
#        require the semicolon. So `%e2%80%94` (lowercase), `&#X2014;` (capital X),
#        `&#x2014` (no semicolon) and `&#08212;` (zero-padded) all pass this gate.
#        The literal UTF-8 character, the canonical URL encoding, the JS escape, and
#        the three canonical entities are what is caught. Widening the pattern is the
#        cross-repo fix, not a local one.
#  (iii) Stderr capture binds only to the LAST stage of the pipeline, the scanning
#        grep. It does NOT bind to the `grep -zvxF` self-exclusion filter or the
#        `sed -z` prefixer ahead of it. The consequence, stated plainly because it is the
#        failure this gate exists to refuse: if either earlier stage dies, its stderr is
#        not routed to ERRLOG, `refuse_if_incomplete` does not fire, and THE GATE PRINTS
#        OK AND EXITS 0 over a tree that may hold a live character. Inherited from ncpdp,
#        where it was measured with stub `grep` and `sed` binaries.
#        `sed -z` is GNU-only and, unlike `grep -P`, has no self-test. That does not bite
#        on `ubuntu-latest` or in the standard dev container (GNU sed and GNU grep 3.8 are
#        both present, checked). It DOES bite on the documented Homebrew `gnubin` setup
#        (GNU grep on PATH, BSD sed): the `grep -qP` self-test passes, `sed -z` is then
#        rejected, and the gate prints OK over a live character. That is a real invocation
#        site, since `pnpm check:no-emdash` and the meta-repo `verify.sh` ladder both run
#        this locally. The shared fix is to bind the stderr capture to the whole pipeline,
#        or to self-test `sed -z` the way `grep -P` is self-tested.
#   (iv) The scan reads file CONTENTS only, never file NAMES. A tracked path that
#        itself carries an em dash passes green as long as its contents are clean.
#        A filename is a cosyte surface and the ban says "ever", so this is a real gap
#        rather than a scoping choice, but closing it widens what every copy of this gate
#        covers and so belongs in the same cross-repo pass as (i) to (iii).
#
#   Also worth knowing: GNU grep 3.8 classifies a file as binary on ANY encoding
#   error, not only on a NUL byte. See the KNOWN LIMIT note further down for what
#   that means for a fixture deliberately encoded in a legacy charset.
# ---------------------------------------------------------------------------
set -euo pipefail

# LOCALE PIN, load-bearing. `grep -P` compiles `\x{NNNN}` as a Unicode codepoint only
# in PCRE's UTF-8 mode, which GNU grep enables from the locale. Under LC_CTYPE=POSIX
# (a bare container, cron, `sh -c`, any shell that inherits no locale) GNU grep 3.8
# instead ABORTS with "character code point value in \x{} or \o{} is too large".
# An earlier version of this gate discarded that on stderr and `|| true`d the
# pipeline, so it printed OK having scanned nothing. Do not remove the pin, and do
# not restore the stderr redirect.
#
# The pin cannot be traded for a raw-byte pattern: `\xe2\x80\x94` matches the em dash
# under POSIX but NOT under a UTF-8 locale, where PCRE reads it as three characters.
# One pattern cannot cover both, so the locale is fixed and the pattern follows it.
#
# It also pins grep's DIAGNOSTIC MESSAGES to English, which the binary-match branch in
# refuse_if_incomplete reads. That branch is a message refinement only, so a locale that
# somehow escaped this pin would cost a clear diagnostic, never the red.
export LC_ALL=C.UTF-8

# Matches U+2014 as the literal character and as its encodings: %E2%80%94 (URL),
# the JS backslash-u escape, and the &mdash; / &#8212; / &#x2014; HTML entities.
# See residual (ii) above for exactly which near-misses this does NOT catch.
PATTERN='\x{2014}|%E2%80%94|\\u2014|&mdash;|&#8212;|&#x2014;'

# SELF-TEST: prove the scanner can still see what it is meant to catch before any
# clean result is believed. `printf` emits U+2014 as its UTF-8 bytes, so this file
# still never contains the literal character.
if ! printf 'a\xe2\x80\x94b\n' | grep -qP "$PATTERN"; then
  echo "ERROR: check-no-emdash - the scanner cannot match a known em dash." >&2
  echo "       grep -P is unavailable or not in UTF-8 mode (LC_ALL=${LC_ALL})." >&2
  echo "       Refusing to report a clean tree on a scanner that cannot see." >&2
  exit 1
fi

fail_with_hits() {
  local what="$1" hits="$2"
  echo "$hits" >&2
  echo "" >&2
  echo "ERROR: check-no-emdash - em dash (U+2014, or an encoded form) found in ${what}." >&2
  echo "       cosyte never uses em dashes (founder directive; 06-brand/voice-and-tone.md)." >&2
  echo "       Rewrite with a period, colon, comma, or parentheses." >&2
  exit 1
}

# Anything the scanner writes to stderr means either that it did not read everything it
# was given, or that it matched inside a file it classifies as binary. Neither may print
# OK, and exit status cannot carry either signal: grep exits 1 on "no match", which xargs
# in turn reports as 123, so "clean" and "died part way through the batch" are
# indistinguishable by code, while a binary match exits 0 with empty stdout.
ERRLOG=$(mktemp)
FILELIST=$(mktemp)
SCANLIST=$(mktemp)
trap 'rm -f "$ERRLOG" "$FILELIST" "$SCANLIST"' EXIT

refuse_if_incomplete() {
  [ -s "$ERRLOG" ] || return 0
  cat "$ERRLOG" >&2
  echo "" >&2
  # dicom tracks one NUL-bearing first-party source file (see the header), so the
  # binary-match case is a live possibility here rather than a hypothetical. Name it,
  # because otherwise a real brand violation reds with an I/O-failure message and the
  # reader goes looking for a disk problem that does not exist. This branch only chooses
  # the wording: every path below exits 1.
  if grep -qi 'binary file' "$ERRLOG"; then
    echo "ERROR: check-no-emdash - the input named above MATCHED the banned pattern, but grep" >&2
    echo "       classifies it as binary (it holds a NUL byte or invalid UTF-8), so the hit" >&2
    echo "       is reported without a line number. Treat it as a real em dash." >&2
    echo "       cosyte never uses em dashes (founder directive; 06-brand/voice-and-tone.md)." >&2
    echo "       Rewrite with a period, colon, comma, or parentheses." >&2
    # Only when grep actually named that file. In --stdin mode grep says
    # "(standard input): binary file matches", and pointing a PR-body failure at a
    # source file nobody touched is the same kind of misdirection this branch exists
    # to remove.
    if grep -q 'charset\.ts' "$ERRLOG"; then
      echo "       The NUL in src/dataset/vr/charset.ts is functional (it is DICOM's own" >&2
      echo "       padding) and must NOT be removed to silence this. Remove the em dash." >&2
    fi
  fi
  if grep -qiv 'binary file' "$ERRLOG"; then
    echo "ERROR: check-no-emdash - the scan reported errors, so it did not read all of" >&2
    echo "       its input. Refusing to report green from an incomplete scan." >&2
  fi
  exit 1
}

# ---- stdin mode: text that is not a file (commit messages, PR title and body) ----
if [ "${1:-}" = "--stdin" ]; then
  LABEL="${2:-stdin}"
  HITS=$(grep -nP -e "$PATTERN" - 2>>"$ERRLOG" || true)
  refuse_if_incomplete
  [ -n "$HITS" ] && fail_with_hits "$LABEL" "$HITS"
  echo "check-no-emdash: OK (no em dashes in ${LABEL})"
  exit 0
fi

# ---- default mode: every tracked file ----
#
# `git ls-files` is relative to the working directory, so from a subdirectory it
# lists a subtree and the scan would report OK having skipped the rest of the repo.
# Anchor at the top level, which also keeps the self-exclusion path below correct.
cd "$(git rev-parse --show-toplevel)"

# The choices below each close a route by which the scan could report green without
# having actually read its input, because a gate that prints OK when it did not read
# its input is worse than no gate at all. Each was checked RED in this repo, with a
# seeded fixture per route, before the port landed.
#
# This list is NOT a claim of exhaustiveness. The `-` operand below was found by a
# refuter against a copy whose own comment implied it was already closed. Treat this as
# the routes that are known and closed, not as proof that no other exists.
#
#   -0 -r on xargs, fed by `git ls-files -z`: -r drops the grep invocation entirely
#   when the file list is empty (without it, grep falls back to reading stdin and
#   prints OK), and the NUL separator is what makes the list verbatim. Unseparated,
#   `git ls-files` C-quotes any path holding a space, a quote, or a non-ASCII byte,
#   and grep is then handed a name no file has. dicom's tree is ASCII today, but a
#   C-quoted path is one `git add` away.
#
#   the file list is built as its own command, not as the head of the pipeline, so a
#   `git ls-files` that fails (an unreadable or corrupt index) stops the run. Piped,
#   its status is erased by the `|| true` the no-match case needs, and the scan would
#   report OK over an empty list. An empty list is refused for the same reason.
#
#   -e before the pattern and -- after the file list, so neither a pattern nor a
#   tracked filename that starts with a dash is read as a grep option. A file named
#   `-q` would otherwise silence the whole batch and the gate would print OK.
#
#   `sed -z 's|^|./|'` prefixes every path, which is what actually closes the dash
#   family. `--` alone does NOT: it stops `-` being parsed as an OPTION, but grep then
#   reads the bare operand `-` as STANDARD INPUT, and xargs points its child's stdin at
#   /dev/null. A tracked file literally named `-` (a `cmd > -` typo, which `git add -A`
#   stages without complaint) is therefore never opened, and the gate printed OK and
#   exited 0 over a live em dash. Checked RED here before the port, not inherited on faith.
#   The prefix is applied AFTER the self-exclusion filter below, so that filter still
#   compares against the plain repo-relative path.
#
#   -H so every hit carries its filename. grep omits the name when it is handed exactly
#   one file, which an xargs batch boundary can produce, and an unattributable hit in a
#   red build is a worse report for no saving.
#
#   NO -d skip. It is the one fail-OPEN flag the older copies of this shape still carry:
#   with it, a tracked symlink to a directory is skipped silently (no stderr, so
#   refuse_if_incomplete never fires and the gate goes green). Without it grep says
#   "Is a directory" on stderr and the run goes red. dicom tracks no plain directories,
#   so dropping it costs nothing and fails closed instead of open. One caveat for whoever
#   changes this: a tracked GITLINK (mode 160000, a submodule) also presents as a
#   directory, so without `-d skip` a repo with a submodule goes hard red. dicom has none
#   (checked: `git ls-files -s` lists no 160000 entry). A consumer that does have one
#   needs the gitlinks filtered out of the list, not `-d skip` restored, which would
#   reopen the symlink hole.
#
#   no -I: -I skips any file grep reads as binary, which includes a text file holding
#   invalid UTF-8 AND `src/dataset/vr/charset.ts`, whose NUL is functional. With -I, an em
#   dash added to that file would be skipped in silence. Without it the same edit reds
#   through the stderr capture (measured; see the header). This is the single most
#   load-bearing flag choice in the file for THIS repo. Fail closed, not open.
#
#   KNOWN LIMIT, stated because dicom is a parser repo where it is plausible. The pattern
#   matches U+2014 as UTF-8 and as the five textual encodings listed with it. It does NOT
#   match an em dash encoded in some other charset, and DICOM `(0008,0005)` Specific
#   Character Set fixtures in ISO-IR 100 / CP1252 or a JIS / GB18030 charset are exactly
#   the kind of grounded test data this repo exists to carry. Measured, not assumed: such
#   a file scans clean and this gate stays GREEN. There is none today (all 178 tracked
#   files decode as UTF-8). The -I discussion above does not rescue it: GNU grep 3.8 DOES
#   classify such a file as binary (any encoding error is enough, a NUL is not required),
#   but it only surfaces that as the "binary file matches" diagnostic when the pattern
#   actually matches, and a pattern written in UTF-8 never matches a bare CP1252 0x97. So
#   nothing reaches refuse_if_incomplete and the run stays quiet. This is not a wholesale
#   skip of mixed-encoding files, though: a UTF-8 em dash on another line of the same file
#   is still caught normally, and that case DOES go red.
#   This is accepted rather than fixed: the ban is a rule about prose that people write,
#   and fixture bytes are grounded data, not brand copy. If a legacy-charset fixture ever
#   lands, a reviewer covers it, not this script. Do not widen the pattern to chase it,
#   and do not re-add -I.
#
#   The vendored-document filter is a SECOND `grep -zvP` stage between the self-exclusion
#   and `xargs`. It is unbound on the failure side by nature -- a pattern that matched
#   everything would empty the list -- so it is followed by an explicit count check that
#   refuses when nothing is left to scan, and the surviving/total counts are printed.
#
#   stderr is captured and any of it fails the run (see refuse_if_incomplete above).
#
# The one file the scan does not cover is this script, which has to name the encodings
# it bans. Nothing checks the checker, so keep it free of the literal character: it
# matches by codepoint and by encoding and never spells one out.
git ls-files -z > "$FILELIST"

if [ ! -s "$FILELIST" ]; then
  echo "ERROR: check-no-emdash - no tracked files to scan. Refusing to report green" >&2
  echo "       from a scan that read nothing." >&2
  exit 1
fi

# ---- the one content exclusion: pinned third-party normative documents ----
#
# `vendor/nema/part05/<sha256>/part05.xml` (PS3.5 2026c) carries THREE em dashes, all
# three inside `<title>` elements of ISO/IEC bibliography entries, quoting the literal
# published titles of ISO standards ("Information technology - 8-bit single-byte coded
# graphic character sets - Part 15: ..."). They are NEMA's bytes, not cosyte's prose.
#
# The rule's own remedy is unavailable here and would be wrong if it were: "rewrite the
# sentence" cannot be applied to a normative standard we vendor VERBATIM, and editing one
# byte of it breaks the SHA-256 pin that the de-identification generators re-hash as a
# precondition. That pin is a safety property; the brand rule is a voice property. When
# they collide on a file cosyte did not write, the pin wins and the scan yields.
#
# This is the same principle the KNOWN LIMIT above already states for legacy-charset
# fixtures: "the ban is a rule about prose that people write, and fixture bytes are
# grounded data, not brand copy."
#
# The exclusion is deliberately NARROW: `vendor/nema/<part>/<64-hex>/`, and nothing else.
# That is the NEMA normative documents and only those. Every HAND-WRITTEN file under
# `vendor/` stays in scope, which is where the only real violation in this tree was ever
# found: `vendor/nema/SHA.txt` carried one and the port removed it. The Innolitics mirror
# is NOT exempt either (it is a 7-char short-SHA directory and holds zero em dashes,
# measured), so do not widen this to `vendor/` wholesale, and never use it to exempt
# anything cosyte authors.
#
# THE 64-HEX REQUIREMENT IS THE GUARD, and an earlier draft of this rule got it wrong in a
# way worth recording. Allowing any hash-SHAPED component of 7 or more hex characters
# exempts `vendor/anything/deadbeef/`; tightening that to exactly 7, 40 or 64 still
# exempts `vendor/cosyte/acceded/notes.md`, because `acceded` is a seven-letter English
# word drawn entirely from [a-f] (so is `defaced`, `effaced`, `facade`, and any 7-digit
# string). A full SHA-256 is not constructible as prose, and anchoring to `vendor/nema/`
# means a new vendor root cannot quietly inherit the exemption.
#
# BE HONEST ABOUT WHAT THE SHAPE PROVES, because this gate sits in a repo whose whole
# argument is the difference between an asserted fact and a derived one. Matching a
# hash-SHAPED directory name does NOT verify that the file hashes to it, and nothing
# here reads the sibling `SHA.txt`. What actually enforces that is the generators, which
# re-hash their pinned inputs and refuse on a mismatch. This pattern is a path rule that
# happens to select the vendored documents; it is not proof that they are vendored. So
# the anchor plus the 64-hex requirement is the real guard. Measured today: exactly 4
# files match, the four NEMA normative documents, and only `part05.xml` actually contains
# the character.
VENDOR_PINNED_DOC='^vendor/nema/[^/]+/[0-9a-f]{64}/'

grep -zvxF 'scripts/check-no-emdash.sh' < "$FILELIST" |
  grep -zvP "$VENDOR_PINNED_DOC" > "$SCANLIST" || true

# Fail closed if the exclusion ate the whole list. Without this, a mistyped pattern that
# matched everything would leave xargs -r with no files, produce no hits, and print OK
# from a scan that read nothing: exactly the failure mode every other choice in this file
# exists to prevent.
TRACKED_N=$(tr -dc '\0' < "$FILELIST" | wc -c | tr -d ' ')
SCAN_N=$(tr -dc '\0' < "$SCANLIST" | wc -c | tr -d ' ')
if [ "$SCAN_N" -eq 0 ]; then
  echo "ERROR: check-no-emdash - the exclusion filter removed every tracked file." >&2
  echo "       Refusing to report green from a scan that read nothing." >&2
  exit 1
fi

HITS=$(sed -z 's|^|./|' < "$SCANLIST" |
  xargs -0 -r grep -H -nP -e "$PATTERN" -- 2>>"$ERRLOG" || true)

refuse_if_incomplete

[ -n "$HITS" ] && fail_with_hits "the tracked files listed above" "$HITS"

# Print what was skipped rather than asserting it in a comment, so an exclusion that
# quietly grows shows up in the run that grows it.
echo "check-no-emdash: OK (no em dashes in ${SCAN_N} of ${TRACKED_N} tracked files;" \
     "$(( TRACKED_N - SCAN_N )) skipped: this script + pinned vendor documents)"
