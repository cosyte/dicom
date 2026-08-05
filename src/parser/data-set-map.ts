/**
 * The one place a Data Set's `Map<Tag, Element>` is written during a parse.
 *
 * A parsed Data Set is keyed by tag, so `Map.set` on a tag the map already
 * holds overwrites in place: the earlier element's value leaves the object,
 * silently, and the survivor is indistinguishable from an element the sender
 * wrote once. PS3.5 2026c section 7.1 makes that shape non-conformant on the
 * wire ("shall occur at most once in a Data Set", and section 7.5.1 says the
 * same inside an Item), but a decoder still has to read the bytes it was given,
 * and the ordinary route to one is a length field that lies rather than a sender
 * writing a tag twice.
 *
 * The two dataset element loops (`_parseExplicit` and `parseImplicitLE`, which
 * are also the per-item parsers, so this covers every Data Set at every depth)
 * route their inserts through {@link defineElement} so the replacement is
 * disclosed at the site that performs it. Nothing else changes: the last element
 * read still wins, no value is guessed for the one that lost, and no reading
 * moves.
 *
 * @module
 */

import type { Element } from "../dataset/element.js";
import type { Tag } from "../dictionary/types.js";
import { duplicateTagInDataSet, type DicomParseWarning } from "./warnings.js";

/**
 * Insert `element` into the Data Set map under its own tag, emitting
 * `DICOM_DUPLICATE_TAG_IN_DATA_SET` first when that tag is already present.
 *
 * The check is one `Map.has` per element, so it costs nothing that follows an
 * attacker-chosen length, and it is complete for this map by construction: it is
 * the only writer.
 *
 * @internal
 */
export function defineElement(
  elements: Map<Tag, Element>,
  element: Element,
  emit: (w: DicomParseWarning) => void,
): void {
  if (elements.has(element.tag)) {
    emit(duplicateTagInDataSet({ byteOffset: element.byteOffset }));
  }
  elements.set(element.tag, element);
}
