# src

## Namespaces

- [Dictionary](namespaces/Dictionary.md)

## Classes

### Dataset

One parsed DICOM dataset - the structural shell.

Public data: `fileMeta`, `warnings`. The elements are held internally and
reached through the public `get` / `has` / `elements` / `getAll`
navigation API. A Dataset `parseDicom` returns, and each of its Items,
reads them from the parse's compact table and builds each `Element` the
first time it is asked for, then returns that same Element every time.

#### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const ds = parseDicom(buf);
console.log(ds.fileMeta?.transferSyntaxUID);
for (const w of ds.warnings) {
  console.warn(w.code, w.message);
}
```

#### Extended by

- [`Item`](#item)

#### Constructors

##### Constructor

> **new Dataset**(`init`): [`Dataset`](#dataset)

**`Internal`**

Construct a new structural `Dataset`. The warnings array is frozen at
the model boundary.

###### Parameters

###### init

`DatasetInit`

###### Returns

[`Dataset`](#dataset)

#### Properties

##### fileMeta

> `readonly` **fileMeta**: [`FileMeta`](#filemeta-3) \| `undefined`

##### warnings

> `readonly` **warnings**: readonly [`DicomParseWarning`](#dicomparsewarning)[]

#### Accessors

##### \_elements

###### Get Signature

> **get** `protected` **\_elements**(): `ReadonlyMap`\<`string`, [`Element`](#element)\>

**`Internal`**

The elements as a map keyed by uppercase 8-hex tag, in parse order, for a subclass that reads
them that way. A Dataset built by hand returns the map it was built with; a parsed one builds
the map, and every Element, the first time this is read.

###### Returns

`ReadonlyMap`\<`string`, [`Element`](#element)\>

##### directory

###### Get Signature

> **get** **directory**(): [`DicomDirectory`](#dicomdirectory) \| `undefined`

The DICOMDIR Directory Record tree, or `undefined` when this Dataset is not
a DICOMDIR (its File Meta Media Storage SOP Class UID is not
`1.2.840.10008.1.3.10`). Read from the four offset attributes (PS3.3 2026d
Table F.3-3): `root` is the record `(0004,1200)` names and each
`(0004,1400)` successor, and each record's `lowerLevel` is the record its
`(0004,1420)` names and each successor. An offset resolves only when it is
exactly the file offset of an Item of the Directory Record Sequence
`(0004,1220)`; one that is not names no record, and `parseDicom` warns
(`DICOM_DIRECTORY_OFFSET_UNRESOLVED`, `DICOM_DIRECTORY_OFFSET_MALFORMED`,
`DICOM_DIRECTORY_RECORD_REVISITED`, `DICOM_DIRECTORY_OFFSET_DEFLATED`).
Memoised on first read.

Limits: record keys are not checked against PS3.3 F.5, the File-set
Consistency Flag and `(0004,1202)`'s agreement with the end of the root
chain are not checked, and under Deflated Explicit VR LE no offset resolves,
so every record is listed in `records` and none is linked.

###### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const dir = parseDicom(buf).directory;
for (const patient of dir?.root ?? []) {
  for (const study of patient.lowerLevel) {
    for (const series of study.lowerLevel) {
      for (const image of series.lowerLevel) console.log(image.referencedFileId);
    }
  }
}
```

###### Returns

[`DicomDirectory`](#dicomdirectory) \| `undefined`

##### image

###### Get Signature

> **get** **image**(): [`ImageView`](#imageview)

Pixel-interpretation + geometry view. Surfaces exactly
what a renderer needs without guessing: `rescaleSlope`/`signed`/
`photometricInterpretation` stay absent rather than defaulted, and the
three pixel-spacing tags are distinct. Memoised on first read.

###### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const img = parseDicom(buf).image;
img.rescaleSlope; // undefined ⇒ MUST NOT assume 1
```

###### Returns

[`ImageView`](#imageview)

##### patient

###### Get Signature

> **get** **patient**(): [`PatientView`](#patientview)

Patient-identity view. Fail-safe typed-absent fields; `id` is
**not** globally unique - match on the `{id, issuerOfId, ...}` tuple
plus `otherIds`, never on a bare `(0010,0020)`. Memoised on first read.

###### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const p = parseDicom(buf).patient;
p.name?.alphabetic.familyName; // structured PN, never flattened
```

###### Returns

[`PatientView`](#patientview)

##### series

###### Get Signature

> **get** **series**(): [`SeriesView`](#seriesview)

Series-identity & co-registration view. A shared
`frameOfReferenceUid` means images are spatially co-registered.
Memoised on first read.

###### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const s = parseDicom(buf).series;
s.modality; // "CT"
```

###### Returns

[`SeriesView`](#seriesview)

##### study

###### Get Signature

> **get** **study**(): [`StudyView`](#studyview)

Study-identity view. `instanceUid` is the cross-system study
key; `accessionNumber` ties it to the order. Memoised on first read.

###### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const s = parseDicom(buf).study;
s.instanceUid; // "1.2.840.113619..."
```

###### Returns

[`StudyView`](#studyview)

#### Methods

##### elements()

> **elements**(): readonly [`Element`](#element)[]

All elements in this dataset, in parse (insertion) order.

###### Returns

readonly [`Element`](#element)[]

###### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const ds = parseDicom(buf);
for (const el of ds.elements()) console.log(el.tag, el.vr);
```

##### get()

> **get**(`tag`): [`Element`](#element) \| `undefined`

Look up a single element by tag. Tags are normalised to 8-char
uppercase hex, so `"7fe00010"` and `"7FE00010"` resolve to the same
element. Returns `undefined` when the tag is absent.

###### Parameters

###### tag

`string`

###### Returns

[`Element`](#element) \| `undefined`

###### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const ds = parseDicom(buf);
const rows = ds.get("00280010"); // Rows
if (rows?.value.kind === "numbers") console.log(rows.value.values[0]);
```

##### getAll()

> **getAll**(`tag`): readonly [`Element`](#element)[]

All elements matching a tag as an array (never `undefined`). A dataset
holds at most one element per tag, so this returns a 0- or 1-length
array - the convenience complement of [Dataset.get](#get) for callers
that prefer an always-array shape.

###### Parameters

###### tag

`string`

###### Returns

readonly [`Element`](#element)[]

###### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const ds = parseDicom(buf);
for (const el of ds.getAll("00080060")) console.log(el.value);
```

##### has()

> **has**(`tag`): `boolean`

`true` when an element with the given tag is present (case-insensitive).

###### Parameters

###### tag

`string`

###### Returns

`boolean`

###### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const ds = parseDicom(buf);
if (ds.has("00100010")) console.log("has Patient's Name");
```

***

### DeidentifyError

Thrown by [deidentify](#deidentify) when it will not de-identify, for one of two
reasons a caller tells apart by `code` (see [DEIDENTIFY\_ERROR\_CODES](#deidentify_error_codes)):
an author-time misconfiguration of the call (`INVALID_OPTIONS`: an unknown
Retain option, a malformed UID root), or a Dataset under a Transfer Syntax this
de-identifier refuses (`UNSUPPORTED_TRANSFER_SYNTAX`: the four JPIP Referenced
syntaxes). Distinct from the parser's fatal codes, the value layer's
`DicomValueError`, and the serializer's `DicomSerializeError`. The message
carries only structural facts (option names, the UID root) or a fixed string -
never a decoded value, and for `UNSUPPORTED_TRANSFER_SYNTAX` nothing read from
the Dataset at all.

#### Example

```ts
import { deidentify, DeidentifyError } from "@cosyte/dicom";
try {
  // @ts-expect-error - not a valid option
  deidentify(ds, { retain: ["RetainEverything"] });
} catch (e) {
  if (e instanceof DeidentifyError) console.error(e.code); // "INVALID_OPTIONS"
}
```

#### Extends

- `Error`

#### Constructors

##### Constructor

> **new DeidentifyError**(`message`, `code`): [`DeidentifyError`](#deidentifyerror)

###### Parameters

###### message

`string`

Human-readable, PHI-free description.

###### code

[`DeidentifyErrorCode`](#deidentifyerrorcode-1)

One of [DEIDENTIFY\_ERROR\_CODES](#deidentify_error_codes).

###### Returns

[`DeidentifyError`](#deidentifyerror)

###### Overrides

`Error.constructor`

#### Properties

##### code

> `readonly` **code**: [`DeidentifyErrorCode`](#deidentifyerrorcode-1)

***

### DicomJsonError

Thrown by `toDicomJson` and `fromDicomJson` when a value cannot cross between the Part 10 model
and the DICOM JSON Model without being changed or guessed at. Never carries a value, so it is
safe to log: `tag` is the element's tag only when PS3.6 registers it one at a time, and
`"<withheld>"` otherwise.

#### Example

```ts
import { parseDicom, toDicomJson, DicomJsonError } from "@cosyte/dicom";
try {
  toDicomJson(parseDicom(buf));
} catch (err) {
  if (err instanceof DicomJsonError && err.code === "UNSUPPORTED_ELEMENT") {
    // an encapsulated Pixel Data stream: hand it out as a BulkDataURI instead
  }
}
```

#### Extends

- `Error`

#### Constructors

##### Constructor

> **new DicomJsonError**(`code`, `renderedTag`): [`DicomJsonError`](#dicomjsonerror)

**`Internal`**

Construct a new `DicomJsonError`. `renderedTag` must already have gone through `renderTag`.

###### Parameters

###### code

[`DicomJsonErrorCode`](#dicomjsonerrorcode-1)

###### renderedTag

`string`

###### Returns

[`DicomJsonError`](#dicomjsonerror)

###### Overrides

`Error.constructor`

#### Properties

##### code

> `readonly` **code**: [`DicomJsonErrorCode`](#dicomjsonerrorcode-1)

##### tag

> `readonly` **tag**: `string`

The element's tag when PS3.6 registers it one at a time, otherwise `"<withheld>"`.

***

### DicomParseError

Thrown by `parseDicom` when the input violates one of the four
unrecoverable Tier-3 structural rules, or when a Tier-2 warning is
escalated through the single `emit` chokepoint, which `{ strict: true }`
does for every warning and a profile's `escalate` list does for the codes
it names. Carries byte-offset positional context plus a short
source snippet so consumers can log actionable errors.

Message format: `[CODE] msg (offset=N frame=F)`, with `… in a/b/c`
appended when `contextPath` is provided.

**`code` is a [FatalCode](#fatalcode) or, for an escalated warning, that
warning's [WarningCode](#warningcode).** The escalated error keeps the warning's
own code and registry message rather than mapping it onto one of the four
fatal codes, so `err.code` can be any member of `FATAL_CODES` or
`WARNING_CODES`. Test for the fatal codes you handle and give a `switch`
a `default` branch for the escalated warnings: the warning registry grows
between releases, so the union is open (see `WarningCode`).

#### Remarks

Snippets may contain PHI when parsing real clinical files: redact at
the call site if required by your compliance posture. The library does
not redact snippets itself.

**`byteOffset` is only an index into your own buffer when `offsetFrame` is
`"input"`.** This parser reads a Data Set out of a slice in two situations
(a defined-length Sequence Item, and an `SQ`/`UN` descent) and out of an
inflated stream in a third, and an offset raised in any of them counts from
that buffer's byte 0. [OFFSET\_FRAMES](#offset_frames) names which; where a slice
begins is deliberately not published, because the distance between two
frames is a declared length off the wire.

**`snippet` is cut in the frame `offsetFrame` names, on every fatal but one.**
The exception is `UNSUPPORTED_TRANSFER_SYNTAX`, whose snippet slot carries
PS3.6's own NAME for the unsupported UID when the registry publishes one
(`"SMPTE ST 2110-20 Uncompressed Progressive Active Video"`), and 16 raw
bytes only when it does not. That is
deliberate and predates the frame; it is named here because a universal about
`snippet` written without it is false on the code an object under a refused
Transfer Syntax reaches first. Everywhere else the two agree, so a consumer
that only wants the bytes at the offset already has them. **The frame is what
a consumer needs before indexing anything of its OWN by `byteOffset`**, which
is the case no field on this class used to cover.

#### Examples

```ts
import { parseDicom, DicomParseError, OFFSET_FRAMES } from "@cosyte/dicom";
try {
  parseDicom(buffer);
} catch (err) {
  if (err instanceof DicomParseError && err.code === "NOT_DICOM_PART_10") {
    // err.byteOffset, err.offsetFrame, err.snippet, err.contextPath
    if (err.offsetFrame !== OFFSET_FRAMES.INPUT) {
      // `byteOffset` counts from somewhere inside the file, not from its start.
    }
  }
}
```

```ts
import { parseDicom, DicomParseError } from "@cosyte/dicom";
try {
  parseDicom(buffer, { strict: true });
} catch (err) {
  if (err instanceof DicomParseError) {
    switch (err.code) {
      case "EMPTY_INPUT":
      case "NOT_DICOM_PART_10":
      case "INVALID_FILE_META":
      case "UNSUPPORTED_TRANSFER_SYNTAX":
        // a Tier-3 fatal: the input could not be read
        break;
      default:
        // an escalated warning: err.code is its WarningCode,
        // such as "DICOM_MISSING_PREAMBLE"
        break;
    }
  }
}
```

#### Extends

- `Error`

#### Constructors

##### Constructor

> **new DicomParseError**(`code`, `message`, `byteOffset`, `offsetFrame`, `snippet`, `contextPath?`): [`DicomParseError`](#dicomparseerror)

**`Internal`**

Construct a new `DicomParseError`. All fields except `contextPath` are
required so every thrower populates positional context, and
`offsetFrame` is required for the same reason `byteOffset` is, because an
offset whose frame is optional is an offset whose frame is usually
missing.

###### Parameters

###### code

[`WarningCode`](#warningcode) \| [`FatalCode`](#fatalcode)

###### message

`string`

###### byteOffset

`number`

###### offsetFrame

[`OffsetFrame`](#offsetframe-1)

###### snippet

`string`

###### contextPath?

readonly `string`[]

###### Returns

[`DicomParseError`](#dicomparseerror)

###### Overrides

`Error.constructor`

#### Properties

##### byteOffset

> `readonly` **byteOffset**: `number`

##### code

> `readonly` **code**: [`WarningCode`](#warningcode) \| [`FatalCode`](#fatalcode)

A [FatalCode](#fatalcode), or the [WarningCode](#warningcode) of a Tier-2 warning that
`{ strict: true }` or a profile's `escalate` list escalated.

##### contextPath

> `readonly` **contextPath**: readonly `string`[] \| `undefined`

##### offsetFrame

> `readonly` **offsetFrame**: [`OffsetFrame`](#offsetframe-1)

The coordinate system [DicomParseError.byteOffset](#byteoffset) is counted in.
See [OFFSET\_FRAMES](#offset_frames).

##### snippet

> `readonly` **snippet**: `string`

***

### DicomSerializeError

Thrown by `serializeDicom` when a `Dataset`
cannot be emitted as spec-clean Part 10. Never carries a decoded value, so
it is safe to log without leaking PHI: the `message` is built only from the
code and structural constants, never from the Transfer Syntax UID, a length
or a byte the `Dataset` holds.

#### Example

```ts
import { parseDicom, serializeDicom, DicomSerializeError } from "@cosyte/dicom";
const ds = parseDicom(buf);
try {
  serializeDicom(ds);
} catch (err) {
  if (err instanceof DicomSerializeError && err.code === "MISSING_TRANSFER_SYNTAX") {
    // dataset is missing the File Meta Transfer Syntax UID
  }
  if (err instanceof DicomSerializeError && err.code === "INVALID_ENCAPSULATED_PIXEL_DATA") {
    // a section A.4 object whose top-level Pixel Data is not a fragment stream
  }
  if (err instanceof DicomSerializeError && err.code === "DIRECTORY_OFFSET_UNRESOLVED") {
    // a DICOMDIR offset the writer cannot tie to a Directory Record
  }
  if (err instanceof DicomSerializeError && err.code === "VALUE_TOO_LONG_FOR_VR") {
    // a Private Creator or File Meta value past 65,534 bytes, which UN may not carry
  }
}
```

#### Extends

- `Error`

#### Constructors

##### Constructor

> **new DicomSerializeError**(`code`, `message`): [`DicomSerializeError`](#dicomserializeerror)

**`Internal`**

Construct a new `DicomSerializeError`. The `message` MUST be built only
from structural facts (never a decoded attribute value) so the error is
always safe to log.

###### Parameters

###### code

[`SerializeErrorCode`](#serializeerrorcode)

###### message

`string`

###### Returns

[`DicomSerializeError`](#dicomserializeerror)

###### Overrides

`Error.constructor`

#### Properties

##### code

> `readonly` **code**: [`SerializeErrorCode`](#serializeerrorcode)

***

### DicomValueError

Thrown by the domain helpers for a structural contract violation that
cannot be answered safely (see module doc). Never carries a decoded
value, so it is safe to log without leaking PHI: the `message` is built
only from the code and structural facts (indices, tag/macro names).

#### Example

```ts
import { parseDicom, DicomValueError } from "@cosyte/dicom";
const img = parseDicom(buf).image;
try {
  img.frame(9999);
} catch (err) {
  if (err instanceof DicomValueError && err.code === "FRAME_INDEX_OUT_OF_RANGE") {
    // handle the out-of-range request
  }
}
```

#### Extends

- `Error`

#### Constructors

##### Constructor

> **new DicomValueError**(`code`, `message`): [`DicomValueError`](#dicomvalueerror)

**`Internal`**

Construct a new `DicomValueError`. The `message` MUST be built only
from structural facts (never a decoded attribute value) so the error
is always safe to log.

###### Parameters

###### code

[`ValueErrorCode`](#valueerrorcode)

###### message

`string`

###### Returns

[`DicomValueError`](#dicomvalueerror)

###### Overrides

`Error.constructor`

#### Properties

##### code

> `readonly` **code**: [`ValueErrorCode`](#valueerrorcode)

***

### Element

One DICOM Data Element as parsed.

Structural surface: `tag`, `vr`, `vm`, `length`, `rawBytes`,
`byteOffset`, `privateCreator`. On top of it sits a lazy, memoized
`.value` getter backed by the VR-aware decoders under `src/dataset/vr/`.

`rawBytes` retention behaviour: zero-copy `Buffer.subarray` view by
default (pins source ArrayBuffer); pass `{ copyValues: true }` to
`parseDicom` for `Buffer.from(slice)` per element when the source
needs to be released.

#### Example

```ts
import { Buffer } from "node:buffer";
import { Element } from "@cosyte/dicom";
const el = new Element({
  tag: "00100010",
  vr: "PN",
  vm: 1,
  length: 8,
  rawBytes: Buffer.from("DOE^JANE"),
  byteOffset: 200,
  littleEndian: true,
});
// el.tag === "00100010"; el.rawBytes is a Buffer of 8 bytes.
// el.value.kind === "personName".
```

#### Constructors

##### Constructor

> **new Element**(`init`): [`Element`](#element)

**`Internal`**

Construct a new structural `Element`. The parser builds these directly
from on-wire bytes; consumers receive them via `Dataset` after
`parseDicom`.

###### Parameters

###### init

`ElementInit`

###### Returns

[`Element`](#element)

#### Properties

##### byteOffset

> `readonly` **byteOffset**: `number`

##### cp246Promoted

> `readonly` **cp246Promoted**: `boolean` \| `undefined`

**`Internal`**

Hint for the lazy SQ decoder. `true` when this Element was promoted
from `VR=UN` with undefined length to `VR=SQ` via the CP-246 fallback,
which is what selects the Implicit VR LE inner decoder. Always
`undefined` on standard SQ elements.

##### items

> `readonly` **items**: readonly [`Item`](#item)[] \| `undefined`

Parsed items for an `SQ` element; `undefined` otherwise.

##### length

> `readonly` **length**: `number`

##### littleEndian

> `readonly` **littleEndian**: `boolean`

Value byte order (per transfer syntax). See ElementInit.littleEndian.

##### privateCreator

> `readonly` **privateCreator**: `string` \| `undefined`

##### specificCharacterSet

> `readonly` **specificCharacterSet**: readonly `string`[] \| `undefined`

In-effect `(0008,0005)` terms, or `undefined` for the Default Repertoire.

##### tag

> `readonly` **tag**: `string`

##### vm

> `readonly` **vm**: `number`

##### vr

> `readonly` **vr**: [`VR`](namespaces/Dictionary.md#vr-1)

#### Accessors

##### rawBytes

###### Get Signature

> **get** **rawBytes**(): `Buffer`

The element's bytes, as the parser read them: a zero-copy `Buffer.subarray`
view of the source buffer by default, made the first time it is read and
the same Buffer every time after; a standalone copy under
`{ copyValues: true }`. See the class doc.

###### Returns

`Buffer`

##### value

###### Get Signature

> **get** **value**(): [`DicomValue`](#dicomvalue)

The decoded value of this element, by VR. Decode is lazy (the structural
parse stays eager; field decode runs on first access) and memoized - the
documented ~30× win on large studies where most fields are never read.
Fail-safe: never throws; a malformed value surfaces as typed-absent with
the deviation on the returned value's `warnings`.

###### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const ds = parseDicom(buf);
const v = ds.get("00100010")?.value; // Patient's Name (PN)
if (v?.kind === "personName") console.log(v.values[0]?.alphabetic.familyName);
```

###### Returns

[`DicomValue`](#dicomvalue)

***

### Item

One sequence item. Inherits `fileMeta` (always `undefined` for nested
items), `warnings`, and the protected element map from `Dataset`.

`Item.get(...)` / `Item.has(...)` and the rest come from the `Dataset`
superclass.

#### Example

```ts
import { Item } from "@cosyte/dicom";
// The parser constructs items as follows:
// const item = new Item({ index: 0, warnings: [], elements: new Map() });
```

#### Extends

- [`Dataset`](#dataset)

#### Constructors

##### Constructor

> **new Item**(`init`): [`Item`](#item)

**`Internal`**

Construct a new structural `Item`. Producers are the SQ / FFFE
marker parsers.

###### Parameters

###### init

`ItemInit`

###### Returns

[`Item`](#item)

###### Overrides

[`Dataset`](#dataset).[`constructor`](#constructor)

#### Properties

##### fileMeta

> `readonly` **fileMeta**: [`FileMeta`](#filemeta-3) \| `undefined`

###### Inherited from

[`Dataset`](#dataset).[`fileMeta`](#filemeta)

##### fileOffset

> `readonly` **fileOffset**: `number` \| `undefined`

Byte offset of this Item's `(FFFE,E000)` Item tag in the Part 10 file it
was read from, counted from the first byte of the File Preamble, which is
how PS3.3 2026d Table F.3-3 counts a DICOMDIR's offsets. For a file read
without a preamble, the 132 bytes of File Preamble and `DICM` prefix it
lacks are still counted, so the File Meta group's first byte is offset 132.

`undefined` for an Item with no position in a file: one inside a Deflated
Data Set (a byte of a deflated stream is not a byte of the file), and one
built by hand. `deidentify()` carries it from each source Item to the Item
it rebuilds, as that Item's identity: it is how `serializeDicom` ties a
DICOMDIR offset to the Directory Record it named.

###### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const ds = parseDicom(buf);
const first = ds.get("00041220")?.items?.[0];
first?.fileOffset; // where that Directory Record Item starts in the file
```

##### index

> `readonly` **index**: `number`

##### warnings

> `readonly` **warnings**: readonly [`DicomParseWarning`](#dicomparsewarning)[]

###### Inherited from

[`Dataset`](#dataset).[`warnings`](#warnings)

#### Accessors

##### \_elements

###### Get Signature

> **get** `protected` **\_elements**(): `ReadonlyMap`\<`string`, [`Element`](#element)\>

**`Internal`**

The elements as a map keyed by uppercase 8-hex tag, in parse order, for a subclass that reads
them that way. A Dataset built by hand returns the map it was built with; a parsed one builds
the map, and every Element, the first time this is read.

###### Returns

`ReadonlyMap`\<`string`, [`Element`](#element)\>

###### Inherited from

[`Dataset`](#dataset).[`_elements`](#_elements)

##### directory

###### Get Signature

> **get** **directory**(): [`DicomDirectory`](#dicomdirectory) \| `undefined`

The DICOMDIR Directory Record tree, or `undefined` when this Dataset is not
a DICOMDIR (its File Meta Media Storage SOP Class UID is not
`1.2.840.10008.1.3.10`). Read from the four offset attributes (PS3.3 2026d
Table F.3-3): `root` is the record `(0004,1200)` names and each
`(0004,1400)` successor, and each record's `lowerLevel` is the record its
`(0004,1420)` names and each successor. An offset resolves only when it is
exactly the file offset of an Item of the Directory Record Sequence
`(0004,1220)`; one that is not names no record, and `parseDicom` warns
(`DICOM_DIRECTORY_OFFSET_UNRESOLVED`, `DICOM_DIRECTORY_OFFSET_MALFORMED`,
`DICOM_DIRECTORY_RECORD_REVISITED`, `DICOM_DIRECTORY_OFFSET_DEFLATED`).
Memoised on first read.

Limits: record keys are not checked against PS3.3 F.5, the File-set
Consistency Flag and `(0004,1202)`'s agreement with the end of the root
chain are not checked, and under Deflated Explicit VR LE no offset resolves,
so every record is listed in `records` and none is linked.

###### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const dir = parseDicom(buf).directory;
for (const patient of dir?.root ?? []) {
  for (const study of patient.lowerLevel) {
    for (const series of study.lowerLevel) {
      for (const image of series.lowerLevel) console.log(image.referencedFileId);
    }
  }
}
```

###### Returns

[`DicomDirectory`](#dicomdirectory) \| `undefined`

###### Inherited from

[`Dataset`](#dataset).[`directory`](#directory)

##### image

###### Get Signature

> **get** **image**(): [`ImageView`](#imageview)

Pixel-interpretation + geometry view. Surfaces exactly
what a renderer needs without guessing: `rescaleSlope`/`signed`/
`photometricInterpretation` stay absent rather than defaulted, and the
three pixel-spacing tags are distinct. Memoised on first read.

###### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const img = parseDicom(buf).image;
img.rescaleSlope; // undefined ⇒ MUST NOT assume 1
```

###### Returns

[`ImageView`](#imageview)

###### Inherited from

[`Dataset`](#dataset).[`image`](#image)

##### patient

###### Get Signature

> **get** **patient**(): [`PatientView`](#patientview)

Patient-identity view. Fail-safe typed-absent fields; `id` is
**not** globally unique - match on the `{id, issuerOfId, ...}` tuple
plus `otherIds`, never on a bare `(0010,0020)`. Memoised on first read.

###### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const p = parseDicom(buf).patient;
p.name?.alphabetic.familyName; // structured PN, never flattened
```

###### Returns

[`PatientView`](#patientview)

###### Inherited from

[`Dataset`](#dataset).[`patient`](#patient)

##### series

###### Get Signature

> **get** **series**(): [`SeriesView`](#seriesview)

Series-identity & co-registration view. A shared
`frameOfReferenceUid` means images are spatially co-registered.
Memoised on first read.

###### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const s = parseDicom(buf).series;
s.modality; // "CT"
```

###### Returns

[`SeriesView`](#seriesview)

###### Inherited from

[`Dataset`](#dataset).[`series`](#series)

##### study

###### Get Signature

> **get** **study**(): [`StudyView`](#studyview)

Study-identity view. `instanceUid` is the cross-system study
key; `accessionNumber` ties it to the order. Memoised on first read.

###### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const s = parseDicom(buf).study;
s.instanceUid; // "1.2.840.113619..."
```

###### Returns

[`StudyView`](#studyview)

###### Inherited from

[`Dataset`](#dataset).[`study`](#study)

#### Methods

##### elements()

> **elements**(): readonly [`Element`](#element)[]

All elements in this dataset, in parse (insertion) order.

###### Returns

readonly [`Element`](#element)[]

###### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const ds = parseDicom(buf);
for (const el of ds.elements()) console.log(el.tag, el.vr);
```

###### Inherited from

[`Dataset`](#dataset).[`elements`](#elements)

##### get()

> **get**(`tag`): [`Element`](#element) \| `undefined`

Look up a single element by tag. Tags are normalised to 8-char
uppercase hex, so `"7fe00010"` and `"7FE00010"` resolve to the same
element. Returns `undefined` when the tag is absent.

###### Parameters

###### tag

`string`

###### Returns

[`Element`](#element) \| `undefined`

###### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const ds = parseDicom(buf);
const rows = ds.get("00280010"); // Rows
if (rows?.value.kind === "numbers") console.log(rows.value.values[0]);
```

###### Inherited from

[`Dataset`](#dataset).[`get`](#get)

##### getAll()

> **getAll**(`tag`): readonly [`Element`](#element)[]

All elements matching a tag as an array (never `undefined`). A dataset
holds at most one element per tag, so this returns a 0- or 1-length
array - the convenience complement of [Dataset.get](#get) for callers
that prefer an always-array shape.

###### Parameters

###### tag

`string`

###### Returns

readonly [`Element`](#element)[]

###### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const ds = parseDicom(buf);
for (const el of ds.getAll("00080060")) console.log(el.value);
```

###### Inherited from

[`Dataset`](#dataset).[`getAll`](#getall)

##### has()

> **has**(`tag`): `boolean`

`true` when an element with the given tag is present (case-insensitive).

###### Parameters

###### tag

`string`

###### Returns

`boolean`

###### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const ds = parseDicom(buf);
if (ds.has("00100010")) console.log("has Patient's Name");
```

###### Inherited from

[`Dataset`](#dataset).[`has`](#has)

***

### ProfileDefinitionError

Thrown by `defineProfile()` when the supplied options are invalid.

#### Example

```ts
import { defineProfile, ProfileDefinitionError } from "@cosyte/dicom";
try {
  defineProfile({ name: "" });
} catch (err) {
  if (err instanceof ProfileDefinitionError) {
    console.error(err.message); // "Profile name must be a non-empty string."
  }
}
```

#### Extends

- `Error`

#### Constructors

##### Constructor

> **new ProfileDefinitionError**(`message`, `profileName?`): [`ProfileDefinitionError`](#profiledefinitionerror)

###### Parameters

###### message

`string`

Actionable description of what made the options invalid.

###### profileName?

`string`

The offending profile's `name`, when known.

###### Returns

[`ProfileDefinitionError`](#profiledefinitionerror)

###### Overrides

`Error.constructor`

#### Properties

##### profileName?

> `readonly` `optional` **profileName?**: `string`

The offending profile's `name` when known (`undefined` when the failure
is the name itself). Lets callers attribute a composed-lineage failure to
the specific profile that introduced it.

***

### Sequence

One SQ (Sequence) element's structural body.

`length` is the on-wire length: a real byte count for defined-length
SQ, or `0xFFFFFFFF` (4_294_967_295) when undefined-length.

#### Example

```ts
import { Sequence } from "@cosyte/dicom";
// The parser constructs sequences as follows:
// const sq = new Sequence([item0, item1], 0xFFFFFFFF);
```

#### Constructors

##### Constructor

> **new Sequence**(`items`, `length`): [`Sequence`](#sequence)

**`Internal`**

Construct a new structural `Sequence`. The `items` array is frozen
at the constructor boundary so downstream mutation cannot escape.

###### Parameters

###### items

readonly [`Item`](#item)[]

###### length

`number`

###### Returns

[`Sequence`](#sequence)

#### Properties

##### items

> `readonly` **items**: readonly [`Item`](#item)[]

##### length

> `readonly` **length**: `number`

## Interfaces

### CodedConcept

A coded triplet (PS3.16 §8, Table 8-1): `Code Value (0008,0100)`,
`Coding Scheme Designator (0008,0102)`, `Code Meaning (0008,0104)`. The
canonical scheme OID is resolved only for the four standard designators;
legacy SNOMED designators (`SRT`/`SNM3`/`99SDM`) deliberately resolve to
`undefined` because their code values differ from `SCT` (CP-730).

#### Example

```ts
import type { CodedConcept } from "@cosyte/dicom";
const c: CodedConcept = {
  codeValue: "C-B1003",
  codingSchemeDesignator: "SCT",
  codeMeaning: "Hounsfield unit",
  schemeUid: "2.16.840.1.113883.6.96",
};
```

#### Properties

##### codeMeaning?

> `readonly` `optional` **codeMeaning?**: `string`

##### codeValue?

> `readonly` `optional` **codeValue?**: `string`

##### codingSchemeDesignator?

> `readonly` `optional` **codingSchemeDesignator?**: `string`

##### schemeUid?

> `readonly` `optional` **schemeUid?**: `string`

***

### DateParts

The calendar components a temporal value actually stated, and nothing else.

Every value is a number, `month` is 1 to 12 (never the JS `Date` 0 to 11),
and a component the value did not state is ABSENT rather than present and
`undefined`: there is no `precision` key because the key set is the
precision. No `raw`, no `valid` and no parse bookkeeping reaches it.

The shape is the one `Temporal.PlainDateTime.from` and luxon's
`DateTime.fromObject` accept, which is why the names are singular where
[DicomTime](#dicomtime) and [DicomDateTime](#dicomdatetime) spell them plurally. Delete
`offsetMinutes` and either constructor takes the rest with no key rename and
no value adjustment. That is a documented property rather than a tested one:
proving it would mean taking a dependency, and this package takes none for it.

#### Example

```ts
import { parseDateTime, toObject } from "@cosyte/dicom";
import type { DateParts } from "@cosyte/dicom";

const parts: DateParts | undefined = toObject(parseDateTime("202401151330").value);
Object.keys(parts ?? {}); // ["year", "month", "day", "hour", "minute"]
```

#### Properties

##### day?

> `readonly` `optional` **day?**: `number`

Day of month, 1 to 31.

##### hour?

> `readonly` `optional` **hour?**: `number`

Hour of day, 0 to 23.

##### millisecond?

> `readonly` `optional` **millisecond?**: `number`

The first three digits of the stated fraction, right-padded with zeroes.

##### minute?

> `readonly` `optional` **minute?**: `number`

Minute, 0 to 59.

##### month?

> `readonly` `optional` **month?**: `number`

Calendar month, 1 to 12.

##### offsetMinutes?

> `readonly` `optional` **offsetMinutes?**: `number`

Signed minutes east of UTC, present only when the value carried an offset.

##### second?

> `readonly` `optional` **second?**: `number`

Second, 0 to 59.

`TM` and `DT` permit `60` for a leap second and the decoders keep it, but a
value stating it is not projected: there is no ISO rendering of it a reader
does not move, and no instant to build. See the module doc block.

##### year?

> `readonly` `optional` **year?**: `number`

Calendar year as written, so `0050` is the year 50 and never 1950.

***

### DefineProfileOptions

Options accepted by [defineProfile](#defineprofile). Only `name` is required; every
other field defaults to empty. With `exactOptionalPropertyTypes`, omit an
unset key rather than passing `undefined`.

#### Example

```ts
import { defineProfile, WARNING_CODES } from "@cosyte/dicom";
const lenientCd = defineProfile({
  name: "lenient-cd",
  description: "Tolerant of conformance-loose archive CDs",
  suppress: [WARNING_CODES.DICOM_ODD_LENGTH_VALUE_PADDED],
});
```

#### Properties

##### description?

> `readonly` `optional` **description?**: `string`

##### escalate?

> `readonly` `optional` **escalate?**: readonly [`WarningCode`](#warningcode)[]

##### extends?

> `readonly` `optional` **extends?**: [`Profile`](#profile-2) \| readonly [`Profile`](#profile-2)[]

##### name

> `readonly` **name**: `string`

##### privateTags?

> `readonly` `optional` **privateTags?**: `Readonly`\<`Record`\<`string`, `Readonly`\<`Record`\<`string`, [`PrivateTagDefinition`](#privatetagdefinition)\>\>\>\>

##### suppress?

> `readonly` `optional` **suppress?**: readonly [`WarningCode`](#warningcode)[]

***

### DeidentificationMethodCode

One row of PS3.16 CID 7050 "De-identification Method": the three Basic Coded
Entry Attributes (PS3.3 2026d Table 8.8-1a) of one code, exactly as the context
group spells them.

`deidentify()` writes each code it records as one Item of
`(0012,0064)` De-identification Method Code Sequence carrying Code Value
`(0008,0100)`, Coding Scheme Designator `(0008,0102)` and Code Meaning
`(0008,0104)`, and nothing else. Coding Scheme Version is omitted because PS3.3
requires it only where the designator is not sufficient to identify the code,
and `DCM` is.

#### Example

```ts
import { DEIDENTIFICATION_METHOD_CODES, type DeidentificationMethodCode } from "@cosyte/dicom";
const profile: DeidentificationMethodCode = DEIDENTIFICATION_METHOD_CODES.profile;
profile.codeValue; // "113100"
```

#### Properties

##### codeMeaning

> `readonly` **codeMeaning**: `string`

Code Meaning `(0008,0104)`, a VR `LO` value, spelled as CID 7050 spells it.

##### codeValue

> `readonly` **codeValue**: `string`

Code Value `(0008,0100)`, a VR `SH` value.

##### codingSchemeDesignator

> `readonly` **codingSchemeDesignator**: `"DCM"`

Coding Scheme Designator `(0008,0102)`. Every CID 7050 row is `DCM`.

***

### DeidentifiedAttribute

One audited attribute outcome. `tag`, `keyword`, `action`, `applied` and
`repeatingGroup` carry **never** a decoded value: `keyword`, `action` and
`repeatingGroup` come from the Part 6 and Annex E tables, and `tag` is bound to
a tag those tables carry a row for, which is membership in a closed table
rather than a shape test.

**🩺 `contextPath` is NOT in that class and this docstring used to say it was.**
It is a chain of tags read off the wire, bound by nothing - see
[DeidentifiedAttribute.contextPath](#contextpath-1) and the note on
[DeidentifyReport](#deidentifyreport).

#### Example

```ts
import { deidentify, parseDicom, type DeidentifiedAttribute } from "@cosyte/dicom";
const { report } = deidentify(parseDicom(buf));
report.attributes.forEach((a: DeidentifiedAttribute) => {
  console.log(a.keyword, a.action, a.applied); // composed from tables - safe to log
});
```

#### Properties

##### action

> `readonly` **action**: `"D"` \| `"Z"` \| `"X"` \| `"K"` \| `"C"` \| `"U"`

The resolved single action after collapsing any conditional code.

##### applied

> `readonly` **applied**: [`AppliedAction`](#appliedaction)

##### contextPath?

> `readonly` `optional` **contextPath?**: readonly `string`[]

Tag/index chain for an attribute inside a sequence; omitted at the root.

**🩺 Each segment is `TAG[index]`, and the `TAG` half is read off the wire
with no table behind it.** It is whatever tag the descent walked, so it is
bound by neither a shape test nor membership in a closed one - which is what
separates it from `tag`, `keyword`, `action` and `repeatingGroup`. On a file
where an under-declared Value Length desynchronized the reader onto four
bytes sitting **inside** somebody's value, those four bytes become a segment
here. It is not the only identifier on this report read off the wire -
[DeidentifyReport.removedPrivateTags](#removedprivatetags) and
[UnauditableSequenceFinding.tag](#tag-8) are too - but those two are disclosed
as such, and this one was documented as structural.

Measured on a synthetic `LO` carrier holding `"MRS BRAIN SMITHSON"` that
under-declares by four: the reader resynchronizes onto a fabricated `SQ`
header, descends it, and the report reads `contextPath: ["53484E4F[0]"]` -
`"HSON"` in wire order, recovered by writing the two halves back with
`writeUInt16LE`. **No warning is raised and every finding array on the
report is empty.** Change the surname and the published segment changes with
it. `PRE-EXISTING`, on every release that has shipped the field.

**🛑 IT IS NOT THE ONLY PLACE THOSE BYTES SURFACE, AND AN EARLIER DRAFT OF
THIS NOTE SAID IT WAS. A GRADED PASS REFUTED THAT AND IT MUST NOT COME
BACK.** On the same file the de-identified `Dataset` still carries the
fabricated `(5348,4E4F)`, so `serializeDicom` writes its header back out in
full - `"HSON"` included - inside an object stamped
`(0012,0062) Patient Identity Removed = YES`. That re-emission belongs to
the disclosed under-declare carrier class, not to this field, and neither is
a bound on the other: **redacting `contextPath` from a log does not make the
object safe to share.**

**That fixture no longer reproduces either half.** `(5348,4E4F)` has no row
in this build's PS3.6 registry and none in Table E.1-1, so `deidentify()` now
removes the fabricated Sequence whole before it reads the VR, and neither
this field nor the object carries `"HSON"` (see
[UnregisteredElementRemoval](#unregisteredelementremoval)); that is what
`test/integration/phi-diagnostic-surface.test.ts` pins now. It is a fact
about that shape and **not a bound on this field**: a Sequence the run does
descend still contributes whatever tag the wire gave it.

It is published anyway, on the same footing as
[DeidentifyReport.removedPrivateTags](#removedprivatetags): **where** an attribute sat is
the whole audit value of the field, and withholding it would destroy that on
every well-formed file in order to bound a malformed one. **Treat it as PHI
when the source is untrusted.**

##### keyword

> `readonly` **keyword**: `string`

##### repeatingGroup?

> `readonly` `optional` **repeatingGroup?**: `string`

Present when the action came from a Table E.1-1 row that names a
repeating-group family rather than this single tag: the mask that matched,
e.g. `"60xx4000"` for Overlay Comments in any overlay plane. `tag` is always
the concrete tag that was in the file. Absent for every exact-tag row.

##### tag

> `readonly` **tag**: `string`

***

### DeidentifyOptions

Options controlling a de-identification run. All optional - the default is
the Basic Application Level Confidentiality Profile with no Retain options.

#### Example

```ts
import { deidentify, parseDicom, type DeidentifyOptions } from "@cosyte/dicom";
const opts: DeidentifyOptions = { retain: ["RetainLongitudinalTemporal", "CleanDescriptors"] };
const { dataset } = deidentify(parseDicom(buf), opts);
```

#### Properties

##### deidentificationMethod?

> `readonly` `optional` **deidentificationMethod?**: `string`

Text **added to** `(0012,0063)` De-identification Method. Default names the
Basic Profile and the active options.

**It never changes `(0012,0064)`.** The CID 7050 codes the run writes there
follow the options that ran, and free text cannot alter what ran; see
`DEIDENTIFICATION_METHOD_CODES`.

**The default is multi-valued, one Value per name, and that is a conformance
fix rather than a style choice.** PS3.5 2026c Table 6.2-1 caps an `LO` at
**64 characters per Value**, and `(0012,0063)` is `1-n`; the single-value
default this replaced measured 76 characters with no options and 272 with
every option name published at that time, so every run this library ever
made wrote a value no `LO` may legally carry. The Profile name is now one
Value of 61 characters and each active option is its own, so no option
subset can exceed the maximum.

**Your string is not bounded here, but it is no longer silent.** A value of
your own longer than 64 characters is written through as given - it is
yours, and splitting or truncating it would invent a record you did not
write - and `report.warnings` carries
`DICOM_DEIDENT_METHOD_VALUE_OVER_LENGTH` to say so. Split it on `` yourself
if a strict receiver is in your path. The same code covers an over-long
value the **source file** wrote and this run kept, which in the common case
is this library's own 76-character text from a release before the default
became multi-valued. The measurement is over **bytes**: a Value of 64 bytes
or fewer can never carry more than 64 characters, so it cannot miss one that
is genuinely over, but PS3.5 §6.2 specifies the bound in characters rather
than bytes and excludes Code Extension escape sequences from the count, so it
raises on any conformant Value whose bytes outnumber its counted characters.

PS3.15 E.1.1 says this string is "inserted in or added to" the attribute, so
a value the incoming Data Set already carried is kept and this one is
appended after a `\` as a further value of the `1-n` attribute - the
provenance chain, not a replacement.

**This string is itself a `1-n` value**: it is split on `` and only the
values not already recorded are added.

**Trailing SPACE and NUL are padding, not content** (PS3.5 Table 6.2-1's `LO`
row, which describes a **Value** - and `LO` is `1-n`). They are ignored when
a value here is matched against one already recorded, **per value, on both
sides**, and they are trimmed from the value written. That makes repeated
de-identification a fixed point **from the first pass**, for every string:
with or without a delimiter, and with a pad byte on any value, last or not.
A string that is padding only records nothing. Leading spaces are yours and
are written through untouched.

One bound, and it is over the value that would be **written**, not over the
join: when that value would exceed the largest Value Length an `LO` can
encode, the prior value is **replaced** rather than added to - an element the
serializer cannot encode would take the whole de-identified object down - and
`report.warnings` carries `DICOM_DEIDENT_METHOD_NOT_ADDED`. That includes a
prior value already at the ceiling which records this method already, where
there is no join to exceed anything. A string longer than that ceiling on its
own is not bounded here and will fail to serialize, exactly as it did before
this option grew a join.

`DICOM_DEIDENT_METHOD_NOT_ADDED` means "the length ceiling was reached", never
"every fallback is disclosed": a `(0012,0063)` a file encoded under a VR other
than `LO` is also replaced, and that one raises `DICOM_DEIDENT_METHOD_NOT_LO`.
Two codes rather than one because the causes are unrelated - the chain outgrew
the VR, or the bytes were never in that VR at all - and a prior value that is
empty or padding only raises neither, because nothing was lost.

When the prior value **is** kept, `report.warnings` carries
`DICOM_DEIDENT_METHOD_PRIOR_RETAINED`: `(0012,0063)` is not in Table E.1-1, so
nothing in the run inspected or redacted those bytes, and a name a sender
wrote there is in output stamped `(0012,0062) = YES`. That code discloses the
**retention** only; the **length** of what is written, from whatever source,
is disclosed by `DICOM_DEIDENT_METHOD_VALUE_OVER_LENGTH` and by nothing else.

##### profile?

> `readonly` `optional` **profile?**: [`Profile`](#profile-2)

A [Profile](#profile-2) whose private-dictionary overlay names the
known-safe private attributes to keep when `RetainSafePrivate` is active.

**Not the only way an attribute is known safe, and no longer required for
`RetainSafePrivate` to keep anything.** PS3.15 2026c §E.3.10 lists four ways
that knowledge may be established and a profile is two of them
(Conformance Statement documentation, and "some other means"); the first is
the **file's own** Private Data Element Characteristics Sequence
(0008,0300), which `deidentify()` reads when this Option is active whether
or not a profile is passed. So a file from a vendor you hold no profile for
keeps the private attributes **that file declares** non-identifying, and
passing a profile only ever adds to that: a profile retention survives a
block the declaration calls `UNSAFE` or says nothing about.

🩺 **What the declaration route retains rests on the SENDER's assertion.**
The system that wrote the file said those blocks carry no identifying
information; nothing here re-derives it, and an opaque value in a block
declared `SAFE` reaches de-identified output unexamined. If you do not trust
the sender, leave `RetainSafePrivate` off - §E.3.10's own alternative, and
the only mitigation the standard offers.

With neither this nor a declaration in the file, `RetainSafePrivate` keeps
nothing (fail-safe).

##### retain?

> `readonly` `optional` **retain?**: readonly [`DeidentifyOption`](#deidentifyoption)[]

Annex E option sets to activate (Retain* / Clean*). Default: none.

##### uidMap?

> `readonly` `optional` **uidMap?**: `Map`\<`string`, `string`\>

A caller-owned source→replacement UID cache. Pass one shared map across a
whole study/archive to make UID remapping consistent by construction even
across separate calls (it is consistent anyway - the mapping is content-
derived - but a shared map also makes repeats O(1)).

##### uidRoot?

> `readonly` `optional` **uidRoot?**: `string`

Root for generated UIDs (action `U`). Default `"2.25"`.

***

### DeidentifyReport

The audit trail returned alongside the de-identified dataset.

Most fields are composed from static tables: Part 6 keywords, Annex E action
codes, the active option names.
**Several fields are not, and they are named here rather than in a footnote.**
🛑 **Do not quote a COUNT of them, here or anywhere else.** The count read
"one" and then "two" and then "three", and was wrong every time it was read,
because each correction bumped the numeral without re-deriving the list.
**The list below carried its own numerals until one had to be added, which is
the same disease one step removed, so they are gone.** Treat it as the current
reading of a surface that has grown, not as a proof of exhaustiveness.

- **`uidMap`** - its keys are the source UIDs read out of the file, kept so a
  caller can make UID replacement consistent across a study or an archive. A
  Study or SOP Instance UID is a unique identifying number, so treat it as
  PHI.
- **`removedPrivateTags`** - see the field's own note. On a *well-formed*
  file these are the sender's own private tag numbers and carry nothing; on a
  malformed one a tag can be four bytes of a value, and it is measured, not
  theoretical.
- **`unauditableSequences[].tag`** - see
  [UnauditableSequenceFinding](#unauditablesequencefinding). Same shape as `removedPrivateTags` by a
  narrower route: a private carrier a [Profile](#profile-2) vouched for and this run
  emptied is named there, and an under-declared length upstream can
  resynchronize the reader onto four bytes that spell such a block. The
  package's usual answer to a
  fabricated header, `undefinedVrElements`, carries a byte offset and no tag,
  and still answers it whenever the fabricated VR is outside the 34
  PS3.5 §6.2 defines. It cannot when the fabricated VR is one of them, because those
  two files are byte-identical.
- **`unenumerablePrivateRemovals[].tag`** - see
  [UnenumerablePrivateRemoval](#unenumerableprivateremoval). The same four bytes by the same route,
  on the record of the removal rather than of an emptying, and this one is
  **uncapped** because it is the record of an action rather than a diagnostic.
- **`undefinedVrElements[].byteLength` and
  `unauditableSequences[].byteLength`** - the declared Value Length read off
  the element header, so on a fabricated header it is four document bytes
  wearing a decimal: `"SO\0\0"` publishes `20307`, two letters of a surname,
  put back with one `readUInt32LE`. **They JOINED this list rather than
  always having been on it.** Through `0.0.14` the two
  `DICOM_DEIDENT_*_NOT_AUDITABLE` **messages** rendered the same number;
  binding it out of those factory signatures left these model fields as its
  only publisher, which is a smaller surface and not a closed one. Narrowing
  them is a product call rather than a defect fix: a bound empties the field
  on every well-formed file, where the number is exactly the audit
  information it exists to carry.
- **`group0004Removals[].tag`** - see [Group0004Removal](#group0004removal). The same four
  bytes by the same route as `removedPrivateTags`, on the record of a removal
  PS3.15 §E.1.1 requires. On a well-formed file these are PS3.6's registered
  DICOMDIR directory-structuring tags and carry nothing.
- **`fileMetaElementsDropped[].tag` and `.vr`** - see
  [FileMetaDroppedElement](#filemetadroppedelement). Two bytes rather than four: the File Meta
  pre-pass stops at the first non-`0002` group, so the group half of the tag
  is fixed and only the element number is free, and the VR is two more bytes
  the same desynchronized read would supply. `.byteLength` joins
  `undefinedVrElements[].byteLength` in the entry above by the same route.
- **`contextPath`, on every finding that carries one** - see
  [DeidentifiedAttribute.contextPath](#contextpath-1), which holds the measurement. The
  segment tags come off the wire with no table behind them, so a fabricated
  `SQ` header the reader descended is named there, `PRE-EXISTING`, with **no
  warning and no finding array to correlate it with**. This is the field the
  rest of this docstring, the tolerance table and the troubleshooting guide
  all called structural. **It is a logging hazard and nothing more: on that
  same file the de-identified object itself re-emits the fabricated header, so
  redacting this field does not make the object safe.**

`embeddedAttributes[].hidden` **left that list** in
the diagnostic PHI-residuals fix - an entry is now a literal PS3.15 Table
E.1-1 row, so it is not value-bearing. Its own disclosure had been reworded
twice by then, and this repo deletes a disclosure at that point rather than
writing a third; what is true of the field is stated once, on
[EmbeddedAttributeFinding](#embeddedattributefinding). The field is **still uncapped**.

So "the report is safe to log apart from `uidMap`" is **not** an accurate
description of this type, and was corrected rather than kept convenient.
**This is the only copy of that list.** Two others lived in module docstrings,
still naming `hidden` after it left and never naming `contextPath` at all; a
graded pass found them and they were deleted rather than resynced.

#### Example

```ts
import { deidentify, parseDicom, type DeidentifyReport } from "@cosyte/dicom";
const { report }: { report: DeidentifyReport } = deidentify(parseDicom(buf));
console.log(report.attributes.length, "attributes acted on");
console.log(report.warnings.map((w) => w.code)); // e.g. burned-in annotation
```

#### Properties

##### attributes

> `readonly` **attributes**: readonly [`DeidentifiedAttribute`](#deidentifiedattribute)[]

Per-attribute outcomes for every attribute Annex E acted on.

##### embeddedAttributes

> `readonly` **embeddedAttributes**: readonly [`EmbeddedAttributeFinding`](#embeddedattributefinding)[]

Values emptied because whole Data Elements were encoded inside them by an
over-declared Value Length. Empty on a well-formed file; a non-empty array
means the *source* was malformed in a way that hid attributes from the
action table, so treat it as a data-quality alarm on the sender as well as
an audit line. See [EmbeddedAttributeFinding](#embeddedattributefinding).

##### fileMetaElementsDropped

> `readonly` **fileMetaElementsDropped**: readonly [`FileMetaDroppedElement`](#filemetadroppedelement)[]

Non-modeled `(0002,xxxx)` File Meta elements this run **dropped** instead of
re-emitting, because the de-identified File Meta group describes this
de-identifying application rather than the source (PS3.15 §E.1.1). Empty
when the source group held only modeled elements, and empty when the source
parsed with no File Meta group at all.

**This is the record of a deliberate fidelity loss, not of a defect.** The
byte-for-byte File Meta round trip `FileMeta.extraElements` documents is
scoped to parse-then-serialize and does not hold here.

**Capped; the count beside it is not.** See [FileMetaDroppedElement](#filemetadroppedelement)
and [DeidentifyReport.fileMetaElementsDroppedCount](#filemetaelementsdroppedcount).

##### fileMetaElementsDroppedCount

> `readonly` **fileMetaElementsDroppedCount**: `number`

How many non-modeled `(0002,xxxx)` elements this run dropped, **complete at
any input size**.

The field exists because its sibling array is capped: a caller that needs to
*count* the fidelity loss cannot get the number from an array whose length
saturates, and re-parsing the output does not give it either - the elements
are gone from the output by design. One number cannot be inflated by an
attacker-chosen element count, so bounding it would buy nothing.

##### group0004RemovalCount

> `readonly` **group0004RemovalCount**: `number`

How many `(0004,xxxx)` elements this run removed, **complete at any input
size**, for the reason
[DeidentifyReport.fileMetaElementsDroppedCount](#filemetaelementsdroppedcount) states.

It is also the field that tells the two §E.1.1 rules apart at a glance: this
one counts group-0004 removals, the other counts File Meta drops, and
neither can be read off the other.

##### group0004Removals

> `readonly` **group0004Removals**: readonly [`Group0004Removal`](#group0004removal)[]

Data Elements whose Group Number is `0004`, **removed** at every depth this
run reached, as PS3.15 §E.1.1 requires "from any SOP Instance or DICOM File
other than a DICOMDIR File".

Empty when the object carried none, and empty when it declared Media Storage
SOP Class UID `1.2.840.10008.1.3.10` - the carve-out, which is disclosed on
[DeidentifyReport.warnings](#warnings-2) as
`DICOM_DEIDENT_DICOMDIR_FILE_SET_NOT_DISCHARGED` rather than left to be
inferred from an empty array.

**Capped; the count beside it is not.** See [Group0004Removal](#group0004removal) and
[DeidentifyReport.group0004RemovalCount](#group0004removalcount).

##### removedPrivateTags

> `readonly` **removedPrivateTags**: readonly `string`[]

Private tags removed (kept ones are omitted) - **every one of them,
whichever rule removed it**: the Basic Profile's default removal, a
reservation the file did not settle, and, since the unenumerable class
became a removal, a private attribute this run did not enumerate. Its
meaning is unchanged and it is still uncapped; what it does not carry is a
**reason**, which is why the unenumerable removals are also recorded on
[DeidentifyReport.unenumerablePrivateRemovals](#unenumerableprivateremovals), where they can be told
apart from the rest.

**This is the second field that is not value-free, and the qualification is
measured.** A tag here is composed from four bytes of the source, and on a
file whose Value Lengths disagree with its bytes those four bytes can be
document content rather than a tag the sender wrote: an `OB` carrier holding
`"SECRET-NOTE-"` followed by a well-formed odd-group header reports
`["41534342"]`, whose wire-order bytes read `"SABC"`. That reproduces
identically on every release that has shipped this field.

It is reported anyway, because *which* private tags were removed is the
whole audit value of the field and withholding them would destroy it on
every well-formed file to bound a malformed one. Narrowing it - to blocks a
creator in the same Data Set actually reserved, say - is a product decision
about audit value versus a four-byte echo, not a defect fix, and it has not
been made. Treat this array as PHI when the source is untrusted.

##### retained

> `readonly` **retained**: readonly [`DeidentifyOption`](#deidentifyoption)[]

The Retain/Clean options that were active for this run.

**Not a list of what survived.** Registered attributes Table E.1-1 does not
list are kept without appearing anywhere in this field - `(0012,0063)`
De-identification Method and the prior Items of `(0012,0064)`
De-identification Method Code Sequence are the ones whose retention is
disclosed, as `DICOM_DEIDENT_METHOD_PRIOR_RETAINED` and
`DICOM_DEIDENT_METHOD_CODES_PRIOR_RETAINED` on
[DeidentifyReport.warnings](#warnings-2), because neither is an option set.

##### uidMap

> `readonly` **uidMap**: `ReadonlyMap`\<`string`, `string`\>

Source UID → replacement UID, for cross-file consistency. The **keys are
document values**, not composed identifiers: this is the one field of the
report that carries PHI.

##### unauditableSequences

> `readonly` **unauditableSequences**: readonly [`UnauditableSequenceFinding`](#unauditablesequencefinding)[]

Carriers whose nested Data Sets this run could not reach and **emptied** for
it: an `SQ` whose items the parser did not materialize, so the run had no
Data Sets to walk and could not discharge PS3.15 §E.1.1's obligation inside
them, and a private carrier a [Profile](#profile-2) declares `SQ` that the parse
tree resolved otherwise. Content was dropped from the de-identified output,
and for the first producer the matching `DICOM_SQ_NOT_DESCENDED` entry on
`Dataset.warnings` says why the parse refused.

🛑 **THIS ARRAY NO LONGER PRODUCES `applied: "kept"`, AND THAT IS AN
AUDIT-CONTRACT CHANGE.** A private attribute retained under
`RetainSafePrivate` whose value this run never enumerated used to be listed
here, kept verbatim, with the array saying so. That instance is **removed**
now and recorded on
[DeidentifyReport.unenumerablePrivateRemovals](#unenumerableprivateremovals). An entry here has one
meaning again: this content is **not** in your output.

**Empty on a well-formed file**, including one whose private attributes a
profile vouches for. It stopped being populated by ordinary conformant files
when the retained class left it.

**Capped, and the cap is on the record only.** A crafted input can carry
tens of thousands of un-auditable elements, so this array (and its matching
warnings) stops at `MAX_UNAUDITABLE_SEQUENCE_FINDINGS`. Every un-auditable
carrier is still emptied whether or not it is listed; an array exactly that
long means "at least this many", so read it as truncated rather than as a
total. The unenumerable **removals** are budgeted apart from it and their
record is not capped at all.

**It covers private sequences too.** A
private `SQ` a [Profile](#profile-2) vouches for under `RetainSafePrivate` used to
be kept verbatim and never appear here; it is now emptied and listed on the
same terms as any other, because the profile's licence under PS3.15 §E.3.10
is over a private attribute and not over an item stream nothing could read.

##### undefinedVrElements

> `readonly` **undefinedVrElements**: readonly [`UndefinedVrFinding`](#undefinedvrfinding)[]

Elements emptied because their on-wire VR is not one of the 34 PS3.5 §6.2
defines, so their bytes are not a Value Field this library decoded and
PS3.15 §E.1.1's obligation over what is inside them could not be discharged.
Empty on a file conformant to **PS3.5 2026c**: a sender that writes one of
the 34 VRs that edition defines never produces one, and an Implicit VR LE
file **cannot** - there the VR comes from the dictionary. The edition is not
pedantry: PS3.5 §6.2 exists precisely to say how a *future* VR will be encoded, so
a file conformant to a later edition using a newly defined VR is the
population that sentence exists for. (What such a file does on this
library's parse path is not summarized here - it was measured and the
shapes disagree.) A non-empty array
means the source desynchronized the reader, usually by under-declaring a
Value Length somewhere earlier. See [UndefinedVrFinding](#undefinedvrfinding).

**Capped, and the cap is on the record only**, exactly as
[DeidentifyReport.unauditableSequences](#unauditablesequences) is: a crafted 1 MiB input can
carry over a hundred thousand such elements, so this array and its matching
warnings stop at `MAX_UNDEFINED_VR_FINDINGS`. Every one of them is still
emptied; an array exactly that long means "at least this many".

**A finding here names a byte offset, not a tag** - uniquely among the
report's findings, and for a reason worth reading in
[UndefinedVrFinding](#undefinedvrfinding): the tag of a fabricated header is itself part of
some element's value.

This list has **no carve-out**, and the reason is structural rather than a
promise: `keepOrEmpty` is the **only** path that writes a source value into
de-identified output unchanged, and the test sits at the top of it. Every
other outcome - `X` remove, `Z`/`C` empty, `D` dummy, `U` remap, and a
private tag the Basic Profile drops - already replaces the value. So a
`RetainSafePrivate` element a [Profile](#profile-2) vouches for still reaches this
test and is still emptied. Its sibling
[DeidentifyReport.unauditableSequences](#unauditablesequences) had a real one until
the private `SQ` descent fix; neither has one now, and they arrive at that by
different routes - this one because nothing bypasses `keepOrEmpty`, that one
because a vouched-for private `SQ` is routed into the ordinary `SQ` branches.

##### unenumerablePrivateRemovals

> `readonly` **unenumerablePrivateRemovals**: readonly [`UnenumerablePrivateRemoval`](#unenumerableprivateremoval)[]

Private attributes **removed because this run did not enumerate their
value** - one entry per instance, naming the tag, the outcome (`"removed"`),
the reason (`"unenumerable"`) and the Data Set it lived in.

**This is the surface the fail-safe's audit half is built on, and it is the
one array on this report that is never capped or truncated.** A caller can
separate, from this record alone and for every such removal at any input
size, the attributes removed for being unenumerable from the attributes
removed by the Annex E action table (`report.attributes`) and from the ones
whose value was emptied. The matching warnings ARE bounded, so past their
cap this record is the only complete account and the diagnostics are the
bounded one.

**Empty unless `RetainSafePrivate` plus a `Profile` is active**, because
without both nothing private is retained far enough to be judged: the Basic
Profile removes every private attribute and names it in
[DeidentifyReport.removedPrivateTags](#removedprivatetags) instead. A profile lookup that
**misses** is that case too, and never appears here. **The file's own
(0008,0300) declaration does not populate it either**, and that is not an
omission: a value that declaration covers is one §E.3.10 says the run knows
about, so it is retained rather than reaching this rule at all.

See [UnenumerablePrivateRemoval](#unenumerableprivateremoval) for what counts as enumeration, for
the over-redaction this costs, and for why it names an instance rather than
a tag.

##### unregisteredElementRemovalCount

> `readonly` **unregisteredElementRemovalCount**: `number`

How many elements this run removed under the rule
[DeidentifyReport.unregisteredElementRemovals](#unregisteredelementremovals) records, **complete at
any input size**, for the reason
[DeidentifyReport.fileMetaElementsDroppedCount](#filemetaelementsdroppedcount) states. `0` on a run
that removed none.

##### unregisteredElementRemovals

> `readonly` **unregisteredElementRemovals**: readonly [`UnregisteredElementRemoval`](#unregisteredelementremoval)[]

Non-private Data Elements **removed** at every depth this run reached
because this build's PS3.6 2026d registry does not carry their tag and Table
E.1-1 does not list it. See [UnregisteredElementRemoval](#unregisteredelementremoval) for the rule,
for what it costs on a newer-edition file, and for why an entry names a byte
offset and no tag.

Empty on a run that removed none. A separate record from
[DeidentifyReport.attributes](#attributes), [DeidentifyReport.removedPrivateTags](#removedprivatetags),
[DeidentifyReport.group0004Removals](#group0004removals) and
[DeidentifyReport.undefinedVrElements](#undefinedvrelements): an element removed here is on
none of those.

**Capped; the count beside it is not.** See
[DeidentifyReport.unregisteredElementRemovalCount](#unregisteredelementremovalcount).

##### warnings

> `readonly` **warnings**: readonly [`DicomParseWarning`](#dicomparsewarning)[]

Safety warnings - notably burned-in-pixel annotation that cannot be cleaned.

***

### DeidentifyResult

The result of [deidentify](#deidentify): a new dataset plus its audit report.

#### Example

```ts
import { deidentify, parseDicom, serializeDicom, type DeidentifyResult } from "@cosyte/dicom";
const { dataset, report }: DeidentifyResult<ReturnType<typeof parseDicom>> = deidentify(parseDicom(buf));
const safe = serializeDicom(dataset); // input dataset is never mutated
void report;
```

#### Type Parameters

##### TDataset

`TDataset`

#### Properties

##### dataset

> `readonly` **dataset**: `TDataset`

##### report

> `readonly` **report**: [`DeidentifyReport`](#deidentifyreport)

***

### DicomDate

A tolerantly-decoded `DA` (Date) value. `raw` always carries the on-wire
string (PHI-safe - a date is not an identifier on its own, but is
preserved verbatim regardless). `valid` is `true` only when the string
parsed cleanly to a `YYYYMMDD` calendar date; otherwise the numeric
fields are omitted and `raw` is the source of truth.

#### Example

```ts
import type { DicomDate } from "@cosyte/dicom";
const d: DicomDate = { raw: "20240115", valid: true, year: 2024, month: 1, day: 15 };
```

#### Properties

##### day?

> `readonly` `optional` **day?**: `number`

##### month?

> `readonly` `optional` **month?**: `number`

##### raw

> `readonly` **raw**: `string`

##### valid

> `readonly` **valid**: `boolean`

##### year?

> `readonly` `optional` **year?**: `number`

***

### DicomDateTime

A tolerantly-decoded `DT` (DateTime) value (PS3.5 §6.2). `offsetMinutes`
is the signed UTC offset (`&ZZXX` suffix) in minutes when present.

#### Example

```ts
import type { DicomDateTime } from "@cosyte/dicom";
const dt: DicomDateTime = { raw: "20240115133015", valid: true, year: 2024, month: 1, day: 15, hours: 13, minutes: 30, seconds: 15 };
```

#### Properties

##### day?

> `readonly` `optional` **day?**: `number`

##### fractionalSeconds?

> `readonly` `optional` **fractionalSeconds?**: `number`

##### hours?

> `readonly` `optional` **hours?**: `number`

##### minutes?

> `readonly` `optional` **minutes?**: `number`

##### month?

> `readonly` `optional` **month?**: `number`

##### offsetMinutes?

> `readonly` `optional` **offsetMinutes?**: `number`

##### raw

> `readonly` **raw**: `string`

##### seconds?

> `readonly` `optional` **seconds?**: `number`

##### valid

> `readonly` **valid**: `boolean`

##### year?

> `readonly` `optional` **year?**: `number`

***

### DicomDirectory

The Directory Record tree of a DICOMDIR, read from its offsets.

`records` is every Item of the Directory Record Sequence, in order, whether
or not an offset reaches it. `root` is the root directory entity: the record
`(0004,1200)` names, then each `(0004,1400)` successor in order. A record is
reached at most once: an offset that would reach one again is not followed.

#### Example

```ts
import { parseDicom, type DirectoryRecord } from "@cosyte/dicom";
const dir = parseDicom(buf).directory; // undefined unless the object is a DICOMDIR
const walk = (records: readonly DirectoryRecord[], depth = 0): void => {
  for (const r of records) {
    console.log(" ".repeat(depth), r.type, r.referencedFileId?.join("/"));
    walk(r.lowerLevel, depth + 1);
  }
};
if (dir !== undefined) walk(dir.root);
```

#### Properties

##### records

> `readonly` **records**: readonly [`DirectoryRecord`](#directoryrecord)[]

Every Directory Record, in Directory Record Sequence order.

##### root

> `readonly` **root**: readonly [`DirectoryRecord`](#directoryrecord)[]

The root directory entity, in `(0004,1400)` order.

***

### DicomFileHandle

A file handle `readDicomHeader` can read from: Node's `FileHandle` from `node:fs/promises`, or
anything with the same positional `read`. It is read from byte 0 with explicit positions, and
never closed: the caller who opened it closes it.

#### Example

```ts
import { open } from "node:fs/promises";
import { readDicomHeader } from "@cosyte/dicom";
// Node's FileHandle is a DicomFileHandle.
const handle = await open("study.dcm");
try {
  const ds = await readDicomHeader(handle);
  console.log(ds.has("00100010"));
} finally {
  await handle.close();
}
```

#### Methods

##### read()

> **read**(`buffer`, `offset`, `length`, `position`): `Promise`\<\{ `bytesRead`: `number`; \}\>

###### Parameters

###### buffer

`Uint8Array`

###### offset

`number`

###### length

`number`

###### position

`number`

###### Returns

`Promise`\<\{ `bytesRead`: `number`; \}\>

***

### DicomJsonAttribute

One attribute of a DICOM JSON Data Set: its VR, and at most one of `Value`, `InlineBinary` and
`BulkDataURI`. An attribute with none of the three is present with an empty value.

#### Example

```ts
import type { DicomJsonAttribute } from "@cosyte/dicom";
const rows: DicomJsonAttribute = { vr: "US", Value: [512] };
```

#### Properties

##### BulkDataURI?

> `readonly` `optional` **BulkDataURI?**: `string`

##### InlineBinary?

> `readonly` `optional` **InlineBinary?**: `string`

##### Value?

> `readonly` `optional` **Value?**: readonly [`DicomJsonValue`](#dicomjsonvalue)[]

##### vr

> `readonly` **vr**: `string`

***

### DicomJsonDataset

A DICOM JSON Data Set: attributes keyed by their tag as eight uppercase hex digits, Group
Number then Element Number, `"00100010"` for Patient's Name.

#### Example

```ts
import type { DicomJsonDataset } from "@cosyte/dicom";
const ds: DicomJsonDataset = { "00080060": { vr: "CS", Value: ["CT"] } };
```

#### Indexable

> \[`tag`: `string`\]: [`DicomJsonAttribute`](#dicomjsonattribute)

***

### DicomJsonPersonName

One Person Name value: its alphabetic, ideographic and phonetic component groups, each the
group's text with its `^` component separators kept. A group the value does not carry is left
out.

#### Example

```ts
import type { DicomJsonPersonName } from "@cosyte/dicom";
const name: DicomJsonPersonName = { Alphabetic: "DOE^JANE" };
```

#### Properties

##### Alphabetic?

> `readonly` `optional` **Alphabetic?**: `string`

##### Ideographic?

> `readonly` `optional` **Ideographic?**: `string`

##### Phonetic?

> `readonly` `optional` **Phonetic?**: `string`

***

### DicomParseWarning

Data shape for every Tier-2 warning emitted by the parser. Warnings are
plain data (distinct from `DicomParseError`, which is a thrown `Error`
subclass) so they can be safely accumulated into `Dataset.warnings` and
passed to `onWarning` callbacks.

There is intentionally NO `snippet` field on warnings:
real-world files routinely produce 50+ warnings and a per-warning
snippet would balloon retained memory. Snippets appear only on
`DicomParseError` (the strict-mode escalation path).

#### Example

```ts
import type { DicomParseWarning } from "@cosyte/dicom";
const w: DicomParseWarning = {
  code: "DICOM_MISSING_PREAMBLE",
  message: "No DICM magic at offset 128.",
  position: { byteOffset: 0 },
};
```

#### Properties

##### code

> `readonly` **code**: [`WarningCode`](#warningcode)

##### message

> `readonly` **message**: `string`

##### position

> `readonly` **position**: [`DicomPosition`](#dicomposition)

***

### DicomPosition

Positional context for a `DicomParseWarning` or `DicomParseError`.

**🛑 `byteOffset` IS NOT ALWAYS RELATIVE TO THE SOURCE BUFFER, AND THIS
JSDOC SAID IT WAS.** For the Deflated Explicit VR LE transfer syntax,
`deflated: true` says the offset indexes the inflated dataset buffer rather
than the on-disk source. That flag is the only frame this type carries, and
it is not the only frame this parser has: a defined-length Sequence Item is
parsed from a **slice**, so a warning raised inside one carries an
item-relative offset with nothing on the position to say so. The same is true
of `Element.byteOffset`, and has been since the parser was written.

**The residual is `PRE-EXISTING` and is not closed here.** What is closed is
the thrown side: `DicomParseError.offsetFrame` names the coordinate system
from a closed set (see `OFFSET_FRAMES`), and that covers a Tier-3 fatal and
the `{ strict: true }` escalation of a Tier-2 warning. It does not reach a
warning on the lenient path, which is this type. Do not read the fatal's
frame contract as one this type has.

With `exactOptionalPropertyTypes: true`, callers should omit unset keys
rather than passing `undefined` (mirrors `@cosyte/hl7` sibling discipline).

#### Example

```ts
import type { DicomPosition } from "@cosyte/dicom";
const p: DicomPosition = { byteOffset: 132, fileMeta: true };
```

#### Properties

##### byteOffset

> `readonly` **byteOffset**: `number`

##### contextPath?

> `readonly` `optional` **contextPath?**: readonly `string`[]

Tag chain for nested SQ items, e.g. `["0040A730", "0", "00080100"]`. Omit when at root.

##### deflated?

> `readonly` `optional` **deflated?**: `boolean`

True when offset is into the inflated dataset buffer (Deflated TS only). Omit when not applicable.

##### fileMeta?

> `readonly` `optional` **fileMeta?**: `boolean`

True when offset is inside the File Meta group. Omit (do not pass `undefined`) when not applicable.

***

### DicomTime

A tolerantly-decoded `TM` (Time) value (PS3.5 §6.2; max length 14 bytes).
`fractionalSeconds` is the value after the decimal point as a number in
`[0,1)` when present.

#### Example

```ts
import type { DicomTime } from "@cosyte/dicom";
const t: DicomTime = { raw: "133015.250000", valid: true, hours: 13, minutes: 30, seconds: 15, fractionalSeconds: 0.25 };
```

#### Properties

##### fractionalSeconds?

> `readonly` `optional` **fractionalSeconds?**: `number`

##### hours?

> `readonly` `optional` **hours?**: `number`

##### minutes?

> `readonly` `optional` **minutes?**: `number`

##### raw

> `readonly` **raw**: `string`

##### seconds?

> `readonly` `optional` **seconds?**: `number`

##### valid

> `readonly` **valid**: `boolean`

***

### DirectoryRecord

One Directory Record of a DICOMDIR: an Item of the Directory Record Sequence
`(0004,1220)`, with the records its offsets name.

#### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const dir = parseDicom(buf).directory;
for (const patient of dir?.root ?? []) {
  patient.type; // "PATIENT"
  for (const study of patient.lowerLevel) study.item.get("0020000D"); // Study Instance UID
}
```

#### Properties

##### index

> `readonly` **index**: `number`

The record's 0-based index in the Directory Record Sequence.

##### item

> `readonly` **item**: [`Item`](#item)

The record's own Data Set, for its record keys.

##### lowerLevel

> `readonly` **lowerLevel**: readonly [`DirectoryRecord`](#directoryrecord)[]

The records of this record's lower-level directory entity: the one its
`(0004,1420)` names, then each `(0004,1400)` successor in order. Empty when
the offset is zero or names no record.

##### referencedFileId

> `readonly` **referencedFileId**: readonly `string`[] \| `undefined`

The Referenced File ID `(0004,1500)`: its components in order (a path
relative to the File-set root, one component per value), as the file wrote
them less only the padding PS3.5 makes insignificant in `CS` (the trailing
pad, and each value's leading and trailing spaces). Kept verbatim: never
de-identified, rewritten or joined, and the element's own bytes on `item`
are untouched. `undefined` when the record carries none.

##### type

> `readonly` **type**: `string` \| `undefined`

The Directory Record Type `(0004,1430)` value (`"PATIENT"`, `"STUDY"`,
`"SERIES"`, `"IMAGE"` and the rest PS3.3 F.5 defines), or `undefined` when
the record carries none.

***

### EmbeddedAttributeFinding

One value that was emptied because a Data Element was found **inside** it.

PS3.5 defines Value Length as the length of that element's own Value Field. A
sender that over-declares it produces a file whose reading is self-consistent
and whose next element has been absorbed into the previous one's value - and
Table E.1-1 is keyed by tag, so an absorbed `(0010,0020)` is not an attribute
any longer and no action fires on it. `deidentify` therefore refuses to keep a
value whose tail decodes as whole Data Elements it would have acted on
(PS3.15 §E.1 "all instances"; §E.3.5 is the standard's own precedent for
removing identifying information embedded inside a string attribute).

`tag` and `vr` are the carrier's own and are structural. **`hidden` was not,
and it is bound now.** Every tag in an embedded run is composed from four
bytes that were sitting *inside* the carrier's value - that is the whole
reason this type exists - and a run needs only ONE actionable attribute to be
reported, so through `0.0.13` the rest of the run was listed beside it.
Measured: a `CS` carrier over-declaring across a fabricated `"SMIT"` header
beside a genuine `(0010,0020)` reported `hidden: ["4D535449", "00100020"]`,
and `4D535449` is `"SMIT"` in wire order.

**An entry is now one of the 653 literal rows of PS3.15 Table E.1-1 that this
run's options left actionable.** That is a **membership** bound rather than a
shape one - the posture this package already takes for a VR and for a Private
Creator - so what survives names a published table entry rather than a
document byte, the same trade rendering a VR makes with the 34. **A
repeating-group mask hit is NOT in that set and is excluded**: `(50xx,xxxx)`
Curve Data leaves the whole 16-bit element number free, so a mask match proves
a rule exists without making the membership finite. A graded pass caught a
draft of this filter that admitted it.

**🛑 THAT IS NOT AN ALL-CLEAR OVER THIS TYPE.** `contextPath` below is
unbound and unchanged, `hidden` is uncapped, and
[DeidentifyReport](#deidentifyreport) names the report's other value-bearing fields. A
`DeidentifyReport` is still not safe to log whole.

#### Example

```ts
import { deidentify, parseDicom } from "@cosyte/dicom";
const { report } = deidentify(parseDicom(buf));
for (const e of report.embeddedAttributes) {
  console.warn(`${e.tag} hid ${e.hidden.join(", ")} in its value`);
}
```

#### Properties

##### contextPath?

> `readonly` `optional` **contextPath?**: readonly `string`[]

Tag/index chain when the carrier is inside a sequence item; omitted at the
root. **Built by the same descent as
[DeidentifiedAttribute.contextPath](#contextpath-1) and carrying the same caveat:
each segment's tag is read off the wire, bound by nothing, so on a
desynchronized read it can be four bytes of a value.** Read that field's
note before logging this one.

##### hidden

> `readonly` **hidden**: readonly `string`[]

The tags found inside the carrier's value **that this run acts on and that a
published table names**, in wire order. **Not every tag in the run** - see
this type's own remarks.

**🩺 IT MAY BE EMPTY, AND EMPTY DOES NOT MEAN "NOTHING WAS HIDDEN HERE".**
A run whose only actionable members are private attributes, Curve Data or
Overlay elements reports a finding with no tags: the carrier was still
emptied, and the accompanying `DICOM_DEIDENT_EMBEDDED_ATTRIBUTE_REMOVED`
warning still counts the whole run. The presence of the finding is the fact;
this list is the part of it that can be named.

##### tag

> `readonly` **tag**: `string`

The carrier - the element whose over-declared value held the others.

##### vr

> `readonly` **vr**: [`VR`](namespaces/Dictionary.md#vr-1)

The carrier's VR. Always one of the string VRs; binary VRs are not scanned.

***

### FileMeta

The Part-10 File Meta Information group, projected as a typed view
over `(0002,xxxx)` elements parsed during the File Meta pre-pass.

Only `transferSyntaxUID` is required because it is the dispatch input
for the transfer-syntax parsers; everything else is optional
because real-world clinical files routinely omit one or more
Type-1 elements. `validate()` adds opinion-bearing checks
for those missing elements.

#### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const ds = parseDicom(buf);
if (ds.fileMeta !== undefined) {
  const ts = ds.fileMeta.transferSyntaxUID; // always present when fileMeta is defined
}
```

#### Properties

##### extraElements?

> `readonly` `optional` **extraElements?**: readonly [`FileMetaRawElement`](#filemetarawelement)[]

Any `(0002,xxxx)` elements the source carried that the typed fields above
do not model, preserved in tag order so a round-trip re-emits the File Meta
group byte-for-byte. Omitted when the group held only modeled elements.

**🛑 The byte-for-byte round trip does NOT hold for `deidentify()` output**

That promise is about **parse then serialize**, and it is scoped to it
deliberately rather than by omission. `deidentify()` rebuilds this group to
describe the de-identifying application instead of the source (PS3.15
§E.1.1: the File Meta Information "shall be replaced with a description of
the de-identifying application", because otherwise "identity information may
leak through unmodified File Meta Information ... includ[ing] information
regarding Application Entity Titles, Presentation Addresses, implementation
information, and private information"). So on the de-identify path this
array is **dropped in full** - not filtered, not sampled - and
`sourceApplicationEntityTitle` goes with it, while
`implementationClassUID` and `implementationVersionName` are replaced with
this library's own.

The elements that survive are the ones that identify the **object** rather
than its sender: `fileMetaInformationVersion`, `mediaStorageSOPClassUID`,
`transferSyntaxUID`, and `mediaStorageSOPInstanceUID` (remapped unless
`RetainUIDs` is active). What was dropped is counted on the report
`deidentify()` returns, so a caller learns the fidelity loss from the run
rather than by diffing the bytes.

A caller that needs the source group verbatim must read it off the
**parsed** dataset; it is not recoverable from de-identified output, and it
is not meant to be.

##### fileMetaInformationVersion?

> `readonly` `optional` **fileMetaInformationVersion?**: `Buffer`\<`ArrayBufferLike`\>

##### implementationClassUID?

> `readonly` `optional` **implementationClassUID?**: `string`

##### implementationVersionName?

> `readonly` `optional` **implementationVersionName?**: `string`

##### mediaStorageSOPClassUID?

> `readonly` `optional` **mediaStorageSOPClassUID?**: `string`

##### mediaStorageSOPInstanceUID?

> `readonly` `optional` **mediaStorageSOPInstanceUID?**: `string`

##### sourceApplicationEntityTitle?

> `readonly` `optional` **sourceApplicationEntityTitle?**: `string`

##### transferSyntaxUID

> `readonly` **transferSyntaxUID**: `string`

***

### FileMetaDroppedElement

One non-modeled `(0002,xxxx)` File Meta element `deidentify()` **dropped**
rather than re-emitting into de-identified output.

**Why the drop is unconditional**

PS3.15 2026c §E.1.1 requires the File Meta Information of a de-identified
DICOM File to "be replaced with a description of the de-identifying
application", because otherwise "identity information may leak through
unmodified File Meta Information ... [t]his includes information regarding
Application Entity Titles, Presentation Addresses, implementation
information, and private information". A non-modeled `(0002,xxxx)` element is
by definition one this library cannot describe: `(0002,0017)` Sending AE
Title, `(0002,0018)` Receiving AE Title, `(0002,0100)` Private Information
Creator UID and `(0002,0102)` Private Information are all in that class, and
so is anything a vendor invented. The fail-safe direction is to drop what
cannot be described, so no Annex E Option and no parse quality changes the
outcome.

**Capped record, complete count**

The array is bounded per run (`MAX_FILE_META_DROP_FINDINGS`) because the
number of elements a crafted File Meta group can carry is chosen by the input.
The **action** is not bounded: every such element is dropped whether or not it
is listed, and [DeidentifyReport.fileMetaElementsDroppedCount](#filemetaelementsdroppedcount) is the
complete total at any input size. An array exactly the cap's length means "at
least this many"; read the count, not the length.

**What it carries**

`tag` and `vr` come off the wire. The File Meta pre-pass stops at the first
element whose group is not `0002`, so a tag reaching this record always has
`0002` as its group, but its element number is two bytes the file supplied and
a File Meta element that over-declared its length can desynchronize the
pre-pass onto two bytes of somebody's value. Same standing exception as
[DeidentifyReport.removedPrivateTags](#removedprivatetags), by a narrower route and with two
bytes rather than four. `byteLength` is the length of the value that was
dropped, read off that same header. It is published because *what* was dropped
is the whole audit value of a record of a deliberate fidelity loss.

#### Example

```ts
import { deidentify, parseDicom, type FileMetaDroppedElement } from "@cosyte/dicom";
const { report } = deidentify(parseDicom(buf));
const dropped: readonly FileMetaDroppedElement[] = report.fileMetaElementsDropped;
// The tag, the VR and the length can be bytes of the file (above): log the count instead.
console.warn(`${String(dropped.length)} File Meta element(s) not re-emitted`);
```

#### Properties

##### byteLength

> `readonly` **byteLength**: `number`

Byte length of the value that is not in the de-identified output.

##### tag

> `readonly` **tag**: `string`

The dropped element's `(0002,xxxx)` tag.

##### vr

> `readonly` **vr**: [`VR`](namespaces/Dictionary.md#vr-1)

The VR the source file wrote for it (the File Meta group is Explicit VR LE).

***

### FileMetaRawElement

A non-modeled `(0002,xxxx)` File Meta element, preserved verbatim so the
serializer can re-emit an exotic File Meta group byte-for-byte.

The typed [FileMeta](#filemeta-3) fields cover the common Type-1/Type-3 elements;
anything else a source file carried - e.g. `(0002,0017)`/`(0002,0018)`
Sending/Receiving AE Title, `(0002,0100)` Private Information Creator UID,
`(0002,0102)` Private Information - is captured here as raw bytes (the
on-wire value, even-length per PS3.5 §6.2) rather than dropped. `value` is a
defensive copy, so the view never aliases the parsed input buffer.

🛑 **THE ROUND TRIP IS PARSE-THEN-SERIALIZE ONLY. `deidentify()` DROPS EVERY
ELEMENT THIS TYPE DESCRIBES**, and the exact examples above are why: a Sending
AE Title and a Private Information pair are the identity information PS3.15
§E.1.1 names. See [FileMeta.extraElements](#extraelements) for the whole carve-out.

#### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const ds = parseDicom(buf);
// Anything the typed FileMeta fields do not model, in ascending tag order.
for (const raw of ds.fileMeta?.extraElements ?? []) {
  raw.tag; // e.g. "00020017" Sending Application Entity Title
  raw.vr; // the VR the source wrote (File Meta is always Explicit VR LE)
  raw.value.length; // even, per PS3.5 2026c section 7.1.1
}
```

`(0002,0016)` Source Application Entity Title is deliberately NOT the example: it is one of the
typed fields, so it never reaches this array.

#### Properties

##### tag

> `readonly` **tag**: `string`

8-char uppercase hex tag, e.g. `"00020100"`.

##### value

> `readonly` **value**: `Buffer`

The raw on-wire value bytes (even-length), copied out of the input.

##### vr

> `readonly` **vr**: [`VR`](namespaces/Dictionary.md#vr-1)

The element's Value Representation as read under Explicit VR LE.

***

### FrameFunctionalGroups

The five Enhanced multi-frame functional-group macros, resolved for a
single frame Per-Frame-else-Shared (PS3.3 §C.7.6.16). Each macro is
typed-absent when present in neither the per-frame nor the shared group
(the three *geometry* macros are treated as required for an enhanced
object - see [ImageView.frame](#frame)).

#### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const f = parseDicom(enhancedBuf).image.frame(0);
f.planePosition?.imagePositionPatient; // this frame's [x,y,z]
f.pixelMeasures?.pixelSpacing;         // this frame's [row,col] mm
```

#### Properties

##### frameVoiLut?

> `readonly` `optional` **frameVoiLut?**: `object`

###### windowCenter?

> `readonly` `optional` **windowCenter?**: readonly (`number` \| `null`)[]

###### windowWidth?

> `readonly` `optional` **windowWidth?**: readonly (`number` \| `null`)[]

##### index

> `readonly` **index**: `number`

##### pixelMeasures?

> `readonly` `optional` **pixelMeasures?**: `object`

###### pixelSpacing?

> `readonly` `optional` **pixelSpacing?**: readonly (`number` \| `null`)[]

###### sliceThickness?

> `readonly` `optional` **sliceThickness?**: `number`

###### spacingBetweenSlices?

> `readonly` `optional` **spacingBetweenSlices?**: `number`

##### pixelValueTransformation?

> `readonly` `optional` **pixelValueTransformation?**: `object`

###### rescaleIntercept?

> `readonly` `optional` **rescaleIntercept?**: `number`

###### rescaleSlope?

> `readonly` `optional` **rescaleSlope?**: `number`

###### rescaleType?

> `readonly` `optional` **rescaleType?**: `string`

##### planeOrientation?

> `readonly` `optional` **planeOrientation?**: `object`

###### imageOrientationPatient?

> `readonly` `optional` **imageOrientationPatient?**: readonly (`number` \| `null`)[]

##### planePosition?

> `readonly` `optional` **planePosition?**: `object`

###### imagePositionPatient?

> `readonly` `optional` **imagePositionPatient?**: readonly (`number` \| `null`)[]

***

### FromDicomJsonOptions

Options for `fromDicomJson`.

#### Example

```ts
import { fromDicomJson, type FromDicomJsonOptions } from "@cosyte/dicom";
const options: FromDicomJsonOptions = {
  fileMeta: { transferSyntaxUID: "1.2.840.10008.1.2.1" },
  sequenceLength: "undefined",
};
fromDicomJson({ "00080060": { vr: "CS", Value: ["CT"] } }, options);
```

#### Properties

##### fileMeta?

> `readonly` `optional` **fileMeta?**: [`FileMeta`](#filemeta-3)

The File Meta Information the Data Set is written under; its `transferSyntaxUID` picks the
encoding. The JSON Model holds no File Meta, so a round trip passes the source's
`Dataset.fileMeta` back here. Left out, the Data Set is written under Explicit VR Little
Endian (`1.2.840.10008.1.2.1`) with no other File Meta element.

##### resolveBulkData?

> `readonly` `optional` **resolveBulkData?**: (`uri`, `vr`) => `Buffer`\<`ArrayBufferLike`\> \| `Uint8Array`\<`ArrayBufferLike`\> \| `undefined`

Resolves a `BulkDataURI` to the value's bytes, given the URI and the attribute's VR, which is
any VR PS3.18 F.2.2 allows a `BulkDataURI` on, text and number VRs among them. Return the
bytes in Little Endian order, as a DICOMweb service serves them: under Explicit VR Big Endian
they are swapped, value by value. Return `undefined` for a URI it cannot resolve, which is
refused with `BULK_DATA_UNRESOLVED`.

###### Parameters

###### uri

`string`

###### vr

`string`

###### Returns

`Buffer`\<`ArrayBufferLike`\> \| `Uint8Array`\<`ArrayBufferLike`\> \| `undefined`

##### sequenceLength?

> `readonly` `optional` **sequenceLength?**: `"undefined"` \| `"defined"`

How each Sequence and each Item is delimited: `"defined"` (the default) writes explicit
lengths, `"undefined"` writes undefined lengths closed by delimitation items. The JSON Model
does not record which a source used.

***

### Group0004Removal

One Data Element whose Group Number is `0004`, **removed** from de-identified
output.

**The rule, and the one object it does not apply to**

PS3.15 2026c §E.1.1: "All Data Elements with a Group Number of 0004 shall be
removed from any SOP Instance or DICOM File other than a DICOMDIR File." The
rule is unconditional over the Annex E Options - it sits in the list §E.1.1
imposes on any de-identifier claim and no Option qualifies it - so no
`retain` argument brings a `(0004,xxxx)` element back.

The DICOMDIR carve-out is decided once per run from the source File Meta's
`(0002,0002)` Media Storage SOP Class UID, and only the value
`1.2.840.10008.1.3.10` (Media Storage Directory Storage) selects it. An object
that declares no Media Storage SOP Class UID at all is therefore **not** a
DICOMDIR and the removal applies to it. When the carve-out does fire, this
array is empty and `DICOM_DEIDENT_DICOMDIR_FILE_SET_NOT_DISCHARGED` says what
else the run did not do.

**Every depth, and the removal decides nothing below it**

The test runs on each element of each Data Set the run reaches, root and
Sequence Item alike, so a `(0004,xxxx)` planted inside an item is removed
there too. It is a test on **one element's tag**: it never stands in for a
decision about the Data Sets nested inside some other element, which is the
shape the private `SQ` descent fix was opened for. Removing a `(0004,xxxx)`
that is itself a Sequence removes its items with it, exactly as a Table E.1-1
`X` action does.

**Capped record, complete count**

Bounded per run at `MAX_GROUP_0004_FINDINGS`, on its own counter so a flood of
one diagnostic class cannot spend another's budget. The removal itself is not
bounded, and [DeidentifyReport.group0004RemovalCount](#group0004removalcount) is complete at any
input size.

**What it carries**

`tag` is composed from four bytes of the source and `contextPath` from four
more per segment - the standing exception
[DeidentifyReport.removedPrivateTags](#removedprivatetags) and
[UnauditableSequenceFinding](#unauditablesequencefinding) already carry, by the same route. On a
well-formed file these are the DICOMDIR directory-structuring tags PS3.6
registers and carry nothing.

#### Example

```ts
import { deidentify, parseDicom, type Group0004Removal } from "@cosyte/dicom";
const { report } = deidentify(parseDicom(buf));
report.group0004Removals.forEach((r: Group0004Removal) => {
  // The tag and the path are read from the file, so log that a removal happened and its depth.
  console.warn("group 0004 element removed, depth", r.contextPath?.length ?? 0);
});
```

#### Properties

##### applied

> `readonly` **applied**: `"removed"`

The outcome, always `"removed"`: no element bearing that tag is in the Data
Set that held it, in the returned dataset or in the serialized bytes.

##### contextPath?

> `readonly` `optional` **contextPath?**: readonly `string`[]

Tag/index chain when the element was inside a sequence item; omitted at the
root. **Built by the same descent as
[DeidentifiedAttribute.contextPath](#contextpath-1) and carrying the same caveat:
each segment's tag is read off the wire, bound by nothing, so on a
desynchronized read it can be four bytes of a value.** Read that field's
note before logging this one.

##### tag

> `readonly` **tag**: `string`

The removed element's tag. Its group is always `0004`.

***

### ImageView

Pixel-interpretation + geometry metadata - the
"wrong pixels look fine" and "looks fine, measures wrong" classes. v1 does
not decode pixels; this view surfaces exactly what a renderer needs so it
does not have to guess.

Safety-critical omissions are intentional: `rescaleSlope` is absent (not
`1`) when the tag is absent; `signed` is absent (not a guess) unless
`(0028,0103)` was present; `photometricInterpretation` is absent (not
`MONOCHROME2`) when absent; the three pixel-spacing fields are distinct.
When `modalityLutSequence` / `voiLutSequence` are present they are
authoritative over the linear `rescale*` / `window*` pairs.

#### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const img = parseDicom(buf).image;
img.rescaleSlope; // undefined ⇒ caller MUST NOT assume 1
img.signed;       // undefined ⇒ signedness unknown, never guess
img.pixelSpacing; // patient-plane mm - distinct from imagerPixelSpacing
```

#### Properties

##### bitsAllocated?

> `readonly` `optional` **bitsAllocated?**: `number`

##### bitsStored?

> `readonly` `optional` **bitsStored?**: `number`

##### columns?

> `readonly` `optional` **columns?**: `number`

##### frameOfReferenceUid?

> `readonly` `optional` **frameOfReferenceUid?**: `string`

##### highBit?

> `readonly` `optional` **highBit?**: `number`

##### imageOrientationPatient?

> `readonly` `optional` **imageOrientationPatient?**: readonly (`number` \| `null`)[]

##### imagePositionPatient?

> `readonly` `optional` **imagePositionPatient?**: readonly (`number` \| `null`)[]

##### imagerPixelSpacing?

> `readonly` `optional` **imagerPixelSpacing?**: readonly (`number` \| `null`)[]

##### isEnhancedMultiFrame

> `readonly` **isEnhancedMultiFrame**: `boolean`

`true` when this object carries Per-Frame/Shared Functional Groups.

##### modalityLutSequence?

> `readonly` `optional` **modalityLutSequence?**: readonly [`Item`](#item)[]

##### nominalScannedPixelSpacing?

> `readonly` `optional` **nominalScannedPixelSpacing?**: readonly (`number` \| `null`)[]

##### numberOfFrames?

> `readonly` `optional` **numberOfFrames?**: `number`

##### photometricInterpretation?

> `readonly` `optional` **photometricInterpretation?**: `string`

##### pixelRepresentation?

> `readonly` `optional` **pixelRepresentation?**: `number`

Raw `(0028,0103)` value: 0 = unsigned, 1 = signed. Absent ⇒ unknown.

##### pixelSpacing?

> `readonly` `optional` **pixelSpacing?**: readonly (`number` \| `null`)[]

##### planarConfiguration?

> `readonly` `optional` **planarConfiguration?**: `number`

##### realWorldValueMaps?

> `readonly` `optional` **realWorldValueMaps?**: readonly [`RealWorldValueMap`](#realworldvaluemap)[]

##### rescaleIntercept?

> `readonly` `optional` **rescaleIntercept?**: `number`

##### rescaleSlope?

> `readonly` `optional` **rescaleSlope?**: `number`

##### rescaleType?

> `readonly` `optional` **rescaleType?**: `string`

##### rows?

> `readonly` `optional` **rows?**: `number`

##### samplesPerPixel?

> `readonly` `optional` **samplesPerPixel?**: `number`

##### signed?

> `readonly` `optional` **signed?**: `boolean`

`true`/`false` only when `(0028,0103)` was 1/0; absent ⇒ never guessed.

##### sliceThickness?

> `readonly` `optional` **sliceThickness?**: `number`

##### sopInstanceUid?

> `readonly` `optional` **sopInstanceUid?**: `string`

##### spacingBetweenSlices?

> `readonly` `optional` **spacingBetweenSlices?**: `number`

##### units?

> `readonly` `optional` **units?**: `string`

##### voiLutSequence?

> `readonly` `optional` **voiLutSequence?**: readonly [`Item`](#item)[]

##### windowCenter?

> `readonly` `optional` **windowCenter?**: readonly (`number` \| `null`)[]

##### windowWidth?

> `readonly` `optional` **windowWidth?**: readonly (`number` \| `null`)[]

#### Methods

##### frame()

> **frame**(`index`): [`FrameFunctionalGroups`](#framefunctionalgroups)

Resolve the functional-group macros for frame `index` Per-Frame-else-Shared.
Throws [DicomValueError](#dicomvalueerror) `FRAME_INDEX_OUT_OF_RANGE` for an index
outside `[0, numberOfFrames)` and `MISSING_REQUIRED_FUNCTIONAL_GROUP`
when an enhanced object lacks a required geometry macro in both groups.

###### Parameters

###### index

`number`

###### Returns

[`FrameFunctionalGroups`](#framefunctionalgroups)

***

### OtherPatientId

One entry of Other Patient IDs Sequence `(0010,1002)` - a `{id, issuer,
typeCode}` triple (PS3.3 §10.15, the DICOM analogue of an HL7 v2 CX
repetition). Surfaced so a caller never matches on a bare `(0010,0020)`.

#### Example

```ts
import type { OtherPatientId } from "@cosyte/dicom";
const o: OtherPatientId = { id: "MRN-42", issuer: "HOSP_A", typeCode: "TEXT" };
```

#### Properties

##### id?

> `readonly` `optional` **id?**: `string`

##### issuer?

> `readonly` `optional` **issuer?**: `string`

##### typeCode?

> `readonly` `optional` **typeCode?**: `string`

***

### ParseOptions

Options accepted by `parseDicom`.

With `exactOptionalPropertyTypes: true`, callers omit unset keys
rather than passing `undefined` for any field below.

#### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const ds = parseDicom(buf, {
  strict: false,
  stripPreamble: "tolerate",
  copyValues: false,
  onWarning: (w) => console.warn(w.code),
});
```

#### Extended by

- [`ReadDicomHeaderOptions`](#readdicomheaderoptions)

#### Properties

##### copyValues?

> `readonly` `optional` **copyValues?**: `boolean`

When `true`, nothing parsed holds the source buffer, so it can be
released: the Dataset reads from one copy of it made by the parse, and
every `Element.rawBytes` is a standalone copy of its own value, made the
first time that Element is built. When `false` (the default),
`Element.rawBytes` is a zero-copy `Buffer.subarray` view, and the Dataset
and every Element pin the source ArrayBuffer until they are collected.

Omit to use the default.

##### fallbackCharacterSet?

> `readonly` `optional` **fallbackCharacterSet?**: `"ISO_IR 6"` \| `"ISO_IR 100"` \| `"ISO_IR 101"` \| `"ISO_IR 109"` \| `"ISO_IR 110"` \| `"ISO_IR 144"` \| `"ISO_IR 127"` \| `"ISO_IR 126"` \| `"ISO_IR 138"` \| `"ISO_IR 148"` \| `"ISO_IR 203"` \| `"ISO_IR 13"` \| `"ISO_IR 166"` \| `"ISO_IR 192"`

The Specific Character Set to read text under where a Data Set declares none: one term of
`FALLBACK_CHARACTER_SETS`, such as `"ISO_IR 100"` for Latin-1 names a sender wrote without
declaring them. PS3.5 section 6.1.2.1 makes the default repertoire ISO-IR 6 when
`(0008,0005)` is absent or empty, and that stays the default: without this option a byte
past `0x7F` there reads as U+FFFD with `DICOM_CHARSET_BYTES_UNDECODABLE`.

With it, a Data Set whose `(0008,0005)` is absent or empty, and a Sequence Item that inherits
one or declares an empty one of its own, reads `SH`, `LO`, `UC`, `ST`, `LT`, `UT` and `PN`
by the named set's table, and `Element.specificCharacterSet` names that set. A declared set,
`ISO_IR 6` included, is read as declared. A byte the named set does not define still reads
as U+FFFD with the warning. The parse adds one `DICOM_CHARSET_ASSUMED` warning, at the first
text element it reads under the assumption, naming that element's tag and no text; it is
never escalated by `strict` or a profile.

Nothing written changes: `Element.rawBytes` keeps the bytes as read, and `serializeDicom`
writes them back without adding a `(0008,0005)`. To declare the set in the output, add the
`(0008,0005)` element yourself.

A value that is not a term of `FALLBACK_CHARACTER_SETS` throws a `TypeError` whose `code` is
`"DICOM_INVALID_OPTION"` before anything is read; its message does not echo the value.

Omit (do not pass `undefined`) to read under the default repertoire.

###### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const ds = parseDicom(bytes, { fallbackCharacterSet: "ISO_IR 100" });
```

##### fallbackCharacterSetForUnknown?

> `readonly` `optional` **fallbackCharacterSetForUnknown?**: `boolean`

`true` to read under `fallbackCharacterSet` also where `(0008,0005)` names a term this build
does not decode (which raises `DICOM_UNSUPPORTED_CHARSET` either way). Off by default: an
unknown term is a declaration, and it is not replaced unless asked. Given without a
`fallbackCharacterSet`, or as anything but a boolean, it is refused as that option is.

##### onWarning?

> `readonly` `optional` **onWarning?**: [`OnWarningCallback`](#onwarningcallback)

Synchronous callback invoked once per Tier-2 warning, after the warning
has been pushed to `Dataset.warnings`. Throwing handlers are silently
swallowed, for parser-state safety.

Omit to skip the callback entirely.

##### profile?

> `readonly` `optional` **profile?**: [`Profile`](#profile-2)

Source/vendor tolerance preset. Applies the profile's
`escalations` / `suppressions` to warning emission and its
`privateDictionary` to Implicit-VR resolution of private data elements.
A profile only tightens or annotates: it never makes the default
lenient parse throw outside the four Tier-3 fatals, and a private
creator the profile does not recognize degrades to generic UN handling
plus a `DICOM_PRIVATE_CREATOR_UNKNOWN` warning, never a wrong decode.

Omit (do not pass `undefined`) for the unprofiled default behaviour.

##### stopBeforeTag?

> `readonly` `optional` **stopBeforeTag?**: `string`

Stop the parse before the first top-level Data Element whose tag is at or
after this one, given as eight hexadecimal digits (`"7FE00010"` is Pixel
Data). The Dataset then holds every top-level element before that point,
each exactly as a full parse reads it, and `ds.warnings` ends with one
`DICOM_PARSE_STOPPED_BEFORE_TAG` at the element the parse stopped before.
Nothing past it is read, so a file cut short after that point still
parses.

Only the top-level Data Set stops: an element inside a Sequence Item is
read whatever its tag, and the File Meta group is always read whole. The
comparison is "at or after" rather than "equal", so a file without the tag
still stops at the first element past where it would be; a file whose
top-level elements are out of ascending order (PS3.5 section 7.1 requires
the order) stops at the first one at or after the tag. When no top-level
element reaches it, the whole file is read and no warning is added.

A parse that stops does not check a DICOMDIR's Directory Record offsets
(`DICOM_DIRECTORY_*` warnings), since the records they name may be past
the stop and unread; `ds.directory` holds only the records it read. Parse
the whole file to check them.

The stop is never escalated, under `strict` or by a profile. A value
that is not eight hexadecimal digits throws a `TypeError` before anything
is read. To read only the header of a large file without loading the rest
of it into memory, see `readDicomHeader`.

Omit (do not pass `undefined`) to read the whole Data Set.

###### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const ds = parseDicom(bytes, { stopBeforeTag: "7FE00010" });
console.log(ds.has("00100010"), ds.has("7FE00010")); // true false
```

##### strict?

> `readonly` `optional` **strict?**: `boolean`

When `true`, every Tier-2 warning is escalated to a thrown
`DicomParseError` carrying the warning code. Default `false`.

🛑 **THE ESCALATED DIAGNOSTIC CARRIES SOURCE BYTES THAT THE WARNING DOES
NOT.** A `DicomParseWarning.message` is a frozen registry string with only
structural tokens filled in: `{tag}` renders only a tag PS3.6's element
registry carries a literal row for, `{vr}` only one of the 34 VRs PS3.5
section 6.2 defines, and a raw length or byte value a header carries is
bound out of the factory signature rather than rendered. That now holds on
the `deidentify()` codes too:
`DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE` and
`DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE` rendered `Element.rawBytes.length`
through `0.0.14`, which equals the declared Value Length and was reachable
from a fabricated header, and both slots are gone. So is
`DICOM_ITEM_CROSSES_SEQUENCE_END`'s remaining-bytes count, because **a raw
number shifted by a constant the reader can compute is that raw number**: it
was the enclosing sequence's declared Value Length less the bytes of that
sequence already consumed. **The exceptions are named in one place that is
not a record of a past change, and are deliberately not restated here**:
the `WARNING_MESSAGES` docblock in `./warnings.ts`, which this JSDoc used to
carry a copy of.
**This is a statement about `w.message` and about nothing else**: the two
byte counts still exist on `report.undefinedVrElements[].byteLength` and
`report.unauditableSequences[].byteLength`, model fields on a type whose own
docs say it is not a value-free surface. **No
safe-to-log verdict is stated here**: that sentence was corrected twice and
is deleted rather than tried a third time; the mechanism is above and the
treatment is in the package's troubleshooting docs. The `DicomParseError`
this option raises in its place is a different and larger surface: it also
carries `snippet`,
**16 raw bytes, unredacted**, read at the warning's own `byteOffset`.
A message-only PHI review of the lenient path therefore does not transfer to
the strict one. Log `err.code`, `err.byteOffset`, `err.offsetFrame` and
`err.message`; treat `err.snippet` as PHI.

**The snippet is cut in the SAME FRAME the `byteOffset` is counted in**, so
it is the bytes at the offset the diagnostic names: file-absolute at the
root, relative to the enclosing slice inside a defined-length Sequence or
Item, and into the inflated stream under Deflated Explicit VR LE. It was not
always: until the fatal-message registry the offset moved with the frame
while the cut was always taken from the whole file, so inside a
defined-length Item the 16 bytes were **an unrelated element's**: a
diagnostic disclosing data from a part of the document the reader was never
asked about. That is closed. **What is NOT closed, and never was a defect:
the bytes are still raw source bytes.** Reading them as safe because the
message beside them is registry-bound is the mistake this whole paragraph
exists to prevent.

**`byteOffset` NOW CARRIES A FRAME-OF-REFERENCE CONTRACT, AND IT IS A NAME
AND NOT AN ORIGIN.** `err.offsetFrame` says which of three coordinate
systems the number is counted in (`OFFSET_FRAMES`), so a consumer can tell a
root offset from an Item-relative one instead of guessing. **A nested offset
is still not a key you can look up against the root**, and it is not made
into one here: where a slice begins is deliberately unpublished, because the
distance between two frames is a declared Value Length off the wire. The
escalated warning's own `position` is unchanged and still carries no frame
beyond `deflated`; see `DicomPosition`.

Omit (do not pass `undefined`) to use the default.

##### stripPreamble?

> `readonly` `optional` **stripPreamble?**: `"tolerate"` \| `"require"`

Preamble policy:
  - `"tolerate"` (default): attempt to start at offset 0 if `DICM` magic
    is missing at offset 128; emit `DICOM_MISSING_PREAMBLE`.
  - `"require"`: throw `DicomParseError(NOT_DICOM_PART_10)` when no
    `DICM` magic is present.

Omit to use the default.

***

### PatientIssue

One thing the patient view could not read as written among the non-human patient attributes.
`message` comes by `code` from a frozen registry with only `tag` substituted, so it carries no
value from the file and is safe to log.

#### Example

```ts
import { parseDicom } from "@cosyte/dicom";
for (const issue of parseDicom(buf).patient.issues ?? []) {
  console.warn(issue.code, issue.tag); // "DICOM_PATIENT_VALUE_NOT_ENUMERATED" "00102203"
}
```

#### Properties

##### code

> `readonly` **code**: [`PatientIssueCode`](#patientissuecode-1)

##### message

> `readonly` **message**: `string`

##### tag

> `readonly` **tag**: `string`

The attribute's tag, eight uppercase hex digits.

***

### PatientView

Patient & study identity (the wrong-patient failure class).

`id` is **not globally unique**; correct cross-system matching needs the
`{id, issuerOfId, issuerQualifiers}` tuple plus `otherIds`. `name` keeps
its full `PN` component structure, never flattened to a string.

#### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const p = parseDicom(buf).patient;
p.id;                       // "MRN-42" - meaningless without the issuer
p.issuerOfId;              // "HOSP_A"
p.name?.alphabetic.familyName; // "Doe"
```

#### Properties

##### birthDate?

> `readonly` `optional` **birthDate?**: [`DicomDate`](#dicomdate)

##### breedCode?

> `readonly` `optional` **breedCode?**: [`CodedConcept`](#codedconcept)

The one item of Patient Breed Code Sequence `(0010,2293)`, read by `readCode`.

##### breedDescription?

> `readonly` `optional` **breedDescription?**: `string`

Patient Breed Description `(0010,2292)`, as written.

##### id?

> `readonly` `optional` **id?**: `string`

##### issuerOfId?

> `readonly` `optional` **issuerOfId?**: `string`

##### issuerQualifiers?

> `readonly` `optional` **issuerQualifiers?**: readonly [`Item`](#item)[]

##### issues?

> `readonly` `optional` **issues?**: readonly [`PatientIssue`](#patientissue)[]

What the view could not read as written among the non-human attributes above, each with a
stable code. Present only when there is at least one; frozen.

##### name?

> `readonly` `optional` **name?**: [`PersonName`](#personname)

##### otherIds

> `readonly` **otherIds**: readonly [`OtherPatientId`](#otherpatientid)[]

##### responsiblePerson?

> `readonly` `optional` **responsiblePerson?**: [`ResponsiblePerson`](#responsibleperson-1)

Responsible Person `(0010,2297)`, Responsible Person Role `(0010,2298)` and Responsible
Organization `(0010,2299)`, present when any of the three is.

##### sex?

> `readonly` `optional` **sex?**: `string`

##### sexNeutered?

> `readonly` `optional` **sexNeutered?**: `string`

Patient's Sex Neutered `(0010,2203)`, as written. The standard's values are `ALTERED` and
`UNALTERED`; another value is kept and reported on [PatientView.issues](#issues).

##### speciesCode?

> `readonly` `optional` **speciesCode?**: [`CodedConcept`](#codedconcept)

The one item of Patient Species Code Sequence `(0010,2202)`, read by `readCode`.

##### speciesDescription?

> `readonly` `optional` **speciesDescription?**: `string`

Patient Species Description `(0010,2201)`, as written.

***

### PersonName

A decoded `PN` value - up to three component groups separated on-wire by
`=` (PS3.5 §6.2.1.1). `alphabetic` is always present; `ideographic` and
`phonetic` are present only when the value supplied them.

#### Example

```ts
import type { PersonName } from "@cosyte/dicom";
// "Yamada^Tarou=山田^太郎=やまだ^たろう"
declare const pn: PersonName;
pn.alphabetic.familyName; // "Yamada"
pn.ideographic?.familyName; // "山田"
```

#### Properties

##### alphabetic

> `readonly` **alphabetic**: [`PersonNameGroup`](#personnamegroup)

##### ideographic?

> `readonly` `optional` **ideographic?**: [`PersonNameGroup`](#personnamegroup)

##### phonetic?

> `readonly` `optional` **phonetic?**: [`PersonNameGroup`](#personnamegroup)

***

### PersonNameGroup

One of the three component groups of a `PN` value (PS3.5 §6.2.1.1):
alphabetic, ideographic, or phonetic. Each holds the five `^`-delimited
components; missing components are the empty string (never `undefined`).

#### Example

```ts
import type { PersonNameGroup } from "@cosyte/dicom";
const g: PersonNameGroup = {
  familyName: "Doe",
  givenName: "Jane",
  middleName: "",
  namePrefix: "",
  nameSuffix: "",
};
```

#### Properties

##### familyName

> `readonly` **familyName**: `string`

##### givenName

> `readonly` **givenName**: `string`

##### middleName

> `readonly` **middleName**: `string`

##### namePrefix

> `readonly` **namePrefix**: `string`

##### nameSuffix

> `readonly` **nameSuffix**: `string`

***

### PixelDataFragments

The Basic Offset Table and the fragments of one encapsulated Pixel Data
element, each as the raw bytes of its Item Value.

Every `Buffer` here is a view over the element's own `Element.rawBytes`, with
no Item header and no Sequence Delimitation Item in it, so it follows that
element's retention: a zero-copy view over your input by default, and a copy
that outlives it under `parseDicom(bytes, { copyValues: true })`.

#### Example

```ts
import { parseDicom, readPixelDataFragments } from "@cosyte/dicom";
const pixels = readPixelDataFragments(parseDicom(buf));
if (pixels !== undefined) {
  pixels.basicOffsetTable?.length; // 0 when the table is empty
  pixels.fragments.length; // how many fragment Items the file carries
}
```

#### Properties

##### basicOffsetTable

> `readonly` **basicOffsetTable**: `Buffer`\<`ArrayBufferLike`\> \| `undefined`

The Basic Offset Table's Item Value, uninterpreted. **Zero bytes when the
table is empty**, which PS3.5 2026c section A.4 permits and decoders must
accept. `undefined` only when the Item stream holds no Item at all, which
A.4 does not permit; nothing is invented in its place.

##### fragments

> `readonly` **fragments**: readonly `Buffer`\<`ArrayBufferLike`\>[]

The Item Value of every Item after the Basic Offset Table, in file order.
Each is returned whole: its content is never read, so bytes inside a
fragment that happen to look like a delimiter are fragment bytes (A.4: a
decoder "may not scan for a Sequence Delimitation Item").

***

### PrivateTagDefinition

One private-data attribute definition supplied by a [Profile](#profile-2)'s
private-dictionary overlay. The `vr` resolves the Implicit-VR of a private
data element whose on-wire encoding carries no VR; `keyword` / `name` carry
the vendor-documented identity for tooling and docs.

#### Example

```ts
import type { PrivateTagDefinition } from "@cosyte/dicom";
const def: PrivateTagDefinition = {
  vr: "OB",
  keyword: "CSAImageHeaderInfo",
  name: "CSA Image Header Info",
};
```

#### Properties

##### keyword

> `readonly` **keyword**: `string`

##### name

> `readonly` **name**: `string`

##### vr

> `readonly` **vr**: [`VR`](namespaces/Dictionary.md#vr-1)

***

### Profile

A source/vendor tolerance preset. A `Profile` bundles three
things that only ever **tighten or annotate** a parse: never loosen it
past the Postel's-Law default:

 - `escalations`: Tier-2 warning codes promoted to a thrown
   `DicomParseError` (a stricter posture for known-unsafe deviations).
 - `suppressions`: Tier-2 warning codes silenced because they are a
   documented, benign quirk of the named source (annotation, not loss).
 - `privateDictionary`: a private-creator-keyed overlay resolving the
   Implicit-VR of vendor private data elements via the file's **live**
   private-creator string (never a hard-coded block number).

Build one with `defineProfile()`; never hand-author the frozen shape.
Profiles are immutable and composable via `extends`.

#### Example

```ts
import { parseDicom, profiles } from "@cosyte/dicom";
const ds = parseDicom(buf, { profile: profiles.siemens });
console.log(ds.fileMeta?.transferSyntaxUID);
```

#### Properties

##### describe?

> `readonly` `optional` **describe?**: () => `string`

Render a human-readable, deterministic one-line summary of the profile.

###### Returns

`string`

##### description?

> `readonly` `optional` **description?**: `string`

##### escalations

> `readonly` **escalations**: `ReadonlySet`\<[`WarningCode`](#warningcode)\>

##### lineage

> `readonly` **lineage**: readonly `string`[]

##### name

> `readonly` **name**: `string`

##### privateDictionary

> `readonly` **privateDictionary**: `ReadonlyMap`\<`string`, `ReadonlyMap`\<`string`, [`PrivateTagDefinition`](#privatetagdefinition)\>\>

Creator string → canonical private-tag key (`"GGGGxxEE"`, e.g.
`"0029xx10"`) → definition. The `xx` placeholder stands for the
file-assigned private block byte, mirroring the published DICOM
private-dictionary notation; resolution is therefore by creator string,
never by a fixed block number.

##### suppressions

> `readonly` **suppressions**: `ReadonlySet`\<[`WarningCode`](#warningcode)\>

***

### ReadDicomHeaderOptions

The options of [readDicomHeader](#readdicomheader): every [ParseOptions](#parseoptions) field, and a limit on how much
of the source is read.

#### Example

```ts
import { readDicomHeader, type ReadDicomHeaderOptions } from "@cosyte/dicom";
const options: ReadDicomHeaderOptions = { maxBytes: 16 * 1024 * 1024 };
const ds = await readDicomHeader("study.dcm", options);
```

#### Extends

- [`ParseOptions`](#parseoptions)

#### Properties

##### copyValues?

> `readonly` `optional` **copyValues?**: `boolean`

When `true`, nothing parsed holds the source buffer, so it can be
released: the Dataset reads from one copy of it made by the parse, and
every `Element.rawBytes` is a standalone copy of its own value, made the
first time that Element is built. When `false` (the default),
`Element.rawBytes` is a zero-copy `Buffer.subarray` view, and the Dataset
and every Element pin the source ArrayBuffer until they are collected.

Omit to use the default.

###### Inherited from

[`ParseOptions`](#parseoptions).[`copyValues`](#copyvalues)

##### fallbackCharacterSet?

> `readonly` `optional` **fallbackCharacterSet?**: `"ISO_IR 6"` \| `"ISO_IR 100"` \| `"ISO_IR 101"` \| `"ISO_IR 109"` \| `"ISO_IR 110"` \| `"ISO_IR 144"` \| `"ISO_IR 127"` \| `"ISO_IR 126"` \| `"ISO_IR 138"` \| `"ISO_IR 148"` \| `"ISO_IR 203"` \| `"ISO_IR 13"` \| `"ISO_IR 166"` \| `"ISO_IR 192"`

The Specific Character Set to read text under where a Data Set declares none: one term of
`FALLBACK_CHARACTER_SETS`, such as `"ISO_IR 100"` for Latin-1 names a sender wrote without
declaring them. PS3.5 section 6.1.2.1 makes the default repertoire ISO-IR 6 when
`(0008,0005)` is absent or empty, and that stays the default: without this option a byte
past `0x7F` there reads as U+FFFD with `DICOM_CHARSET_BYTES_UNDECODABLE`.

With it, a Data Set whose `(0008,0005)` is absent or empty, and a Sequence Item that inherits
one or declares an empty one of its own, reads `SH`, `LO`, `UC`, `ST`, `LT`, `UT` and `PN`
by the named set's table, and `Element.specificCharacterSet` names that set. A declared set,
`ISO_IR 6` included, is read as declared. A byte the named set does not define still reads
as U+FFFD with the warning. The parse adds one `DICOM_CHARSET_ASSUMED` warning, at the first
text element it reads under the assumption, naming that element's tag and no text; it is
never escalated by `strict` or a profile.

Nothing written changes: `Element.rawBytes` keeps the bytes as read, and `serializeDicom`
writes them back without adding a `(0008,0005)`. To declare the set in the output, add the
`(0008,0005)` element yourself.

A value that is not a term of `FALLBACK_CHARACTER_SETS` throws a `TypeError` whose `code` is
`"DICOM_INVALID_OPTION"` before anything is read; its message does not echo the value.

Omit (do not pass `undefined`) to read under the default repertoire.

###### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const ds = parseDicom(bytes, { fallbackCharacterSet: "ISO_IR 100" });
```

###### Inherited from

[`ParseOptions`](#parseoptions).[`fallbackCharacterSet`](#fallbackcharacterset)

##### fallbackCharacterSetForUnknown?

> `readonly` `optional` **fallbackCharacterSetForUnknown?**: `boolean`

`true` to read under `fallbackCharacterSet` also where `(0008,0005)` names a term this build
does not decode (which raises `DICOM_UNSUPPORTED_CHARSET` either way). Off by default: an
unknown term is a declaration, and it is not replaced unless asked. Given without a
`fallbackCharacterSet`, or as anything but a boolean, it is refused as that option is.

###### Inherited from

[`ParseOptions`](#parseoptions).[`fallbackCharacterSetForUnknown`](#fallbackcharactersetforunknown)

##### maxBytes?

> `readonly` `optional` **maxBytes?**: `number`

The most bytes of the source read into memory, a positive whole number. When the stop is not
found within them and the source goes on past them, the read ends and `readDicomHeader` throws
a `RangeError`; a source no longer than the limit is read as without one. One byte past the
limit is read from a file, to learn whether it goes on; a stream's chunk that crosses the limit
is cut there, though the stream itself made the whole chunk.

There is no default: without it a file whose read cannot stop (no element at or after the stop
tag, or Deflated) is read whole, as `parseDicom` would need it. Set it when the source is not
trusted, so a file with no stop tag cannot grow memory without bound.

Omit (do not pass `undefined`) for no limit.

##### onWarning?

> `readonly` `optional` **onWarning?**: [`OnWarningCallback`](#onwarningcallback)

Synchronous callback invoked once per Tier-2 warning, after the warning
has been pushed to `Dataset.warnings`. Throwing handlers are silently
swallowed, for parser-state safety.

Omit to skip the callback entirely.

###### Inherited from

[`ParseOptions`](#parseoptions).[`onWarning`](#onwarning)

##### profile?

> `readonly` `optional` **profile?**: [`Profile`](#profile-2)

Source/vendor tolerance preset. Applies the profile's
`escalations` / `suppressions` to warning emission and its
`privateDictionary` to Implicit-VR resolution of private data elements.
A profile only tightens or annotates: it never makes the default
lenient parse throw outside the four Tier-3 fatals, and a private
creator the profile does not recognize degrades to generic UN handling
plus a `DICOM_PRIVATE_CREATOR_UNKNOWN` warning, never a wrong decode.

Omit (do not pass `undefined`) for the unprofiled default behaviour.

###### Inherited from

[`ParseOptions`](#parseoptions).[`profile`](#profile-1)

##### stopBeforeTag?

> `readonly` `optional` **stopBeforeTag?**: `string`

Stop the parse before the first top-level Data Element whose tag is at or
after this one, given as eight hexadecimal digits (`"7FE00010"` is Pixel
Data). The Dataset then holds every top-level element before that point,
each exactly as a full parse reads it, and `ds.warnings` ends with one
`DICOM_PARSE_STOPPED_BEFORE_TAG` at the element the parse stopped before.
Nothing past it is read, so a file cut short after that point still
parses.

Only the top-level Data Set stops: an element inside a Sequence Item is
read whatever its tag, and the File Meta group is always read whole. The
comparison is "at or after" rather than "equal", so a file without the tag
still stops at the first element past where it would be; a file whose
top-level elements are out of ascending order (PS3.5 section 7.1 requires
the order) stops at the first one at or after the tag. When no top-level
element reaches it, the whole file is read and no warning is added.

A parse that stops does not check a DICOMDIR's Directory Record offsets
(`DICOM_DIRECTORY_*` warnings), since the records they name may be past
the stop and unread; `ds.directory` holds only the records it read. Parse
the whole file to check them.

The stop is never escalated, under `strict` or by a profile. A value
that is not eight hexadecimal digits throws a `TypeError` before anything
is read. To read only the header of a large file without loading the rest
of it into memory, see `readDicomHeader`.

Omit (do not pass `undefined`) to read the whole Data Set.

###### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const ds = parseDicom(bytes, { stopBeforeTag: "7FE00010" });
console.log(ds.has("00100010"), ds.has("7FE00010")); // true false
```

###### Inherited from

[`ParseOptions`](#parseoptions).[`stopBeforeTag`](#stopbeforetag)

##### strict?

> `readonly` `optional` **strict?**: `boolean`

When `true`, every Tier-2 warning is escalated to a thrown
`DicomParseError` carrying the warning code. Default `false`.

🛑 **THE ESCALATED DIAGNOSTIC CARRIES SOURCE BYTES THAT THE WARNING DOES
NOT.** A `DicomParseWarning.message` is a frozen registry string with only
structural tokens filled in: `{tag}` renders only a tag PS3.6's element
registry carries a literal row for, `{vr}` only one of the 34 VRs PS3.5
section 6.2 defines, and a raw length or byte value a header carries is
bound out of the factory signature rather than rendered. That now holds on
the `deidentify()` codes too:
`DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE` and
`DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE` rendered `Element.rawBytes.length`
through `0.0.14`, which equals the declared Value Length and was reachable
from a fabricated header, and both slots are gone. So is
`DICOM_ITEM_CROSSES_SEQUENCE_END`'s remaining-bytes count, because **a raw
number shifted by a constant the reader can compute is that raw number**: it
was the enclosing sequence's declared Value Length less the bytes of that
sequence already consumed. **The exceptions are named in one place that is
not a record of a past change, and are deliberately not restated here**:
the `WARNING_MESSAGES` docblock in `./warnings.ts`, which this JSDoc used to
carry a copy of.
**This is a statement about `w.message` and about nothing else**: the two
byte counts still exist on `report.undefinedVrElements[].byteLength` and
`report.unauditableSequences[].byteLength`, model fields on a type whose own
docs say it is not a value-free surface. **No
safe-to-log verdict is stated here**: that sentence was corrected twice and
is deleted rather than tried a third time; the mechanism is above and the
treatment is in the package's troubleshooting docs. The `DicomParseError`
this option raises in its place is a different and larger surface: it also
carries `snippet`,
**16 raw bytes, unredacted**, read at the warning's own `byteOffset`.
A message-only PHI review of the lenient path therefore does not transfer to
the strict one. Log `err.code`, `err.byteOffset`, `err.offsetFrame` and
`err.message`; treat `err.snippet` as PHI.

**The snippet is cut in the SAME FRAME the `byteOffset` is counted in**, so
it is the bytes at the offset the diagnostic names: file-absolute at the
root, relative to the enclosing slice inside a defined-length Sequence or
Item, and into the inflated stream under Deflated Explicit VR LE. It was not
always: until the fatal-message registry the offset moved with the frame
while the cut was always taken from the whole file, so inside a
defined-length Item the 16 bytes were **an unrelated element's**: a
diagnostic disclosing data from a part of the document the reader was never
asked about. That is closed. **What is NOT closed, and never was a defect:
the bytes are still raw source bytes.** Reading them as safe because the
message beside them is registry-bound is the mistake this whole paragraph
exists to prevent.

**`byteOffset` NOW CARRIES A FRAME-OF-REFERENCE CONTRACT, AND IT IS A NAME
AND NOT AN ORIGIN.** `err.offsetFrame` says which of three coordinate
systems the number is counted in (`OFFSET_FRAMES`), so a consumer can tell a
root offset from an Item-relative one instead of guessing. **A nested offset
is still not a key you can look up against the root**, and it is not made
into one here: where a slice begins is deliberately unpublished, because the
distance between two frames is a declared Value Length off the wire. The
escalated warning's own `position` is unchanged and still carries no frame
beyond `deflated`; see `DicomPosition`.

Omit (do not pass `undefined`) to use the default.

###### Inherited from

[`ParseOptions`](#parseoptions).[`strict`](#strict)

##### stripPreamble?

> `readonly` `optional` **stripPreamble?**: `"tolerate"` \| `"require"`

Preamble policy:
  - `"tolerate"` (default): attempt to start at offset 0 if `DICM` magic
    is missing at offset 128; emit `DICOM_MISSING_PREAMBLE`.
  - `"require"`: throw `DicomParseError(NOT_DICOM_PART_10)` when no
    `DICM` magic is present.

Omit to use the default.

###### Inherited from

[`ParseOptions`](#parseoptions).[`stripPreamble`](#strippreamble)

***

### RealWorldValueMap

A Real World Value Mapping - slope/intercept bound atomically to
its UCUM measurement-units code, so a number is never detached from its
units. From Real World Value Mapping Sequence `(0040,9096)`.

#### Example

```ts
import type { RealWorldValueMap } from "@cosyte/dicom";
const m: RealWorldValueMap = { slope: 1, intercept: 0, unitsCode: { codeValue: "[hnsf'U]" } };
```

#### Properties

##### intercept?

> `readonly` `optional` **intercept?**: `number`

##### slope?

> `readonly` `optional` **slope?**: `number`

##### unitsCode?

> `readonly` `optional` **unitsCode?**: [`CodedConcept`](#codedconcept)

***

### ResponsiblePerson

The person or organization responsible for a patient, usually an animal's owner: Responsible
Person `(0010,2297)`, Responsible Person Role `(0010,2298)` and Responsible Organization
`(0010,2299)`. Each part is typed-absent when the object does not carry it. These are
identifying values, so log none of them.

#### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const owner = parseDicom(buf).patient.responsiblePerson;
owner?.name?.alphabetic.familyName; // "SYNTHETIC"
owner?.role;                         // "OWNER"
owner?.organization;                 // "SAMPLE CLINIC"
```

#### Properties

##### name?

> `readonly` `optional` **name?**: [`PersonName`](#personname)

##### organization?

> `readonly` `optional` **organization?**: `string`

##### role?

> `readonly` `optional` **role?**: `string`

***

### SeriesView

Series-level identity & co-registration. Images sharing a
`frameOfReferenceUid` are spatially co-registered.

#### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const s = parseDicom(buf).series;
s.modality;            // "CT"
s.frameOfReferenceUid; // shared ⇒ co-registered
```

#### Properties

##### description?

> `readonly` `optional` **description?**: `string`

##### frameOfReferenceUid?

> `readonly` `optional` **frameOfReferenceUid?**: `string`

##### instanceUid?

> `readonly` `optional` **instanceUid?**: `string`

##### modality?

> `readonly` `optional` **modality?**: `string`

##### number?

> `readonly` `optional` **number?**: `number`

***

### StudyView

Study-level identity. `instanceUid` is the cross-system study key;
`accessionNumber` ties the study to the order.

#### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const s = parseDicom(buf).study;
s.instanceUid;     // "1.2.840.113619..."
s.accessionNumber; // "ACC123"
```

#### Properties

##### accessionNumber?

> `readonly` `optional` **accessionNumber?**: `string`

##### date?

> `readonly` `optional` **date?**: [`DicomDate`](#dicomdate)

##### description?

> `readonly` `optional` **description?**: `string`

##### id?

> `readonly` `optional` **id?**: `string`

##### instanceUid?

> `readonly` `optional` **instanceUid?**: `string`

##### time?

> `readonly` `optional` **time?**: [`DicomTime`](#dicomtime)

***

### ToDateOptions

The one option [toDate](#todate) takes, and the only key it carries.

`assumeOffsetMinutes` is the caller's declaration of the zone a value that
carries none was written in. An explicit `0` means "read this naive value as
UTC", which is a decision this library will not make on a caller's behalf.

#### Example

```ts
import { parseDate, toDate } from "@cosyte/dicom";
import type { ToDateOptions } from "@cosyte/dicom";

const options: ToDateOptions = { assumeOffsetMinutes: -300 };
toDate(parseDate("20240115").value, options)?.toISOString(); // "2024-01-15T05:00:00.000Z"
```

#### Properties

##### assumeOffsetMinutes?

> `readonly` `optional` **assumeOffsetMinutes?**: `number`

Minutes east of UTC to read a value that states no offset in.

***

### ToDicomJsonOptions

Options for `toDicomJson`.

#### Example

```ts
import { parseDicom, toDicomJson, type ToDicomJsonOptions } from "@cosyte/dicom";
const options: ToDicomJsonOptions = {
  bulkDataUri: (el) => (el.tag === "7FE00010" ? "https://example.com/frames/1" : undefined),
};
toDicomJson(parseDicom(buf), options);
```

#### Properties

##### bulkDataUri?

> `readonly` `optional` **bulkDataUri?**: (`element`) => `string` \| `undefined`

Asked for each element of a binary VR (`OB`, `OD`, `OF`, `OL`, `OV`, `OW`, `UN`) that has a
value, and for encapsulated Pixel Data, which has no inline form and is refused with
`UNSUPPORTED_ELEMENT` without a URI. Return a URI to write the attribute as a `BulkDataURI`, or `undefined` to write its
bytes inline as base64 in `InlineBinary`. A bulk value (Pixel Data `(7FE0,0010)`, Float and
Double Float Pixel Data `(7FE0,0008)` and `(7FE0,0009)`, Overlay Data `(60xx,3000)`,
Waveform Data `(5400,1010)`, Spectroscopy Data `(5600,0020)` and Encapsulated Document
`(0042,0011)`) is written inline only when `inlineBulkData` is `true`; with no URI and no
opt-in it is refused with `BULK_DATA_URI_REQUIRED`.

###### Parameters

###### element

[`Element`](#element)

###### Returns

`string` \| `undefined`

##### fallbackCharacterSet?

> `readonly` `optional` **fallbackCharacterSet?**: `"ISO_IR 6"` \| `"ISO_IR 100"` \| `"ISO_IR 101"` \| `"ISO_IR 109"` \| `"ISO_IR 110"` \| `"ISO_IR 144"` \| `"ISO_IR 127"` \| `"ISO_IR 126"` \| `"ISO_IR 138"` \| `"ISO_IR 148"` \| `"ISO_IR 203"` \| `"ISO_IR 13"` \| `"ISO_IR 166"` \| `"ISO_IR 192"`

The Specific Character Set to read text under where its Data Set declares none (no
`(0008,0005)`, or an empty one): one term of `FALLBACK_CHARACTER_SETS`, such as
`"ISO_IR 100"`. Without it that text is the default repertoire ISO-IR 6, and a byte past
`0x7F` is refused with `MALFORMED_VALUE`. A Data Set `parseDicom` read with its own
`fallbackCharacterSet` already carries the set on each element, and needs no option here. No
`(0008,0005)` is added to the result. A value outside the list is refused with
`INVALID_OPTION`.

##### fallbackCharacterSetForUnknown?

> `readonly` `optional` **fallbackCharacterSetForUnknown?**: `boolean`

`true` to read under `fallbackCharacterSet` also where `(0008,0005)` names a term this build
does not decode, which is otherwise refused with `UNSUPPORTED_CHARACTER_SET`; the
`(0008,0005)` value is then written as it is. Given without a `fallbackCharacterSet`, or as
anything but a boolean, it is refused with `INVALID_OPTION`.

##### inlineBulkData?

> `readonly` `optional` **inlineBulkData?**: `boolean`

`true` to write a bulk value the `bulkDataUri` option gave no URI for inline, as base64 in
`InlineBinary`. Off by default: the model is for metadata, and Pixel Data inline is rarely
what a caller means.

***

### UidRemapper

A UID remapper: a stable `map(src)` plus the backing cache it fills.

#### Example

```ts
import { makeUidRemapper, type UidRemapper } from "@cosyte/dicom";
const remap: UidRemapper = makeUidRemapper();
const replaced = remap.map("1.2.840.10008.5.1.4.1.1.2");
remap.cache.get("1.2.840.10008.5.1.4.1.1.2") === replaced; // true
```

#### Properties

##### cache

> `readonly` **cache**: `Map`\<`string`, `string`\>

The source→replacement cache, exposed for reporting / reuse.

##### map

> `readonly` **map**: (`sourceUid`) => `string`

Map one source UID to its deterministic replacement (cached).

###### Parameters

###### sourceUid

`string`

###### Returns

`string`

***

### UnauditableSequenceFinding

One carrier this run could not reach the Data Sets inside, and **emptied** for
it. [UnauditableSequenceFinding.applied](#applied-2) names that outcome and is the
field to read first; it is the only outcome this finding has.

**Two producers, and neither ships bytes.** The ordinary one is an
`SQ` element whose `items` the parser never materialized. The second is a
private data element retained under `RetainSafePrivate` whose `Profile` entry
declares it `SQ` while the parse tree says otherwise - `UN` under Implicit VR
LE when the profile was passed to `deidentify()` but not to `parseDicom`, or
whatever binary VR the sender wrote under Explicit VR, which wins in the
parser. The profile is the authority that retained the element, and it has
said the value is a Sequence of Items; with no items on the tree, the §E.1.1
obligation below falls on the carrier just the same. Such an element keeps its
parsed VR in the output and is emptied rather than re-typed to `SQ`.

**🛑 THERE WAS A THIRD PRODUCER AND IT IS RETIRED: `applied: "kept"` IS GONE
FROM THIS TYPE AND FROM EVERY RUN.** Through `0.0.19` a private data element
the profile vouched for whose value this run never enumerated was **retained
verbatim** and named here with `applied: "kept"` - the package reporting that
it had shipped a value it did not read. Such an instance is now **removed**
instead, and its record moved to
[DeidentifyReport.unenumerablePrivateRemovals](#unenumerableprivateremovals), which is a different
surface with a different guarantee: uncapped, complete, and stating a reason.
This array never carries a retained private value again, so an entry here
always means content is **not** in your output. That is an audit-contract
change for anyone who switched on `applied`; see
[UnenumerablePrivateRemoval](#unenumerableprivateremoval).

PS3.5 2026c §7.5.1 "Item Encoding Rules" states that "Each Item Value shall
contain a DICOM Data Set composed of Data Elements", so an `SQ` element's
value is never opaque bytes - it is Data Elements this run is obliged to
reach. PS3.15 2026c §E.1.1 "De-identifier" states that obligation directly:
an implementation claiming the Basic Application Level Confidentiality
Profile "shall protect or retain all instances of the Attributes listed in
[Table E.1-1], whether contained in the top level Data Set or embedded in an
Item of a Sequence of Items". When the item stream cannot be enumerated the
obligation cannot be discharged element by element, so it falls on the
enclosing attribute - the escalation §E.1.1 itself uses for a SOP Instance
UID inside a Sequence, where "the enclosing Attribute in the top-level Data
Set must be encrypted in its entirety". (That sentence is written about the
encrypt-and-replace mechanism for SOP Instance UIDs, not about Table E.1-1
generally; it is cited here as the standard's own precedent for escalating to
the carrier, not as a rule about this case.)

Both fields are structural: `tag` is the carrier's and `byteLength` is the
recorded span of the value that was dropped. **No _decoded_ value appears
here, and that is not the same as "safe to log".** On the second producer
`tag` can be four bytes of another element's value: a length under-declared
upstream resynchronizes the reader mid-value, and if the bytes it lands on
spell a private block this caller's profile declares `SQ`, followed by a VR
that is one of the 34, the fabricated header is what you get here. The
package's answer to that class is normally `report.undefinedVrElements`,
which names a byte offset and **no tag**, and it still answers the case where
the fabricated VR is outside the 34 - but it cannot answer this one, because
a fabricated `OB` header and a genuine one are byte-identical. So this shares
the standing exception `report.removedPrivateTags` and `uidMap` already have:
a `DeidentifyReport` is **not** a value-free surface. Treat it as document
content, at the sensitivity of the file it came from.

For the first producer the parser announces the underlying refusal on
`Dataset.warnings`: `DICOM_SQ_NOT_DESCENDED` for a defined-length Implicit VR
LE value whose dictionary-resolved `SQ` was not a valid item stream. **Do not
generalise that to the second.** There the file may be entirely conformant -
an honest defined-length `OB` carrier raises nothing at all - so this report
field, not `Dataset.warnings`, is where that drop is visible.

#### Example

```ts
import { deidentify, parseDicom } from "@cosyte/dicom";
const { report } = deidentify(parseDicom(buf));
for (const s of report.unauditableSequences) {
  // The tag and the length can be bytes of the file (above): log the outcome, not them.
  console.warn(`sequence ${s.applied}, item stream unreadable`);
}
```

#### Properties

##### applied

> `readonly` **applied**: `"emptied"`

What happened to that carrier's value: `"emptied"`, always. The value is not
in the de-identified output.

**🛑 `"kept"` WAS A MEMBER OF THIS UNION AND IS NOT ANY MORE.** It meant "the
value IS in the output, byte for byte, unexamined", and a report field that
can say so is exactly what this package no longer does: that instance is
removed now and recorded on
[DeidentifyReport.unenumerablePrivateRemovals](#unenumerableprivateremovals). The field itself is
kept, so `applied === "emptied"` keeps compiling and keeps meaning what it
always meant; a comparison against `"kept"` does not compile any more, which
is the intended way to find out.

##### byteLength

> `readonly` **byteLength**: `number`

Byte length of the carrier's value field that was **dropped**. Structural,
never a decoded value.

##### contextPath?

> `readonly` `optional` **contextPath?**: readonly `string`[]

Tag/index chain when the carrier is inside a sequence item; omitted at the
root. **Built by the same descent as
[DeidentifiedAttribute.contextPath](#contextpath-1) and carrying the same caveat:
each segment's tag is read off the wire, bound by nothing, so on a
desynchronized read it can be four bytes of a value.** Read that field's
note before logging this one.

##### tag

> `readonly` **tag**: `string`

The carrier element.

***

### UndefinedVrFinding

One element that was emptied because its **on-wire VR is not one of the 34
PS3.5 section 6.2 defines**, so nothing this library did to its bytes counts
as decoding a Value Field.

**Why such an element exists at all**

Under an Explicit VR Transfer Syntax the VR is two bytes the sender wrote, and
this parser trusts them (Postel's Law on the read path). The routine way two
arbitrary bytes end up in a VR field is an **under**-declared Value Length
upstream: the reader finishes the short value, and the leftover bytes of the
value that was actually encoded are read as the next Data Element header. Tag,
VR and length are then all fragments of somebody's value, and the element that
genuinely followed is consumed as this fabricated element's "value".

Measured on `scripts/measure-sq-bound-grid.ts`: a carrier under-declaring by 6
produces `(4156,554C)` with the VR bytes `"E "`, whose value holds the source
`(0010,0020)` Patient ID in full. It reaches **string** carriers exactly as it
reaches binary ones, because the carrier's own VR is not what decides it.

**Why emptying, and why it is not a guess**

PS3.5 2026c section 6.2 requires every VR not yet defined to use the long-form
Data Element Structure - "with reserved bytes after the VR and a 32-bit
unsigned integer VL" - so an unrecognized VR read short-form, which is what
this parser does, is by the standard's own structure rule not a reading of a
Value Field. There is nothing to prove about the content: the test is a
membership check against the closed 34-VR set on a field the parser already
recorded, so there is no scan, no per-offset loop, and no cost that follows an
attacker-chosen value length.

PS3.15 2026c section E.1.1 obliges an implementation claiming the Basic
Application Level Confidentiality Profile to "protect or retain all instances
of the Attributes listed in [Table E.1-1]". Those instances cannot be reached
inside bytes that were never a value, so the obligation falls on the carrier.

**`UN` is not this.** `UN` is one of the 34, so an ordinary unknown-VR element
- the Implicit VR fallback for a tag this build's dictionary does not publish,
and the CP-246 shape - never reaches here. That is the line the sibling
`SQ`-with-no-items rule could not draw.

**Why this finding names no tag, when every sibling finding does**

Because the tag **may be content**, and nothing here can tell. The paragraph
above is the whole argument: when an under-declare desynchronized the reader,
the four tag bytes and the two VR bytes were read out of the middle of some
element's Value Field, so reporting the "tag" would republish four bytes of
the document. An unrecognized VR written honestly, at a correct length, raises
this same code and has an ordinary tag - **and the two are indistinguishable
here**, so the tag is withheld on both routes rather than on a guess. Measured on a synthetic `ST` carrier holding
`"MR BRAIN SMITHSON"`, the fabricated tag is `48544F53` - four bytes of the
surname. [EmbeddedAttributeFinding](#embeddedattributefinding) and
[UnauditableSequenceFinding](#unauditablesequencefinding) may carry a tag because theirs came from a
header the sender really wrote; this one may not, and the asymmetry is the
finding rather than an inconsistency.

`byteOffset` locates the element instead - a position this parser counted.

**🩺 THAT WITHHOLDING IS NOT WHOLE, AND THIS PARAGRAPH USED TO CLAIM IT WAS.**
It said "nothing here renders a document byte ... and the structural
`contextPath`. Safe to log." `contextPath` is not structural: its segments are
tags read off the wire by the same descent, so the header this type refuses to
name by `tag` can be named by the `contextPath` of a finding one level down.
See [DeidentifiedAttribute.contextPath](#contextpath-1) for the measurement. `byteOffset`
and `byteLength` are unaffected and the reasoning above them still stands.

#### Example

```ts
import { deidentify, parseDicom } from "@cosyte/dicom";
const { report } = deidentify(parseDicom(buf));
for (const u of report.undefinedVrElements) {
  // The length can be bytes of the file (above): log the offset, which the parser counted.
  console.warn(`offset ${String(u.byteOffset)}: an element with an undefined VR was emptied`);
}
```

#### Properties

##### byteLength

> `readonly` **byteLength**: `number`

Byte length of the value field that was dropped.

**An input-derived count, and on this finding specifically that is not a
formality.** For the sibling findings the length came from a header the
sender wrote; here the four length bytes can themselves be value bytes, like
the tag bytes. What is published is the *number* they decode to, and one
`readUInt32LE` puts the bytes back: a fabricated header reading `"SO\0\0"`
publishes `20307`, two letters of a surname. Do not describe this field as
"structural, never a value" the way its siblings are described.

**🩺 IT IS NO LONGER "the same footing as every `{n}` in the warning
registry", AND THAT SENTENCE WAS THE ONE THIS FIELD SHIPPED WITH.**
`DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE` rendered exactly this number and
does not any more - it is bound out of `undefinedVrNotAuditable`'s
signature. So this field is now a **model field**, on the same standing
exception as `removedPrivateTags`, `unauditableSequences[].tag`, `uidMap`
and `contextPath`: narrowing it is a product call, because a bound empties
it on every well-formed file, where it is exactly the audit number the field
exists to carry. Deliberately unchanged; see this type's own summary.

##### byteOffset

> `readonly` **byteOffset**: `number`

Byte offset of the emptied element's header. **This is how the element is
identified, and there is deliberately no `tag` field** - see the note above:
a fabricated header's tag bytes are part of some element's value.

##### contextPath?

> `readonly` `optional` **contextPath?**: readonly `string`[]

Tag/index chain when the carrier is inside a sequence item; omitted at the
root. **Built by the same descent as
[DeidentifiedAttribute.contextPath](#contextpath-1) and carrying the same caveat:
each segment's tag is read off the wire, bound by nothing, so on a
desynchronized read it can be four bytes of a value.** Read that field's
note before logging this one.

***

### UnenumerablePrivateRemoval

One private attribute **removed** because this run did not enumerate its
value - the record that discharges the audit half of the fail-safe, and the
one report surface that is complete at any input size.

**What "enumerated" means here, and what it deliberately does not**

A run has enumerated a private value when it **walked it as DICOM Data
Elements** and put each of them through the Annex E action table (a private
`SQ` the parser materialized items for), when the whole value **was matched
as a member of a closed table the caller supplied** (a Private Creator
`(gggg,00EE)` whose decoded value is in the profile's private dictionary), or
when the value is **zero-length** and so encodes no Data Set. Nothing else.

**🛑 DECODING A VALUE UNDER THE VR THE PROFILE RESOLVED FOR IT IS NOT
ENUMERATION, AND NEITHER IS THE EMBEDDED-ATTRIBUTE SCANNER'S SILENCE.** A
decoded `LO`, `ST`, `OB`, `OW` or `UN` value is a byte run that can carry a
Data Set written in a transfer syntax this run never tested for; two cells of
the matrix in `test/integration/deident-private-reservation.test.ts` are
perfectly scannable Implicit VR LE string carriers whose values the scanner
DID read and found nothing in, and which carried a nested `(0010,0010)`
anyway, because the nested tiles are Explicit VR and the file is Implicit. So
the predicate is **what the run did with the value**, never the VR and never
the scanner's reach.

**The cost, stated at its real size**

With `RetainSafePrivate` plus a `Profile`, three classes of private value
reach the output on something this run enumerated: an instance the run walked
as Data Elements, a Private Creator the profile's dictionary vouches for, and
a zero-length value. **An ordinary vendor scalar under an ordinary string VR
that the file's own declaration does not name safe is removed**, because
this package enumerates nothing inside a retained private value that is not
one of those three. That is over-redaction traded for a closed identity leak:
PS3.15 2026c §E.3.10 retains Private Attributes "known by the de-identifier to
be safe from identity leakage" and sends "all other Private Attributes" to
removal or to the `(0008,0307)` element-specific action, which this library
does not implement - and a value nothing enumerated is not known to be safe
however ordinary it looks. Through `0.0.19` such a value was **kept** and
disclosed instead; the disclosure said outright that it was not a fix.

**🩺 The fourth class, which this record never names**

A private value reaches the output on one more route, and it is the one that
rests on no enumeration at all: the **file's own** Private Data Element
Characteristics Sequence (0008,0300), which §E.3.10 names first among the ways
an Attribute is known safe and which needs no `Profile`. A value in a block
whose Block Identifying Information Status (0008,0303) reads `SAFE`, or listed
in a `MIXED` block's Nonidentifying Private Elements (0008,0304), is retained
unexamined on the **sender's** written assertion, so it is never removed and
never appears here. That is the opposite trade from the one above, made in the
open: the caller who does not trust the sender leaves `RetainSafePrivate` off,
which is the one mitigation §E.3.10 offers.

**Per INSTANCE, never per tag**

An entry names one **occurrence**: a tag together with the Data Set it lived
in, which `contextPath` identifies (absent means the root Data Set). Private
blocks are reserved per Data Set (PS3.5 §7.8.1), so the same private tag can
occur several times in one object with different enumerability, and removing
one occurrence never removes a sibling one.

**Uncapped, and that is a decision rather than an oversight**

Every consumer-controlled **diagnostic** in this package is capped, because a
finding emitted per element is amplified by an element count the input
chooses. This is not a diagnostic: it is the record of an **action**, on the
same footing as [DeidentifyReport.removedPrivateTags](#removedprivatetags), which is uncapped
for the same reason. A caller's whole guarantee is that they can separate the
unenumerable removals from the Annex E ones for **every** removal, so a cap
here would silently take the guarantee away exactly on the files that need it
most. The matching warnings stay bounded; this array does not.

**What it carries, and what that is worth logging**

`tag` is composed from four bytes of the source. On a well-formed file it is
the sender's own private tag number and carries nothing, but on a file whose
Value Lengths disagree with its bytes those four bytes can be document
content - the standing exception [DeidentifyReport.removedPrivateTags](#removedprivatetags)
and [UnauditableSequenceFinding](#unauditablesequencefinding) already carry, by the same route, and
`contextPath` is unbound in the same way. It is published anyway, because
*which* attribute was removed and *where* is the whole audit value of the
record. Treat this array as PHI when the source is untrusted.

#### Example

```ts
import { deidentify, parseDicom, type UnenumerablePrivateRemoval } from "@cosyte/dicom";
const { report } = deidentify(parseDicom(buf), { retain: ["RetainSafePrivate"], profile });
report.unenumerablePrivateRemovals.forEach((r: UnenumerablePrivateRemoval) => {
  // The tag and the path can be bytes of the file (above), so log the outcome and the depth.
  console.warn(`${r.applied} (${r.reason})`, "depth", r.contextPath?.length ?? 0);
});
```

#### Properties

##### applied

> `readonly` **applied**: `"removed"`

The outcome, always `"removed"`: the Data Set that held this instance
carries no element bearing that tag, in the returned dataset and in the
serialized bytes. Distinct from **emptied**, where an element with that tag
is present carrying a zero-length value.

##### contextPath?

> `readonly` `optional` **contextPath?**: readonly `string`[]

Tag/index chain naming the Data Set this instance lived in; **omitted at the
root**, which is what identifies the removal as per-instance rather than
per-tag. **Built by the same descent as
[DeidentifiedAttribute.contextPath](#contextpath-1) and carrying the same caveat:
each segment's tag is read off the wire, bound by nothing, so on a
desynchronized read it can be four bytes of a value.** Read that field's
note before logging this one.

##### reason

> `readonly` **reason**: `"unenumerable"`

Why, always `"unenumerable"`: this run did not enumerate the value, so
PS3.15 §E.3.10's "known ... to be safe" was never established for it. This
is what separates an entry here from an attribute the Annex E action table
removed (`report.attributes`, `applied: "removed"`) and from one whose value
was emptied.

##### tag

> `readonly` **tag**: `string`

The removed instance's tag.

***

### UnregisteredElementRemoval

One non-private Data Element **removed** because this build's PS3.6 2026d
registry does not carry its tag and PS3.15 2026d Table E.1-1 does not list it.

**The rule**

A Table E.1-1 miss used to mean "keep": an attribute the table does not list
went into de-identified output verbatim with a report that said nothing about
it. That is right for an attribute PS3.6 registers, which the Profile has
judged, and wrong for one it does not: the notes to PS3.15 2026d Table E.1-1
name "new Standard Attributes" among the places identifying information may
be, and say removing only the known risks "may fail when the Standard is
extended, or when a vendor adds unanticipated Standard Attributes". So an
even-group tag with **no registry row and no Table E.1-1 row** is removed, at
every depth `deidentify()` walks, whatever its VR (`UN`, an on-wire VR outside
the 34 PS3.5 section 6.2 defines, and `SQ` included; a Sequence goes whole and
nothing inside it is walked or recorded).

"Registered" means a literal PS3.6 row, or a masked row the tag matches, with
the `50xx` / `60xx` groups bounded by PS3.5 2026c section 7.6 (even groups
`5000`-`501E` and `6000`-`601E`). Private tags, group `0004`, group `0002`,
group lengths `(gggg,0000)` and every tag Table E.1-1 lists are not decided by
this rule.

**What it costs**

**A conformant attribute from a PS3.6 edition newer than this build's pin is
removed too**, because nothing separates it from an invented one. That is
over-redaction and it is deliberate; a caller who needs such an attribute back
has no switch for it in this release.

**What it carries, and what it deliberately does not**

**No tag and no VR.** The trigger is "no registry row carries this tag", and
four bytes an under-declared length upstream made the reader take as a header
satisfy it by construction: the fixture in
`test/integration/deident-undefined-vr.test.ts` fabricates `(4854,4F53)`,
`"THSO"` in wire order, four letters of a surname. Publishing the tag would
republish them, so the element is identified by `byteOffset`, a position this
parser counted, exactly as [UndefinedVrFinding](#undefinedvrfinding) does.

`contextPath` names the Sequences this run **descended** to reach the
element, never the removed element itself, and carries the caveat every
finding's `contextPath` carries: see [DeidentifiedAttribute.contextPath](#contextpath-1).

**Capped record, complete count**

Bounded per run at `MAX_UNREGISTERED_ELEMENT_FINDINGS`, on its own counter so
a flood of one diagnostic class cannot spend another's budget. The removal
itself is not bounded, and
[DeidentifyReport.unregisteredElementRemovalCount](#unregisteredelementremovalcount) is complete at any
input size.

#### Example

```ts
import { deidentify, parseDicom, type UnregisteredElementRemoval } from "@cosyte/dicom";
const { report } = deidentify(parseDicom(buf));
report.unregisteredElementRemovals.forEach((r: UnregisteredElementRemoval) => {
  // The path is read from the file, so log the offset and the depth, never the path.
  console.warn(`removed at offset ${String(r.byteOffset)}`, "depth", r.contextPath?.length ?? 0);
});
```

#### Properties

##### byteOffset

> `readonly` **byteOffset**: `number`

Byte offset of the removed element's header, as the parser recorded it on
`Element.byteOffset`. **This is how the element is identified, and there is
deliberately no `tag` field**: see the note above.

##### contextPath?

> `readonly` `optional` **contextPath?**: readonly `string`[]

Tag/index chain when the element was inside a sequence item; omitted at the
root. **Built by the same descent as
[DeidentifiedAttribute.contextPath](#contextpath-1) and carrying the same caveat:
each segment's tag is read off the wire.** Read that field's note before
logging this one.

## Type Aliases

### AppliedAction

> **AppliedAction** = `"removed"` \| `"emptied"` \| `"dummied"` \| `"uid-remapped"` \| `"cleaned"` \| `"kept"`

What `deidentify` actually did to one attribute - the concrete outcome of the
resolved Annex E action.

- `removed` - the element was deleted (`X`).
- `emptied` - replaced with a zero-length value (`Z`).
- `dummied` - replaced with a non-identifying dummy of compatible VR (`D`).
- `uid-remapped` - UID(s) replaced with internally-consistent UIDs (`U`).
- `cleaned` - conservatively blanked because a safe similar-meaning value
  cannot be synthesised at the metadata layer (`C`; see known limitations):
  a zero-length value, or, for a Sequence, the Sequence kept with no Items,
  at every depth. That covers the coded lists Clean Descriptors cleans, the
  Content, Acquisition Context, Specimen Preparation and Waveform Annotation
  Sequences Clean Structured Content cleans, and the Graphic Annotation
  Sequence Clean Graphics cleans, so no Text Value, Code Value, Code Meaning
  or nested Content Item inside any of them is kept.
- `kept` - retained, either by an active Retain option or because the SQ was
  kept and its items cleaned recursively.

#### Example

```ts
import { deidentify, parseDicom, type AppliedAction } from "@cosyte/dicom";
const { report } = deidentify(parseDicom(buf));
const removed = report.attributes.filter((a) => a.applied === ("removed" satisfies AppliedAction));
```

***

### DeidentifyErrorCode

> **DeidentifyErrorCode** = *typeof* [`DEIDENTIFY_ERROR_CODES`](#deidentify_error_codes)\[keyof *typeof* [`DEIDENTIFY_ERROR_CODES`](#deidentify_error_codes)\]

One of the [DEIDENTIFY\_ERROR\_CODES](#deidentify_error_codes) values.

#### Example

```ts
import { DeidentifyError, type DeidentifyErrorCode } from "@cosyte/dicom";
const code: DeidentifyErrorCode = "INVALID_OPTIONS";
throw new DeidentifyError("unknown retain option", code);
```

***

### DeidentifyOption

> **DeidentifyOption** = `Exclude`\<`AnnexEOption`, `"CleanPixelData"` \| `"CleanRecognizableVisual"`\>

The PS3.15 Annex E option sets `deidentify` honours - the
*metadata-affecting* columns of Table E.1-1. The two pixel-level options
(`CleanPixelData` §E.3.1, `CleanRecognizableVisual` §E.3.2) are deliberately
excluded: this is a metadata-only de-identifier and cannot inspect pixels
(deferred to `@cosyte/dicom-pixel`). When pixel data is present it always
warns rather than claiming the image is clean.

**§E.3.6 is two Options, and each has its own name here.** Table E.1-1 gives
them separate columns: `Rtn. Long. Full Dates` (keep dates and times as they
are) and `Rtn. Long. Modif. Dates` (keep them only as modified values).

- `RetainLongitudinalTemporal` carries the **full-dates** column, the *less*
  protective branch: where the two columns differ, it says `K` (keep the real
  value). Activate it only when real dates are genuinely required.
- `RetainLongitudinalTemporalModifiedDates` carries the **modified-dates**
  column, which says `C` (clean it) on every row where the two differ, and
  makes the run write `(0028,0303) = MODIFIED`.

The two are **mutually exclusive**: §E.3.6 defines them as alternatives, and a
call naming both is rejected with [DeidentifyError](#deidentifyerror). Leave both off and
the Basic Profile action applies, which removes or empties dates.

🩺 **Date *modification* is the caller's, on both branches.** This library
applies the column and writes the declaration; it shifts, aggregates and
transforms nothing, so a `MODIFIED` it writes is true only if you performed
the transformation §E.3.6 describes. `report.warnings` carries
`DICOM_DEIDENT_DATES_NOT_TRANSFORMED` on every run that activates the
modified-dates Option, saying exactly that.

#### Example

```ts
const retain: DeidentifyOption[] = ["RetainLongitudinalTemporal", "RetainSafePrivate"];
```

***

### DicomByteSource

> **DicomByteSource** = `string` \| `URL` \| [`DicomFileHandle`](#dicomfilehandle) \| `AsyncIterable`\<`Uint8Array`\>

Where `readDicomHeader` reads from: a file path (a string or a `file:` URL), a
[DicomFileHandle](#dicomfilehandle), or any async iterable of byte chunks (a Node `Readable` such as
`fs.createReadStream`, or a web `ReadableStream<Uint8Array>`).

#### Example

```ts
import { createReadStream } from "node:fs";
import type { DicomByteSource } from "@cosyte/dicom";
const fromPath: DicomByteSource = "study.dcm";
const fromStream: DicomByteSource = createReadStream("study.dcm");
```

***

### DicomJsonErrorCode

> **DicomJsonErrorCode** = *typeof* [`DICOM_JSON_ERROR_CODES`](#dicom_json_error_codes)\[keyof *typeof* [`DICOM_JSON_ERROR_CODES`](#dicom_json_error_codes)\]

Discriminant for [DicomJsonError.code](#code-1).

#### Example

```ts
import type { DicomJsonErrorCode } from "@cosyte/dicom";
const code: DicomJsonErrorCode = "BULK_DATA_UNRESOLVED";
```

***

### DicomJsonValue

> **DicomJsonValue** = `string` \| `number` \| [`DicomJsonPersonName`](#dicomjsonpersonname) \| [`DicomJsonDataset`](#dicomjsondataset) \| `null`

One value in an attribute's `Value` array: a string, a number, a Person Name object, a nested
Data Set (a Sequence item), or `null` for an empty value among several.

#### Example

```ts
import type { DicomJsonValue } from "@cosyte/dicom";
const values: DicomJsonValue[] = ["ORIGINAL", "PRIMARY", null];
```

***

### DicomValue

> **DicomValue** = \{ `kind`: `"empty"`; \} \| \{ `kind`: `"text"`; `value`: `string`; `warnings?`: readonly [`DicomParseWarning`](#dicomparsewarning)[]; \} \| \{ `kind`: `"strings"`; `values`: readonly `string`[]; `warnings?`: readonly [`DicomParseWarning`](#dicomparsewarning)[]; \} \| \{ `kind`: `"personName"`; `values`: readonly [`PersonName`](#personname)[]; `warnings?`: readonly [`DicomParseWarning`](#dicomparsewarning)[]; \} \| \{ `kind`: `"numbers"`; `values`: readonly `number`[]; \} \| \{ `kind`: `"bigints"`; `values`: readonly `bigint`[]; \} \| \{ `kind`: `"attributeTags"`; `values`: readonly [`Tag`](namespaces/Dictionary.md#tag-1)[]; \} \| \{ `kind`: `"decimalString"`; `values`: readonly (`number` \| `null`)[]; `warnings?`: readonly [`DicomParseWarning`](#dicomparsewarning)[]; \} \| \{ `kind`: `"integerString"`; `values`: readonly (`number` \| `null`)[]; `warnings?`: readonly [`DicomParseWarning`](#dicomparsewarning)[]; \} \| \{ `kind`: `"dates"`; `values`: readonly [`DicomDate`](#dicomdate)[]; `warnings?`: readonly [`DicomParseWarning`](#dicomparsewarning)[]; \} \| \{ `kind`: `"times"`; `values`: readonly [`DicomTime`](#dicomtime)[]; `warnings?`: readonly [`DicomParseWarning`](#dicomparsewarning)[]; \} \| \{ `kind`: `"dateTimes"`; `values`: readonly [`DicomDateTime`](#dicomdatetime)[]; `warnings?`: readonly [`DicomParseWarning`](#dicomparsewarning)[]; \} \| \{ `bytes`: `Buffer`; `kind`: `"binary"`; \} \| \{ `items`: readonly [`Item`](#item)[]; `kind`: `"sequence"`; \}

The lazily-decoded value of an [Element](#element), as a discriminated union
on `kind`. See the module doc for the VR → kind mapping. Narrow on `kind`
(the `switch-exhaustiveness-check` lint rule keeps consumers honest).

#### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const ds = parseDicom(buf);
const v = ds.get("00100010")?.value; // Patient's Name (PN)
if (v?.kind === "personName") {
  console.log(v.values[0]?.alphabetic.familyName);
}
```

***

### FallbackCharacterSet

> **FallbackCharacterSet** = *typeof* [`FALLBACK_CHARACTER_SETS`](#fallback_character_sets)\[`number`\]

A term of [FALLBACK\_CHARACTER\_SETS](#fallback_character_sets).

#### Example

```ts
import type { FallbackCharacterSet } from "@cosyte/dicom";
const term: FallbackCharacterSet = "ISO_IR 100";
```

***

### FatalCode

> **FatalCode** = *typeof* [`FATAL_CODES`](#fatal_codes)\[keyof *typeof* [`FATAL_CODES`](#fatal_codes)\]

The Tier-3 fatal codes, the type over the `FATAL_CODES` registry.

**Treat the union as open.** A release can add a code, which widens this
union, so a `switch` that lists every current member stops compiling, or
misses the new code, on an upgrade. Handle the codes you care about by name
and give the `switch` a `default` branch for the rest.

**It is not the whole type of `DicomParseError.code`.** A Tier-2 warning
escalated by `{ strict: true }` or by a profile's `escalate` list is
thrown as a `DicomParseError` whose `code` is that warning's
[WarningCode](#warningcode), so `DicomParseError.code` is
`FatalCode | WarningCode`. A `switch` over a caught error's `code` needs a
`default` branch for the escalated warnings; see [DicomParseError](#dicomparseerror).

#### Example

```ts
import type { FatalCode } from "@cosyte/dicom";
function describe(code: FatalCode): string {
  switch (code) {
    case "EMPTY_INPUT":
      return "input was empty";
    case "NOT_DICOM_PART_10":
      return "input is not a DICOM Part 10 file";
    default:
      return `cannot read: ${code}`;
  }
}
```

***

### OffsetFrame

> **OffsetFrame** = *typeof* [`OFFSET_FRAMES`](#offset_frames)\[keyof *typeof* [`OFFSET_FRAMES`](#offset_frames)\]

The frame a `DicomParseError.byteOffset` is counted in. See
[OFFSET\_FRAMES](#offset_frames).

#### Example

```ts
import type { OffsetFrame } from "@cosyte/dicom";
function indexable(frame: OffsetFrame): boolean {
  // Only the root frame's offsets index the buffer the caller passed in.
  switch (frame) {
    case "input":
      return true;
    case "inflated-dataset":
    case "value-slice":
      return false;
  }
}
```

***

### OnWarningCallback

> **OnWarningCallback** = (`warning`) => `void`

Synchronous callback invoked once per Tier-2 warning emitted during parse.

The callback fires AFTER the warning has been
pushed to `ctx.warnings`; if the callback throws, the parser silently
swallows the exception and continues (mirrors `@cosyte/hl7` sibling).

#### Parameters

##### warning

[`DicomParseWarning`](#dicomparsewarning)

#### Returns

`void`

#### Example

```ts
import type { OnWarningCallback } from "@cosyte/dicom";
const onWarning: OnWarningCallback = (w) => {
  if (w.code === "DICOM_MISSING_PREAMBLE") {
    // ...
  }
};
```

***

### PatientIssueCode

> **PatientIssueCode** = *typeof* [`PATIENT_ISSUE_CODES`](#patient_issue_codes)\[keyof *typeof* [`PATIENT_ISSUE_CODES`](#patient_issue_codes)\]

Discriminant for [PatientIssue.code](#code-6).

**Treat the union as open.** A release can add a code, which widens this
union, so a `switch` that lists every current member stops compiling, or
misses the new code, on an upgrade. Handle the codes you care about by name
and give the `switch` a `default` branch for the rest.

#### Example

```ts
import type { PatientIssueCode } from "@cosyte/dicom";
const code: PatientIssueCode = "DICOM_PATIENT_CODE_SEQUENCE_EMPTY";
```

***

### ProfilePrivateTags

> **ProfilePrivateTags** = `Readonly`\<`Record`\<`string`, [`PrivateTagDefinition`](#privatetagdefinition)\>\>

One vendor's private-dictionary overlay as authored: canonical
`"GGGGXXLL"` key → definition. Case-insensitive on input; normalized to
uppercase on store.

#### Example

```ts
import type { ProfilePrivateTags } from "@cosyte/dicom";
const csa: ProfilePrivateTags = {
  "0029XX10": { vr: "OB", keyword: "CSAImageHeaderInfo", name: "CSA Image Header Info" },
};
```

***

### SerializeErrorCode

> **SerializeErrorCode** = *typeof* [`SERIALIZE_ERROR_CODES`](#serialize_error_codes)\[keyof *typeof* [`SERIALIZE_ERROR_CODES`](#serialize_error_codes)\]

Discriminant for [DicomSerializeError.code](#code-3).

**Treat the union as open.** A release can add a code, which widens this
union, so a `switch` that lists every current member stops compiling, or
misses the new code, on an upgrade. Handle the codes you care about by name
and give the `switch` a `default` branch for the rest.

#### Example

```ts
import type { SerializeErrorCode } from "@cosyte/dicom";
function describe(code: SerializeErrorCode): string {
  switch (code) {
    case "MISSING_TRANSFER_SYNTAX":
      return "dataset has no Transfer Syntax UID to serialize under";
    case "UNSUPPORTED_TRANSFER_SYNTAX":
      return "Transfer Syntax UID is neither native nor a section A.4 one";
    case "INVALID_ENCAPSULATED_PIXEL_DATA":
      return "top-level Pixel Data is not a section A.4 fragment stream";
    default:
      return `cannot serialize: ${code}`;
  }
}
```

***

### ValueErrorCode

> **ValueErrorCode** = *typeof* [`VALUE_ERROR_CODES`](#value_error_codes)\[keyof *typeof* [`VALUE_ERROR_CODES`](#value_error_codes)\]

Discriminant for [DicomValueError.code](#code-4).

**Treat the union as open.** A release can add a code, which widens this
union, so a `switch` that lists every current member stops compiling, or
misses the new code, on an upgrade. Handle the codes you care about by name
and give the `switch` a `default` branch for the rest.

#### Example

```ts
import type { ValueErrorCode } from "@cosyte/dicom";
function describe(code: ValueErrorCode): string {
  switch (code) {
    case "FRAME_INDEX_OUT_OF_RANGE":
      return "frame index outside [0, numberOfFrames)";
    default:
      return `value error: ${code}`;
  }
}
```

***

### WarningCode

> **WarningCode** = *typeof* [`WARNING_CODES`](#warning_codes)\[keyof *typeof* [`WARNING_CODES`](#warning_codes)\]

Discriminant type for `DicomParseWarning.code`, and for
`DicomParseError.code` when a warning is escalated. Narrowing by this
code guarantees a typo-free comparison against the `WARNING_CODES`
registry.

**Treat the union as open.** The registry gains codes between releases,
and each addition widens this union, so a `switch` that lists every
current member stops compiling, or silently misses the new code, on an
upgrade. Handle the codes you care about by name and give the `switch` a
`default` branch for the rest.

#### Example

```ts
import type { DicomParseWarning, WarningCode } from "@cosyte/dicom";
function describe(w: DicomParseWarning): string {
  const code: WarningCode = w.code;
  switch (code) {
    case "DICOM_MISSING_PREAMBLE":
      return "preamble missing";
    default:
      return `warning: ${code}`;
  }
}
```

## Variables

### CODING\_SCHEME\_OIDS

> `const` **CODING\_SCHEME\_OIDS**: `object`

Canonical coding-scheme OIDs (PS3.16 §8). **Only** the four standard
designators are mapped. Legacy SNOMED designators (`SRT` / `SNM3` /
`99SDM`) are intentionally absent: their code values differ from `SCT`
(CP-730), so resolving them to the SNOMED OID would imply a false
equality.

#### Type Declaration

##### DCM

> `readonly` **DCM**: `"1.2.840.10008.2.16.4"` = `"1.2.840.10008.2.16.4"`

##### LN

> `readonly` **LN**: `"2.16.840.1.113883.6.1"` = `"2.16.840.1.113883.6.1"`

##### SCT

> `readonly` **SCT**: `"2.16.840.1.113883.6.96"` = `"2.16.840.1.113883.6.96"`

##### UCUM

> `readonly` **UCUM**: `"2.16.840.1.113883.6.8"` = `"2.16.840.1.113883.6.8"`

#### Example

```ts
import { CODING_SCHEME_OIDS } from "@cosyte/dicom";
CODING_SCHEME_OIDS.SCT; // "2.16.840.1.113883.6.96"
```

***

### DEFAULT\_UID\_ROOT

> `const` **DEFAULT\_UID\_ROOT**: `"2.25"` = `"2.25"`

DICOM `2.25` UUID-derived root (PS3.5 §B.2) - no registration required.

#### Example

```ts
import { makeUidRemapper, DEFAULT_UID_ROOT } from "@cosyte/dicom";
const remap = makeUidRemapper(DEFAULT_UID_ROOT);
remap.map("1.2.840.113619.2.55.3").startsWith("2.25."); // true
```

***

### DEIDENTIFICATION\_METHOD\_CODES

> `const` **DEIDENTIFICATION\_METHOD\_CODES**: `object`

PS3.16 2026d CID 7050 "De-identification Method" (context group version
`20170914`, UID `1.2.840.10008.6.1.925`), with the code `deidentify()` records
for the Profile and for each [DeidentifyOption](#deidentifyoption).

- `rows` - all thirteen rows, in the context group's own order.
- `profile` - `113100` Basic Application Confidentiality Profile, written by
  every run.
- `options` - the code written when that Option was active for the run. An
  Option "ran" when it was active: the Annex E column it selects is resolved
  off the option set, whether or not the object carried an attribute it acts
  on. `113107` therefore says the modified-dates column was resolved, **not**
  that any date was shifted; this library transforms no date, and every such
  run carries `DICOM_DEIDENT_DATES_NOT_TRANSFORMED` on `report.warnings`.

`113101` and `113102` are in `rows` and are never written: they name the two
pixel-level Options, which this metadata-only layer does not perform.

#### Type Declaration

##### contextGroupUid

> `readonly` **contextGroupUid**: `"1.2.840.10008.6.1.925"`

##### contextGroupVersion

> `readonly` **contextGroupVersion**: `"20170914"`

##### options

> `readonly` **options**: `Readonly`\<`Record`\<[`DeidentifyOption`](#deidentifyoption), [`DeidentificationMethodCode`](#deidentificationmethodcode)\>\>

##### profile

> `readonly` **profile**: [`DeidentificationMethodCode`](#deidentificationmethodcode)

##### rows

> `readonly` **rows**: readonly [`DeidentificationMethodCode`](#deidentificationmethodcode)[]

#### Example

```ts
import { DEIDENTIFICATION_METHOD_CODES } from "@cosyte/dicom";
DEIDENTIFICATION_METHOD_CODES.contextGroupUid; // "1.2.840.10008.6.1.925"
DEIDENTIFICATION_METHOD_CODES.options.RetainUIDs.codeValue; // "113110"
DEIDENTIFICATION_METHOD_CODES.rows.length; // 13
```

***

### DEIDENTIFY\_ERROR\_CODES

> `const` **DEIDENTIFY\_ERROR\_CODES**: `Readonly`\<\{ `INVALID_OPTIONS`: `"INVALID_OPTIONS"`; `UNSUPPORTED_TRANSFER_SYNTAX`: `"UNSUPPORTED_TRANSFER_SYNTAX"`; \}\>

Stable codes for [DeidentifyError](#deidentifyerror).

- `INVALID_OPTIONS`: an author-time misconfiguration of the call itself (an
  unknown Retain option, both PS3.15 §E.3.6 temporal Options at once, a
  malformed `uidRoot`).
- `UNSUPPORTED_TRANSFER_SYNTAX`: the Dataset's File Meta Transfer Syntax UID
  is one this de-identifier refuses to act on, whatever the options. Today
  that is exactly the four JPIP Referenced syntaxes of PS3.5 2026c sections
  A.6, A.7, A.11 and A.12: such an object references its pixels through
  Pixel Data Provider URL `(0028,7FE0)`, which has no PS3.15 Table E.1-1 row,
  so a de-identified copy would keep the URL by omission. Nothing is
  de-identified and no dataset or report is returned.

#### Example

```ts
import { DEIDENTIFY_ERROR_CODES } from "@cosyte/dicom";
DEIDENTIFY_ERROR_CODES.INVALID_OPTIONS; // "INVALID_OPTIONS"
DEIDENTIFY_ERROR_CODES.UNSUPPORTED_TRANSFER_SYNTAX; // "UNSUPPORTED_TRANSFER_SYNTAX"
```

***

### DEIDENTIFY\_OPTIONS

> `const` **DEIDENTIFY\_OPTIONS**: readonly [`DeidentifyOption`](#deidentifyoption)[]

The metadata option-set names, frozen for runtime validation.

#### Example

```ts
import { DEIDENTIFY_OPTIONS } from "@cosyte/dicom";
DEIDENTIFY_OPTIONS.includes("RetainUIDs"); // true
```

***

### DICOM\_JSON\_ERROR\_CODES

> `const` **DICOM\_JSON\_ERROR\_CODES**: `Readonly`\<\{ `BULK_DATA_UNRESOLVED`: `"BULK_DATA_UNRESOLVED"`; `BULK_DATA_URI_REQUIRED`: `"BULK_DATA_URI_REQUIRED"`; `CONVERSION_FAILED`: `"CONVERSION_FAILED"`; `INVALID_JSON`: `"INVALID_JSON"`; `INVALID_OPTION`: `"INVALID_OPTION"`; `MALFORMED_VALUE`: `"MALFORMED_VALUE"`; `NESTING_TOO_DEEP`: `"NESTING_TOO_DEEP"`; `UNREPRESENTABLE_NUMBER`: `"UNREPRESENTABLE_NUMBER"`; `UNSUPPORTED_BYTE_ORDER`: `"UNSUPPORTED_BYTE_ORDER"`; `UNSUPPORTED_CHARACTER_SET`: `"UNSUPPORTED_CHARACTER_SET"`; `UNSUPPORTED_ELEMENT`: `"UNSUPPORTED_ELEMENT"`; `UNSUPPORTED_TRANSFER_SYNTAX`: `"UNSUPPORTED_TRANSFER_SYNTAX"`; `UNSUPPORTED_VR`: `"UNSUPPORTED_VR"`; `VALUE_TOO_LONG`: `"VALUE_TOO_LONG"`; `VR_MISMATCH`: `"VR_MISMATCH"`; \}\>

Stable string codes `toDicomJson` and `fromDicomJson` may throw. Narrow on
[DicomJsonError.code](#code-1) to react to a specific refusal.

#### Example

```ts
import { DICOM_JSON_ERROR_CODES } from "@cosyte/dicom";
DICOM_JSON_ERROR_CODES.UNSUPPORTED_VR; // "UNSUPPORTED_VR"
```

***

### FALLBACK\_CHARACTER\_SETS

> `const` **FALLBACK\_CHARACTER\_SETS**: readonly \[`"ISO_IR 6"`, `"ISO_IR 100"`, `"ISO_IR 101"`, `"ISO_IR 109"`, `"ISO_IR 110"`, `"ISO_IR 144"`, `"ISO_IR 127"`, `"ISO_IR 126"`, `"ISO_IR 138"`, `"ISO_IR 148"`, `"ISO_IR 203"`, `"ISO_IR 13"`, `"ISO_IR 166"`, `"ISO_IR 192"`\]

The Specific Character Set defined terms a caller may name as `fallbackCharacterSet`, the set
`parseDicom`, `readDicomHeader` and `toDicomJson` read text under where a Data Set declares
none: one value of the default repertoire (`ISO_IR 6`), a single-byte `ISO_IR` set, or
`ISO_IR 192`. These are the single-valued terms both the reader and `toDicomJson` decode; the
code-extension spellings (`ISO 2022 IR nnn`) need more than one value, and `GB18030` and `GBK`
are not carried by `toDicomJson`, so neither is a fallback.

#### Example

```ts
import { FALLBACK_CHARACTER_SETS } from "@cosyte/dicom";
FALLBACK_CHARACTER_SETS.includes("ISO_IR 100"); // true
```

***

### FATAL\_CODES

> `const` **FATAL\_CODES**: `object`

Stable string codes for every Tier-3 fatal the parser may throw.

A fatal is kept for structural corruption the parser cannot recover from:
anything less severe is a Tier-2 warning (see `./warnings.ts`). Callers
narrow on `err.code` to react to a specific structural failure.

#### Type Declaration

##### EMPTY\_INPUT

> `readonly` **EMPTY\_INPUT**: `"EMPTY_INPUT"` = `"EMPTY_INPUT"`

##### INVALID\_FILE\_META

> `readonly` **INVALID\_FILE\_META**: `"INVALID_FILE_META"` = `"INVALID_FILE_META"`

##### NOT\_DICOM\_PART\_10

> `readonly` **NOT\_DICOM\_PART\_10**: `"NOT_DICOM_PART_10"` = `"NOT_DICOM_PART_10"`

##### UNSUPPORTED\_TRANSFER\_SYNTAX

> `readonly` **UNSUPPORTED\_TRANSFER\_SYNTAX**: `"UNSUPPORTED_TRANSFER_SYNTAX"` = `"UNSUPPORTED_TRANSFER_SYNTAX"`

#### Example

```ts
import { parseDicom, FATAL_CODES, DicomParseError } from "@cosyte/dicom";
try {
  parseDicom(Buffer.alloc(0));
} catch (err) {
  if (err instanceof DicomParseError && err.code === FATAL_CODES.EMPTY_INPUT) {
    // handle empty input
  }
}
```

***

### OFFSET\_FRAMES

> `const` **OFFSET\_FRAMES**: `object`

The coordinate systems a `byteOffset` this parser publishes can be counted
in.

A byte offset is a number and a number alone says nothing about where its
zero is. This parser reads a Data Set out of three different buffers over one
`parseDicom` call, so the same small integer means three different things
depending on which one is being read, and until the diagnostic
PHI-residuals fix closed it, nothing on the thrown error said which. A consumer
cutting `input.subarray(err.byteOffset, err.byteOffset + 16)` to see what
upset the parser was, inside a Sequence Item, cutting an unrelated element:
the exact defect the `{ strict: true }` snippet itself was once fixed for.

**A frame NAME is published; a frame ORIGIN is not, and that asymmetry is
deliberate.** The name is drawn from the closed set below, which the parser
chooses and no sender can influence, and that membership is the whole of its
bound. An origin has no such table: it is a position reached by summing the
declared lengths that led to it, so two of them differ by a wire field, and a
message that already publishes `byteOffset` would be one number short of
one. **That is a weaker argument than an impossibility and is stated as
weaker**, since the library publishes positions freely in the `"input"`
frame; a graded pass said so. The item asked for the frame to be NAMED, and
nothing here needs the origin, so the cheap side of the trade is taken.

#### Type Declaration

##### INFLATED\_DATASET

> `readonly` **INFLATED\_DATASET**: `"inflated-dataset"` = `"inflated-dataset"`

Byte 0 is byte 0 of the inflated Data Set of a Deflated Explicit VR LE
object (`1.2.840.10008.1.2.1.99`). The compressed input holds no such
byte, so the offset does not index it at any scale.

##### INPUT

> `readonly` **INPUT**: `"input"` = `"input"`

Byte 0 is byte 0 of the buffer handed to `parseDicom`. The only frame in
which indexing the caller's own input by `byteOffset` is meaningful.

##### VALUE\_SLICE

> `readonly` **VALUE\_SLICE**: `"value-slice"` = `"value-slice"`

Byte 0 is byte 0 of a slice this parser cut from inside a Value Field: a
defined-length Sequence Item's value, or an `SQ`/`UN` value handed to a
descent. **Where that cut begins is deliberately not published**; see
this table's own note.

#### Example

```ts
import { parseDicom, DicomParseError, OFFSET_FRAMES } from "@cosyte/dicom";
try {
  parseDicom(buffer);
} catch (err) {
  if (err instanceof DicomParseError && err.offsetFrame === OFFSET_FRAMES.INPUT) {
    // Only here is `err.byteOffset` an index into the buffer you passed in.
    console.error(buffer.subarray(err.byteOffset, err.byteOffset + 16));
  }
}
```

***

### PATIENT\_ISSUE\_CODES

> `const` **PATIENT\_ISSUE\_CODES**: `object`

Stable codes for what the patient view reports about the non-human patient attributes. Compare
`issue.code` against a member to narrow.

#### Type Declaration

##### DICOM\_PATIENT\_CODE\_INCOMPLETE

> `readonly` **DICOM\_PATIENT\_CODE\_INCOMPLETE**: `"DICOM_PATIENT_CODE_INCOMPLETE"` = `"DICOM_PATIENT_CODE_INCOMPLETE"`

##### DICOM\_PATIENT\_CODE\_SEQUENCE\_EMPTY

> `readonly` **DICOM\_PATIENT\_CODE\_SEQUENCE\_EMPTY**: `"DICOM_PATIENT_CODE_SEQUENCE_EMPTY"` = `"DICOM_PATIENT_CODE_SEQUENCE_EMPTY"`

##### DICOM\_PATIENT\_CODE\_SEQUENCE\_EXTRA\_ITEMS

> `readonly` **DICOM\_PATIENT\_CODE\_SEQUENCE\_EXTRA\_ITEMS**: `"DICOM_PATIENT_CODE_SEQUENCE_EXTRA_ITEMS"` = `"DICOM_PATIENT_CODE_SEQUENCE_EXTRA_ITEMS"`

##### DICOM\_PATIENT\_VALUE\_NOT\_ENUMERATED

> `readonly` **DICOM\_PATIENT\_VALUE\_NOT\_ENUMERATED**: `"DICOM_PATIENT_VALUE_NOT_ENUMERATED"` = `"DICOM_PATIENT_VALUE_NOT_ENUMERATED"`

##### DICOM\_PATIENT\_VALUE\_WRONG\_TYPE

> `readonly` **DICOM\_PATIENT\_VALUE\_WRONG\_TYPE**: `"DICOM_PATIENT_VALUE_WRONG_TYPE"` = `"DICOM_PATIENT_VALUE_WRONG_TYPE"`

#### Example

```ts
import { parseDicom, PATIENT_ISSUE_CODES } from "@cosyte/dicom";
const p = parseDicom(buf).patient;
if (p.issues?.some((i) => i.code === PATIENT_ISSUE_CODES.DICOM_PATIENT_VALUE_NOT_ENUMERATED)) {
  // sexNeutered holds a value other than ALTERED or UNALTERED
}
```

***

### profiles

> `const` **profiles**: `Readonly`\<\{ `ge`: [`Profile`](#profile-2); `lenient`: [`Profile`](#profile-2); `philips`: [`Profile`](#profile-2); `siemens`: [`Profile`](#profile-2); `strict`: [`Profile`](#profile-2); \}\>

Frozen namespace of every built-in profile: three vendor private-dictionary
overlays (`ge`, `siemens`, `philips`) and two posture presets (`strict`,
`lenient`). Pass one straight to `parseDicom`.

#### Example

```ts
import { parseDicom, profiles } from "@cosyte/dicom";
const ds = parseDicom(buf, { profile: profiles.siemens });
console.log(profiles.siemens.describe?.());
```

***

### SERIALIZE\_ERROR\_CODES

> `const` **SERIALIZE\_ERROR\_CODES**: `object`

Stable string codes the serializer may throw. Narrow on
[DicomSerializeError.code](#code-3) to react to a specific failure.

#### Type Declaration

##### DIRECTORY\_OFFSET\_DEFLATED

> `readonly` **DIRECTORY\_OFFSET\_DEFLATED**: `"DIRECTORY_OFFSET_DEFLATED"` = `"DIRECTORY_OFFSET_DEFLATED"`

##### DIRECTORY\_OFFSET\_UNRESOLVED

> `readonly` **DIRECTORY\_OFFSET\_UNRESOLVED**: `"DIRECTORY_OFFSET_UNRESOLVED"` = `"DIRECTORY_OFFSET_UNRESOLVED"`

##### INVALID\_ENCAPSULATED\_PIXEL\_DATA

> `readonly` **INVALID\_ENCAPSULATED\_PIXEL\_DATA**: `"INVALID_ENCAPSULATED_PIXEL_DATA"` = `"INVALID_ENCAPSULATED_PIXEL_DATA"`

##### MISSING\_TRANSFER\_SYNTAX

> `readonly` **MISSING\_TRANSFER\_SYNTAX**: `"MISSING_TRANSFER_SYNTAX"` = `"MISSING_TRANSFER_SYNTAX"`

##### UNSUPPORTED\_TRANSFER\_SYNTAX

> `readonly` **UNSUPPORTED\_TRANSFER\_SYNTAX**: `"UNSUPPORTED_TRANSFER_SYNTAX"` = `"UNSUPPORTED_TRANSFER_SYNTAX"`

##### VALUE\_TOO\_LONG\_FOR\_VR

> `readonly` **VALUE\_TOO\_LONG\_FOR\_VR**: `"VALUE_TOO_LONG_FOR_VR"` = `"VALUE_TOO_LONG_FOR_VR"`

#### Example

```ts
import { SERIALIZE_ERROR_CODES } from "@cosyte/dicom";
SERIALIZE_ERROR_CODES.MISSING_TRANSFER_SYNTAX; // "MISSING_TRANSFER_SYNTAX"
```

***

### VALUE\_ERROR\_CODES

> `const` **VALUE\_ERROR\_CODES**: `object`

Stable string codes the domain helpers may throw. Narrow on
[DicomValueError.code](#code-4) to react to a specific contract violation.

#### Type Declaration

##### FRAME\_INDEX\_OUT\_OF\_RANGE

> `readonly` **FRAME\_INDEX\_OUT\_OF\_RANGE**: `"FRAME_INDEX_OUT_OF_RANGE"` = `"FRAME_INDEX_OUT_OF_RANGE"`

##### MISSING\_REQUIRED\_FUNCTIONAL\_GROUP

> `readonly` **MISSING\_REQUIRED\_FUNCTIONAL\_GROUP**: `"MISSING_REQUIRED_FUNCTIONAL_GROUP"` = `"MISSING_REQUIRED_FUNCTIONAL_GROUP"`

#### Example

```ts
import { VALUE_ERROR_CODES } from "@cosyte/dicom";
VALUE_ERROR_CODES.FRAME_INDEX_OUT_OF_RANGE; // "FRAME_INDEX_OUT_OF_RANGE"
```

***

### VERSION

> `const` **VERSION**: `string` = `"0.1.17"`

The version of `@cosyte/dicom`, the same as its `package.json` `version`. The `version` script
writes it with `cosyte-process sync-version` in the commit that bumps the package.

#### Example

```ts
import { VERSION } from "@cosyte/dicom";
typeof VERSION; // => "string"
```

***

### WARNING\_CODES

> `const` **WARNING\_CODES**: `object`

Stable string codes for every Tier-2 warning the parser may emit.

The registry is frozen via `as const` so TypeScript infers the exact
string-literal union for `WarningCode`, at no run-time cost. The set is
open: a release can add a code, and a code once published keeps its name.
Reserved codes that no stage emits yet carry inline comments naming the
stage that will.

#### Type Declaration

##### DICOM\_BOM\_IN\_TEXT\_VR

> `readonly` **DICOM\_BOM\_IN\_TEXT\_VR**: `"DICOM_BOM_IN_TEXT_VR"` = `"DICOM_BOM_IN_TEXT_VR"`

##### DICOM\_BURNED\_IN\_ANNOTATION\_NOT\_REMOVED

> `readonly` **DICOM\_BURNED\_IN\_ANNOTATION\_NOT\_REMOVED**: `"DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED"` = `"DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED"`

##### DICOM\_CHARSET\_AMBIGUOUS\_SEPARATOR

> `readonly` **DICOM\_CHARSET\_AMBIGUOUS\_SEPARATOR**: `"DICOM_CHARSET_AMBIGUOUS_SEPARATOR"` = `"DICOM_CHARSET_AMBIGUOUS_SEPARATOR"`

##### DICOM\_CHARSET\_ASSUMED

> `readonly` **DICOM\_CHARSET\_ASSUMED**: `"DICOM_CHARSET_ASSUMED"` = `"DICOM_CHARSET_ASSUMED"`

##### DICOM\_CHARSET\_BYTES\_UNDECODABLE

> `readonly` **DICOM\_CHARSET\_BYTES\_UNDECODABLE**: `"DICOM_CHARSET_BYTES_UNDECODABLE"` = `"DICOM_CHARSET_BYTES_UNDECODABLE"`

##### DICOM\_CHARSET\_ESCAPE\_UNDECLARED

> `readonly` **DICOM\_CHARSET\_ESCAPE\_UNDECLARED**: `"DICOM_CHARSET_ESCAPE_UNDECLARED"` = `"DICOM_CHARSET_ESCAPE_UNDECLARED"`

##### DICOM\_CHARSET\_EXTENSION\_NOT\_RESET

> `readonly` **DICOM\_CHARSET\_EXTENSION\_NOT\_RESET**: `"DICOM_CHARSET_EXTENSION_NOT_RESET"` = `"DICOM_CHARSET_EXTENSION_NOT_RESET"`

##### DICOM\_DA\_LEGACY\_FORMAT

> `readonly` **DICOM\_DA\_LEGACY\_FORMAT**: `"DICOM_DA_LEGACY_FORMAT"` = `"DICOM_DA_LEGACY_FORMAT"`

##### DICOM\_DEIDENT\_DATES\_NOT\_TRANSFORMED

> `readonly` **DICOM\_DEIDENT\_DATES\_NOT\_TRANSFORMED**: `"DICOM_DEIDENT_DATES_NOT_TRANSFORMED"` = `"DICOM_DEIDENT_DATES_NOT_TRANSFORMED"`

##### DICOM\_DEIDENT\_DICOMDIR\_FILE\_SET\_NOT\_DISCHARGED

> `readonly` **DICOM\_DEIDENT\_DICOMDIR\_FILE\_SET\_NOT\_DISCHARGED**: `"DICOM_DEIDENT_DICOMDIR_FILE_SET_NOT_DISCHARGED"` = `"DICOM_DEIDENT_DICOMDIR_FILE_SET_NOT_DISCHARGED"`

##### DICOM\_DEIDENT\_EMBEDDED\_ATTRIBUTE\_REMOVED

> `readonly` **DICOM\_DEIDENT\_EMBEDDED\_ATTRIBUTE\_REMOVED**: `"DICOM_DEIDENT_EMBEDDED_ATTRIBUTE_REMOVED"` = `"DICOM_DEIDENT_EMBEDDED_ATTRIBUTE_REMOVED"`

##### DICOM\_DEIDENT\_FILE\_META\_REPLACED

> `readonly` **DICOM\_DEIDENT\_FILE\_META\_REPLACED**: `"DICOM_DEIDENT_FILE_META_REPLACED"` = `"DICOM_DEIDENT_FILE_META_REPLACED"`

##### DICOM\_DEIDENT\_GROUP\_0004\_REMOVED

> `readonly` **DICOM\_DEIDENT\_GROUP\_0004\_REMOVED**: `"DICOM_DEIDENT_GROUP_0004_REMOVED"` = `"DICOM_DEIDENT_GROUP_0004_REMOVED"`

##### DICOM\_DEIDENT\_METHOD\_CODES\_PRIOR\_REPLACED

> `readonly` **DICOM\_DEIDENT\_METHOD\_CODES\_PRIOR\_REPLACED**: `"DICOM_DEIDENT_METHOD_CODES_PRIOR_REPLACED"` = `"DICOM_DEIDENT_METHOD_CODES_PRIOR_REPLACED"`

##### DICOM\_DEIDENT\_METHOD\_CODES\_PRIOR\_RETAINED

> `readonly` **DICOM\_DEIDENT\_METHOD\_CODES\_PRIOR\_RETAINED**: `"DICOM_DEIDENT_METHOD_CODES_PRIOR_RETAINED"` = `"DICOM_DEIDENT_METHOD_CODES_PRIOR_RETAINED"`

##### DICOM\_DEIDENT\_METHOD\_NOT\_ADDED

> `readonly` **DICOM\_DEIDENT\_METHOD\_NOT\_ADDED**: `"DICOM_DEIDENT_METHOD_NOT_ADDED"` = `"DICOM_DEIDENT_METHOD_NOT_ADDED"`

##### DICOM\_DEIDENT\_METHOD\_NOT\_LO

> `readonly` **DICOM\_DEIDENT\_METHOD\_NOT\_LO**: `"DICOM_DEIDENT_METHOD_NOT_LO"` = `"DICOM_DEIDENT_METHOD_NOT_LO"`

##### DICOM\_DEIDENT\_METHOD\_PRIOR\_RETAINED

> `readonly` **DICOM\_DEIDENT\_METHOD\_PRIOR\_RETAINED**: `"DICOM_DEIDENT_METHOD_PRIOR_RETAINED"` = `"DICOM_DEIDENT_METHOD_PRIOR_RETAINED"`

##### DICOM\_DEIDENT\_METHOD\_VALUE\_OVER\_LENGTH

> `readonly` **DICOM\_DEIDENT\_METHOD\_VALUE\_OVER\_LENGTH**: `"DICOM_DEIDENT_METHOD_VALUE_OVER_LENGTH"` = `"DICOM_DEIDENT_METHOD_VALUE_OVER_LENGTH"`

##### DICOM\_DEIDENT\_PRIVATE\_CARRIER\_NOT\_AUDITABLE

> `readonly` **DICOM\_DEIDENT\_PRIVATE\_CARRIER\_NOT\_AUDITABLE**: `"DICOM_DEIDENT_PRIVATE_CARRIER_NOT_AUDITABLE"` = `"DICOM_DEIDENT_PRIVATE_CARRIER_NOT_AUDITABLE"`

##### DICOM\_DEIDENT\_PRIVATE\_DECLARATION\_NOT\_RESOLVED

> `readonly` **DICOM\_DEIDENT\_PRIVATE\_DECLARATION\_NOT\_RESOLVED**: `"DICOM_DEIDENT_PRIVATE_DECLARATION_NOT_RESOLVED"` = `"DICOM_DEIDENT_PRIVATE_DECLARATION_NOT_RESOLVED"`

##### DICOM\_DEIDENT\_SEQUENCE\_NOT\_AUDITABLE

> `readonly` **DICOM\_DEIDENT\_SEQUENCE\_NOT\_AUDITABLE**: `"DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE"` = `"DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE"`

##### DICOM\_DEIDENT\_UNDEFINED\_VR\_NOT\_AUDITABLE

> `readonly` **DICOM\_DEIDENT\_UNDEFINED\_VR\_NOT\_AUDITABLE**: `"DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE"` = `"DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE"`

##### DICOM\_DEIDENT\_UNREGISTERED\_ELEMENT\_REMOVED

> `readonly` **DICOM\_DEIDENT\_UNREGISTERED\_ELEMENT\_REMOVED**: `"DICOM_DEIDENT_UNREGISTERED_ELEMENT_REMOVED"` = `"DICOM_DEIDENT_UNREGISTERED_ELEMENT_REMOVED"`

##### DICOM\_DIRECTORY\_OFFSET\_DEFLATED

> `readonly` **DICOM\_DIRECTORY\_OFFSET\_DEFLATED**: `"DICOM_DIRECTORY_OFFSET_DEFLATED"` = `"DICOM_DIRECTORY_OFFSET_DEFLATED"`

##### DICOM\_DIRECTORY\_OFFSET\_MALFORMED

> `readonly` **DICOM\_DIRECTORY\_OFFSET\_MALFORMED**: `"DICOM_DIRECTORY_OFFSET_MALFORMED"` = `"DICOM_DIRECTORY_OFFSET_MALFORMED"`

##### DICOM\_DIRECTORY\_OFFSET\_UNRESOLVED

> `readonly` **DICOM\_DIRECTORY\_OFFSET\_UNRESOLVED**: `"DICOM_DIRECTORY_OFFSET_UNRESOLVED"` = `"DICOM_DIRECTORY_OFFSET_UNRESOLVED"`

##### DICOM\_DIRECTORY\_RECORD\_REVISITED

> `readonly` **DICOM\_DIRECTORY\_RECORD\_REVISITED**: `"DICOM_DIRECTORY_RECORD_REVISITED"` = `"DICOM_DIRECTORY_RECORD_REVISITED"`

##### DICOM\_DT\_NONSTANDARD\_OFFSET

> `readonly` **DICOM\_DT\_NONSTANDARD\_OFFSET**: `"DICOM_DT_NONSTANDARD_OFFSET"` = `"DICOM_DT_NONSTANDARD_OFFSET"`

##### DICOM\_DUPLICATE\_FILE\_META\_ELEMENT

> `readonly` **DICOM\_DUPLICATE\_FILE\_META\_ELEMENT**: `"DICOM_DUPLICATE_FILE_META_ELEMENT"` = `"DICOM_DUPLICATE_FILE_META_ELEMENT"`

##### DICOM\_DUPLICATE\_TAG\_IN\_DATA\_SET

> `readonly` **DICOM\_DUPLICATE\_TAG\_IN\_DATA\_SET**: `"DICOM_DUPLICATE_TAG_IN_DATA_SET"` = `"DICOM_DUPLICATE_TAG_IN_DATA_SET"`

##### DICOM\_EMPTY\_ITEM\_IN\_SEQUENCE

> `readonly` **DICOM\_EMPTY\_ITEM\_IN\_SEQUENCE**: `"DICOM_EMPTY_ITEM_IN_SEQUENCE"` = `"DICOM_EMPTY_ITEM_IN_SEQUENCE"`

##### DICOM\_FILE\_META\_GROUP\_LENGTH\_MISMATCH

> `readonly` **DICOM\_FILE\_META\_GROUP\_LENGTH\_MISMATCH**: `"DICOM_FILE_META_GROUP_LENGTH_MISMATCH"` = `"DICOM_FILE_META_GROUP_LENGTH_MISMATCH"`

##### DICOM\_FILE\_META\_GROUP\_LENGTH\_MISSING

> `readonly` **DICOM\_FILE\_META\_GROUP\_LENGTH\_MISSING**: `"DICOM_FILE_META_GROUP_LENGTH_MISSING"` = `"DICOM_FILE_META_GROUP_LENGTH_MISSING"`

##### DICOM\_GROUP\_LENGTH\_IN\_DATASET

> `readonly` **DICOM\_GROUP\_LENGTH\_IN\_DATASET**: `"DICOM_GROUP_LENGTH_IN_DATASET"` = `"DICOM_GROUP_LENGTH_IN_DATASET"`

##### DICOM\_IMPLICIT\_VR\_FOR\_PRIVATE\_TAG\_WITHOUT\_VR

> `readonly` **DICOM\_IMPLICIT\_VR\_FOR\_PRIVATE\_TAG\_WITHOUT\_VR**: `"DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR"` = `"DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR"`

##### DICOM\_IS\_NONINTEGER\_VALUE

> `readonly` **DICOM\_IS\_NONINTEGER\_VALUE**: `"DICOM_IS_NONINTEGER_VALUE"` = `"DICOM_IS_NONINTEGER_VALUE"`

##### DICOM\_ITEM\_CROSSES\_SEQUENCE\_END

> `readonly` **DICOM\_ITEM\_CROSSES\_SEQUENCE\_END**: `"DICOM_ITEM_CROSSES_SEQUENCE_END"` = `"DICOM_ITEM_CROSSES_SEQUENCE_END"`

##### DICOM\_MISSING\_PREAMBLE

> `readonly` **DICOM\_MISSING\_PREAMBLE**: `"DICOM_MISSING_PREAMBLE"` = `"DICOM_MISSING_PREAMBLE"`

##### DICOM\_NON\_ASCII\_IN\_ASCII\_VR

> `readonly` **DICOM\_NON\_ASCII\_IN\_ASCII\_VR**: `"DICOM_NON_ASCII_IN_ASCII_VR"` = `"DICOM_NON_ASCII_IN_ASCII_VR"`

##### DICOM\_NONZERO\_RESERVED\_BYTES

> `readonly` **DICOM\_NONZERO\_RESERVED\_BYTES**: `"DICOM_NONZERO_RESERVED_BYTES"` = `"DICOM_NONZERO_RESERVED_BYTES"`

##### DICOM\_ODD\_LENGTH\_VALUE\_PADDED

> `readonly` **DICOM\_ODD\_LENGTH\_VALUE\_PADDED**: `"DICOM_ODD_LENGTH_VALUE_PADDED"` = `"DICOM_ODD_LENGTH_VALUE_PADDED"`

##### DICOM\_PARSE\_STOPPED\_BEFORE\_TAG

> `readonly` **DICOM\_PARSE\_STOPPED\_BEFORE\_TAG**: `"DICOM_PARSE_STOPPED_BEFORE_TAG"` = `"DICOM_PARSE_STOPPED_BEFORE_TAG"`

##### DICOM\_PIXEL\_DATA\_FRAGMENTS\_NOT\_DELIMITED

> `readonly` **DICOM\_PIXEL\_DATA\_FRAGMENTS\_NOT\_DELIMITED**: `"DICOM_PIXEL_DATA_FRAGMENTS_NOT_DELIMITED"` = `"DICOM_PIXEL_DATA_FRAGMENTS_NOT_DELIMITED"`

##### DICOM\_PIXEL\_DATA\_LENGTH\_MISMATCH

> `readonly` **DICOM\_PIXEL\_DATA\_LENGTH\_MISMATCH**: `"DICOM_PIXEL_DATA_LENGTH_MISMATCH"` = `"DICOM_PIXEL_DATA_LENGTH_MISMATCH"`

##### DICOM\_PRIVATE\_CREATOR\_UNKNOWN

> `readonly` **DICOM\_PRIVATE\_CREATOR\_UNKNOWN**: `"DICOM_PRIVATE_CREATOR_UNKNOWN"` = `"DICOM_PRIVATE_CREATOR_UNKNOWN"`

##### DICOM\_PRIVATE\_TAG\_NO\_CREATOR

> `readonly` **DICOM\_PRIVATE\_TAG\_NO\_CREATOR**: `"DICOM_PRIVATE_TAG_NO_CREATOR"` = `"DICOM_PRIVATE_TAG_NO_CREATOR"`

##### DICOM\_SQ\_NOT\_DESCENDED

> `readonly` **DICOM\_SQ\_NOT\_DESCENDED**: `"DICOM_SQ_NOT_DESCENDED"` = `"DICOM_SQ_NOT_DESCENDED"`

##### DICOM\_TRAILING\_NULL\_IN\_TEXT\_VR

> `readonly` **DICOM\_TRAILING\_NULL\_IN\_TEXT\_VR**: `"DICOM_TRAILING_NULL_IN_TEXT_VR"` = `"DICOM_TRAILING_NULL_IN_TEXT_VR"`

##### DICOM\_UI\_TRAILING\_SPACE

> `readonly` **DICOM\_UI\_TRAILING\_SPACE**: `"DICOM_UI_TRAILING_SPACE"` = `"DICOM_UI_TRAILING_SPACE"`

##### DICOM\_UN\_PARSED\_AS\_SQ

> `readonly` **DICOM\_UN\_PARSED\_AS\_SQ**: `"DICOM_UN_PARSED_AS_SQ"` = `"DICOM_UN_PARSED_AS_SQ"`

##### DICOM\_UNDEFINED\_LENGTH\_IN\_EXPLICIT\_VR

> `readonly` **DICOM\_UNDEFINED\_LENGTH\_IN\_EXPLICIT\_VR**: `"DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR"` = `"DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR"`

##### DICOM\_UNSUPPORTED\_CHARSET

> `readonly` **DICOM\_UNSUPPORTED\_CHARSET**: `"DICOM_UNSUPPORTED_CHARSET"` = `"DICOM_UNSUPPORTED_CHARSET"`

##### DICOM\_VR\_MISMATCH

> `readonly` **DICOM\_VR\_MISMATCH**: `"DICOM_VR_MISMATCH"` = `"DICOM_VR_MISMATCH"`

#### Example

```ts
import { parseDicom, WARNING_CODES } from "@cosyte/dicom";
const ds = parseDicom(buf);
if (ds.warnings.some((w) => w.code === WARNING_CODES.DICOM_MISSING_PREAMBLE)) {
  // handle bare File Meta input
}
```

## Functions

### codingSchemeOid()

> **codingSchemeOid**(`designator`): `string` \| `undefined`

Resolve a coding-scheme designator to its canonical OID, or `undefined`
for any non-standard / legacy designator (including `SRT`/`SNM3`/`99SDM`,
which are NOT treated as `SCT`).

#### Parameters

##### designator

`string` \| `undefined`

#### Returns

`string` \| `undefined`

#### Example

```ts
import { codingSchemeOid } from "@cosyte/dicom";
codingSchemeOid("UCUM"); // "2.16.840.1.113883.6.8"
codingSchemeOid("SRT");  // undefined - not SCT (CP-730)
```

***

### decodeElementValue()

> **decodeElementValue**(`element`): [`DicomValue`](#dicomvalue)

Decode an [Element](#element)'s value to a typed [DicomValue](#dicomvalue). Pure +
fail-safe: it never throws and never coerces a malformed value to a
plausible-but-wrong one. Called lazily (and memoized) by `Element.value`.

#### Parameters

##### element

[`Element`](#element)

#### Returns

[`DicomValue`](#dicomvalue)

#### Example

```ts
import { parseDicom } from "@cosyte/dicom";
const ds = parseDicom(buf);
const v = ds.get("00280010")?.value; // Rows (US)
if (v?.kind === "numbers") console.log(v.values[0]);
```

***

### decodeText()

> **decodeText**(`bytes`, `terms`): `string`

Decode bytes to a string under the Specific Character Set terms, never
throwing.

With more than one term, and a Value 1 other than `ISO_IR 192`, `GB18030` or
`GBK`, the bytes decode with ISO 2022 code extensions (PS3.5 section
6.1.2.5): every PS3.3 Table C.12-3 and C.12-4 escape sequence switches G0 or
G1, no escape byte reaches the string, and the Value 1 designations come back
after each CR, LF or FF, which are the reset points of a text VR. Bytes no
designated set decodes read as U+FFFD. Only the string is returned here;
`Element.value` carries the warnings for an element's value.

A single-byte set, and a list that names no set this build decodes, decodes
by the set's own table (PS3.5 sections 6.1.1, 6.1.2.1 and 6.1.2.3): the
default repertoire is ISO-IR 6, with nothing at `0x80` to `0xFF`; no set
defines the C1 bytes `0x80` to `0x9F`; and under `ISO_IR 13` (JIS X 0201)
`0x5C` is YEN SIGN and `0x7E` OVERLINE. A byte the set does not define reads
as U+FFFD, never as another set's character.

Every other term list decodes under [resolveDecoderLabel](#resolvedecoderlabel)'s label: an
unsupported label falls back to UTF-8, then to Latin-1 (1:1, cannot fail).

#### Parameters

##### bytes

`Buffer`

##### terms

readonly `string`[] \| `undefined`

#### Returns

`string`

#### Example

```ts
import { decodeText } from "@cosyte/dicom";
const s = decodeText(buf, ["ISO_IR 192"]); // UTF-8
decodeText(Buffer.from([0x45, 0x80]), ["ISO_IR 100"]); // "E" and U+FFFD: 0x80 is C1
// ESC $ B, the JIS X 0208 bytes of one character, ESC ( B
decodeText(Buffer.from([0x1b, 0x24, 0x42, 0x3b, 0x33, 0x1b, 0x28, 0x42]), ["", "ISO 2022 IR 87"]);
```

***

### defineProfile()

> **defineProfile**(`opts`): [`Profile`](#profile-2)

Build a frozen [Profile](#profile-2) from a validated options object.

#### Parameters

##### opts

[`DefineProfileOptions`](#defineprofileoptions)

#### Returns

[`Profile`](#profile-2)

#### Example

```ts
import { defineProfile, parseDicom } from "@cosyte/dicom";
const acme = defineProfile({
  name: "acme",
  description: "ACME PACS quirks",
  privateTags: {
    "ACME_PRIV_01": {
      "0019XX10": { vr: "DS", keyword: "AcmeDose", name: "ACME Dose" },
    },
  },
});
const ds = parseDicom(buf, { profile: acme });
console.log(acme.describe?.());
```

***

### deidentify()

> **deidentify**(`ds`, `options?`): [`DeidentifyResult`](#deidentifyresult)\<[`Dataset`](#dataset)\>

De-identify a [Dataset](#dataset) per PS3.15 Annex E - the Basic Application Level
Confidentiality Profile, plus any Retain/Clean Options passed in `retain`.

Pure: `ds` is never mutated. Returns a fresh dataset and a
[DeidentifyReport](#deidentifyreport) of tags, keywords, action codes, warnings and the UID
map. Everything in it is composed from static tables except `uidMap`, whose
keys are the source UIDs the file carried: treat that field as PHI.

The returned Data Set says what this run did to its **dates** as well as to its
identity: `(0028,0303) Longitudinal Temporal Information Modified` carries
`UNMODIFIED` when `RetainLongitudinalTemporal` was active, `MODIFIED` when
`RetainLongitudinalTemporalModifiedDates` was, and `REMOVED` under neither,
replacing any value the source carried at that tag. It is **not** on
[DeidentifyReport](#deidentifyreport) - like `(0012,0062)`, it is a statement the object
makes about itself, and the report's shape is unchanged by it. 🩺 A
`MODIFIED` means the modified-dates column was resolved; **you** perform the
date transformation §E.3.6 describes, and `report.warnings` carries
`DICOM_DEIDENT_DATES_NOT_TRANSFORMED` saying so.

**A JPIP Referenced object is refused, not de-identified.** When
`ds.fileMeta.transferSyntaxUID` is one of the four JPIP Referenced syntaxes
(PS3.5 2026c sections A.6, A.7, A.11 and A.12), the call throws before it
reads the options or the Data Set, because that object's Pixel Data Provider
URL `(0028,7FE0)` has no PS3.15 Table E.1-1 action and would otherwise be kept
by omission. The refusal keys on the File Meta alone: a non-JPIP object that
carries `(0028,7FE0)` is de-identified like any other, and keeps it.

#### Parameters

##### ds

[`Dataset`](#dataset)

##### options?

[`DeidentifyOptions`](#deidentifyoptions) = `{}`

#### Returns

[`DeidentifyResult`](#deidentifyresult)\<[`Dataset`](#dataset)\>

#### Throws

(`UNSUPPORTED_TRANSFER_SYNTAX`) for a `Dataset`
  whose File Meta Transfer Syntax UID is one of the four JPIP Referenced
  syntaxes, whatever the options; its message is a fixed string. Checked
  first, so it is the code such a call gets even when its options are
  invalid too.

#### Throws

(`INVALID_OPTIONS`) for an unknown Retain option,
  for both PS3.15 §E.3.6 temporal Options in one call, or for a malformed
  `uidRoot`.

#### Throws

(`VALUE_TOO_LONG_FOR_VR`) when the run
  re-encodes a Sequence Item, under an Explicit VR syntax, that keeps a Private
  Creator Data Element whose value is longer than 65,534 bytes. Only a
  `RetainSafePrivate` run whose `Profile` names a creator that long keeps one;
  PS3.5 2026c section 6.2.2 forbids the `UN` such a value is otherwise written
  as, so the Item has no encoding. The same element at the root is returned,
  and `serializeDicom` refuses it with the same code.

#### Example

```ts
import { parseDicom, deidentify, serializeDicom } from "@cosyte/dicom";
const { dataset, report } = deidentify(parseDicom(buf));
const clean = serializeDicom(dataset); // safe to share
console.log(report.attributes.length, "attributes acted on");
```

***

### fromDicomJson()

> **fromDicomJson**(`json`, `options?`): [`Dataset`](#dataset)

A [Dataset](#dataset) from a DICOM JSON Model object (PS3.18 Annex F), written under the File Meta
the caller gives (Explicit VR Little Endian when it gives none) and read back by `parseDicom`,
so `serializeDicom` writes it as Part 10.

Each attribute is written from its `vr` and its `Value`, `InlineBinary` or `BulkDataURI`, the
inverse of `toDicomJson`: strings joined by backslashes and padded to even length (`UI` with a
NUL, the rest with a space), Person Name groups joined by `=`, `DS` and `IS` numbers in
JavaScript's shortest text for them (or, past 16 characters, as significant digits and a power
of ten: `1e16`), and a `DS` or `IS` given as a JSON string, which PS3.18 F.2.3 allows, as its
own text; binary numbers and `AT` in the Transfer Syntax's byte order, and base64 as it is. A
`BulkDataURI` is taken on each VR PS3.18 F.2.2 names (`DS`, `FL`, `FD`, `IS`, `LT`, `OB`, `OD`,
`OF`, `OL`, `OV`, `OW`, `SL`, `SS`, `ST`, `SV`, `UC`, `UL`, `UN`, `US`, `UT`, `UV`) and handed
to `resolveBulkData`; the bytes it gives are Little Endian, as PS3.18 section 8.7.3.3.1 serves
bulk data, and are swapped value by value under Explicit VR Big Endian. Text fetched so is
written as the resolver gives it, and held to the checks the same text given as a `Value` is
held to, refused with the same codes. Data Elements are written in ascending tag
order at every depth. Sequences and Items take the `sequenceLength` option, defined lengths by
default. Text is encoded under the `(0008,0005)` Specific Character Set of its Data Set.

#### Parameters

##### json

[`DicomJsonDataset`](#dicomjsondataset)

One Data Set of the DICOM JSON Model, as `JSON.parse` returns it.

##### options?

[`FromDicomJsonOptions`](#fromdicomjsonoptions) = `{}`

The File Meta to write under, how to delimit Sequences, and how to resolve a
  `BulkDataURI`. Optional: every field has a default.

#### Returns

[`Dataset`](#dataset)

The Data Set, read by `parseDicom`.

#### Throws

rather than guess: `INVALID_JSON` for an object of another shape,
  `UNSUPPORTED_TRANSFER_SYNTAX` for a Transfer Syntax other than the four uncompressed and
  Deflated ones, `UNSUPPORTED_VR` for an `SV` or `UV` `Value`, whose form we have not read in a
  pinned copy of PS3.18 and which a JSON number does not hold past 2^53, or a VR PS3.5 does not
  define,
  `BULK_DATA_UNRESOLVED` for a `BulkDataURI` nothing resolved, `UNSUPPORTED_CHARACTER_SET` for
  text its Specific Character Set is not encoded under here or that the written Data Set does
  not read back as (a character past U+007F under the default repertoire, which is ISO-IR 6, a
  C1 code point under `ISO_IR 100`, which no set defines, or a lone surrogate under
  `ISO_IR 192`), `UNSUPPORTED_BYTE_ORDER` for an
  `OW`, `OF`, `OD`, `OL` or `OV` `InlineBinary` under Explicit VR Big Endian, whose byte order
  the annex leaves open, `UNREPRESENTABLE_NUMBER` for
  a number out of its VR's range (an `IS` string's included) or an `FL` number float32 does not
  hold, `MALFORMED_VALUE` for a `DS` or `IS` string, given or fetched, that is not one or is
  longer than its VR allows, or bulk data that is not a whole number of values of its VR, `VALUE_TOO_LONG` for a
  value its Value Length Field cannot hold, and `VR_MISMATCH` for an attribute whose VR the
  written Data Set does not read back with, as under Implicit VR Little Endian, where no VR is
  written. One value holding a delimiter its VR splits on (a backslash in a multi-valued string
  or a Person Name, an `=` in a Person Name group) is `INVALID_JSON`, never split, and so is a
  tag in group `0001`, `0003`, `0005`, `0007` or `FFFF`. A Specific
  Character Set of more than one value, or one we do not carry (an ISO 2022 term, `GB18030`,
  `GBK`), at any depth, is `UNSUPPORTED_CHARACTER_SET`; an `InlineBinary` on a VR that is not
  binary, or a `BulkDataURI` on a VR F.2.2 does not name or beside a `Value`, is `INVALID_JSON`;
  text, given or fetched, holding a control character its VR does not allow, ESC among them, is
  `MALFORMED_VALUE`, and fetched text bytes its set does not define are
  `UNSUPPORTED_CHARACTER_SET` (bytes that are not UTF-8 under `ISO_IR 192` `MALFORMED_VALUE`); Sequences nested more than 64 deep
  are `NESTING_TOO_DEEP`; and any other error, one the `resolveBulkData` option threw included,
  is `CONVERSION_FAILED`: no other error leaves this function.

#### Example

```ts
import { fromDicomJson, parseDicom, serializeDicom, toDicomJson } from "@cosyte/dicom";
const ds = parseDicom(buf);
const json = JSON.parse(JSON.stringify(toDicomJson(ds)));
const back = fromDicomJson(json, { fileMeta: ds.fileMeta ?? { transferSyntaxUID: "1.2.840.10008.1.2.1" } });
serializeDicom(back);
```

***

### isKnownCharsetTerm()

> **isKnownCharsetTerm**(`term`): `boolean`

`true` when `term` is a Specific Character Set defined term this build can
map to a decoder (the empty default-repertoire term counts as known).

#### Parameters

##### term

`string`

#### Returns

`boolean`

#### Example

```ts
import { isKnownCharsetTerm } from "@cosyte/dicom";
isKnownCharsetTerm("ISO_IR 192"); // true
isKnownCharsetTerm("ISO_IR 14"); // false - does not exist
```

***

### makeUidRemapper()

> **makeUidRemapper**(`root?`, `cache?`): [`UidRemapper`](#uidremapper)

Build a [UidRemapper](#uidremapper) rooted at `root`, optionally seeded with (and
writing through to) a caller-owned `cache` for cross-call sharing.

#### Parameters

##### root?

`string` = `DEFAULT_UID_ROOT`

Dotted-decimal UID root (default [DEFAULT\_UID\_ROOT](#default_uid_root)).

##### cache?

`Map`\<`string`, `string`\> = `...`

Source→replacement map to fill (default a fresh `Map`).

#### Returns

[`UidRemapper`](#uidremapper)

#### Throws

when `root` is not a valid dotted-decimal OID prefix
  or leaves no room for a value component within the 64-char UID limit.

#### Example

```ts
import { makeUidRemapper } from "@cosyte/dicom";
const remap = makeUidRemapper();
remap.map("1.2.840.113619.2.55.3") === remap.map("1.2.840.113619.2.55.3"); // true
```

***

### parseDate()

> **parseDate**(`raw`): `object`

Decode a single `DA` value. `legacy` is `true` for any tolerated
non-canonical form (retired dotted `YYYY.MM.DD`, or an unparseable value
such as `"ANONYMIZED"`), signalling the caller to emit
`DICOM_DA_LEGACY_FORMAT`.

#### Parameters

##### raw

`string`

#### Returns

`object`

##### legacy

> **legacy**: `boolean`

##### value

> **value**: [`DicomDate`](#dicomdate)

#### Example

```ts
import { parseDate } from "@cosyte/dicom";
parseDate("20240115").value.valid; // true
parseDate("2024.01.15").legacy; // true
```

***

### parseDateTime()

> **parseDateTime**(`raw`): `object`

Decode a single `DT` value. `nonstandardOffset` is `true` when a UTC
offset suffix is present but malformed / out of range, signalling the
caller to emit `DICOM_DT_NONSTANDARD_OFFSET`.

#### Parameters

##### raw

`string`

#### Returns

`object`

##### nonstandardOffset

> **nonstandardOffset**: `boolean`

##### value

> **value**: [`DicomDateTime`](#dicomdatetime)

#### Example

```ts
import { parseDateTime } from "@cosyte/dicom";
parseDateTime("20240115133015+0100").value.offsetMinutes; // 60
```

***

### parseDicom()

**`Internal`**

Implementation signature. Public JSDoc lives on the overloads above.

#### Call Signature

> **parseDicom**(`input`): [`Dataset`](#dataset)

Parse a DICOM Part 10 buffer into a structural [Dataset](#dataset).

Lenient by default: recoverable deviations (missing preamble, File Meta
group-length mismatch, odd-length value, etc.) are pushed into
`ds.warnings` with stable codes from `WARNING_CODES`. Four unrecoverable
structural failures throw `DicomParseError`:

  - `EMPTY_INPUT`: empty `Buffer | Uint8Array | ArrayBuffer`.
  - `NOT_DICOM_PART_10`: input lacks both `DICM` magic at offset 128 and
    a recognizable `(0002,0000)` File Meta Group Length at offset 0.
  - `INVALID_FILE_META`: File Meta is truncated or `(0002,0010)`
    Transfer Syntax UID is missing.
  - `UNSUPPORTED_TRANSFER_SYNTAX`: Transfer Syntax UID is none of the
    supported ones: the four native syntaxes (`1.2.840.10008.1.2`,
    `…1.2.1`, `…1.2.2`, `…1.2.1.99`), every encapsulated Pixel Data
    syntax PS3.5 2026c section A.4 names (JPEG, JPEG-LS, JPEG 2000, HTJ2K,
    RLE, MPEG, HEVC, JPEG XL, Deflated Image Frame, Encapsulated
    Uncompressed), and the four JPIP Referenced syntaxes of sections A.6,
    A.7, A.11 and A.12. The SMPTE ST 2110 syntaxes and every retired UID
    stay refused.

An object under a section A.4 syntax is read under Explicit VR Little Endian
rules, as A.4 requires: its metadata is fully readable, and its Pixel Data
fragments are handed back as opaque, undecoded bytes by
[readPixelDataFragments](#readpixeldatafragments). **No pixel is ever decoded.**

An object under a JPIP Referenced syntax is read the same way for metadata:
sections A.6 and A.11 make the Data Set Explicit VR Little Endian, and
sections A.7 and A.12 deflate that Data Set per RFC 1951, so it is inflated
first under the Deflated reader's decompression cap. Its Pixel Data Provider
URL (0028,7FE0) is returned as the `UR` element the file carries and is
**never fetched, resolved or validated**. The object is read-only here:
`serializeDicom` refuses to write the four JPIP syntaxes, and `deidentify`
refuses to de-identify an object under one of them.

Pass `{ strict: true }` to escalate every Tier-2 warning to a thrown
`DicomParseError` carrying the warning code.

Pass `{ stopBeforeTag: "7FE00010" }` to stop before Pixel Data and read only
the header; `readDicomHeader` does that from a file or a stream without
reading the rest of the file at all.

##### Parameters

###### input

`ArrayBuffer` \| `Buffer`\<`ArrayBufferLike`\> \| `Uint8Array`\<`ArrayBufferLike`\>

##### Returns

[`Dataset`](#dataset)

##### Example

```ts
import { parseDicom, WARNING_CODES, DicomParseError } from "@cosyte/dicom";
import { readFileSync } from "node:fs";

// Three input shapes: Buffer, Uint8Array, ArrayBuffer.
const bytes = readFileSync("study.dcm");
const ds1 = parseDicom(bytes);
const ds2 = parseDicom(new Uint8Array(bytes));
const ds3 = parseDicom(bytes.buffer);

// Inspect File Meta + warnings.
console.log(ds1.fileMeta?.transferSyntaxUID);
for (const w of ds1.warnings) {
  if (w.code === WARNING_CODES.DICOM_MISSING_PREAMBLE) {
    console.warn("bare File Meta input at offset", w.position.byteOffset);
  }
}

// Strict mode + onWarning callback.
try {
  parseDicom(bytes, {
    strict: true,
    onWarning: (w) => console.error(w.code, "at offset", w.position.byteOffset),
  });
} catch (err) {
  if (err instanceof DicomParseError) {
    console.error(err.code, err.byteOffset, err.snippet);
  }
}
```

#### Call Signature

> **parseDicom**(`input`, `options`): [`Dataset`](#dataset)

Parse a DICOM Part 10 buffer into a structural [Dataset](#dataset).

Lenient by default: recoverable deviations (missing preamble, File Meta
group-length mismatch, odd-length value, etc.) are pushed into
`ds.warnings` with stable codes from `WARNING_CODES`. Four unrecoverable
structural failures throw `DicomParseError`:

  - `EMPTY_INPUT`: empty `Buffer | Uint8Array | ArrayBuffer`.
  - `NOT_DICOM_PART_10`: input lacks both `DICM` magic at offset 128 and
    a recognizable `(0002,0000)` File Meta Group Length at offset 0.
  - `INVALID_FILE_META`: File Meta is truncated or `(0002,0010)`
    Transfer Syntax UID is missing.
  - `UNSUPPORTED_TRANSFER_SYNTAX`: Transfer Syntax UID is none of the
    supported ones: the four native syntaxes (`1.2.840.10008.1.2`,
    `…1.2.1`, `…1.2.2`, `…1.2.1.99`), every encapsulated Pixel Data
    syntax PS3.5 2026c section A.4 names (JPEG, JPEG-LS, JPEG 2000, HTJ2K,
    RLE, MPEG, HEVC, JPEG XL, Deflated Image Frame, Encapsulated
    Uncompressed), and the four JPIP Referenced syntaxes of sections A.6,
    A.7, A.11 and A.12. The SMPTE ST 2110 syntaxes and every retired UID
    stay refused.

An object under a section A.4 syntax is read under Explicit VR Little Endian
rules, as A.4 requires: its metadata is fully readable, and its Pixel Data
fragments are handed back as opaque, undecoded bytes by
[readPixelDataFragments](#readpixeldatafragments). **No pixel is ever decoded.**

An object under a JPIP Referenced syntax is read the same way for metadata:
sections A.6 and A.11 make the Data Set Explicit VR Little Endian, and
sections A.7 and A.12 deflate that Data Set per RFC 1951, so it is inflated
first under the Deflated reader's decompression cap. Its Pixel Data Provider
URL (0028,7FE0) is returned as the `UR` element the file carries and is
**never fetched, resolved or validated**. The object is read-only here:
`serializeDicom` refuses to write the four JPIP syntaxes, and `deidentify`
refuses to de-identify an object under one of them.

Pass `{ strict: true }` to escalate every Tier-2 warning to a thrown
`DicomParseError` carrying the warning code.

Pass `{ stopBeforeTag: "7FE00010" }` to stop before Pixel Data and read only
the header; `readDicomHeader` does that from a file or a stream without
reading the rest of the file at all.

##### Parameters

###### input

`ArrayBuffer` \| `Buffer`\<`ArrayBufferLike`\> \| `Uint8Array`\<`ArrayBufferLike`\>

###### options

[`ParseOptions`](#parseoptions)

##### Returns

[`Dataset`](#dataset)

##### Example

```ts
import { parseDicom, WARNING_CODES, DicomParseError } from "@cosyte/dicom";
import { readFileSync } from "node:fs";

// Three input shapes: Buffer, Uint8Array, ArrayBuffer.
const bytes = readFileSync("study.dcm");
const ds1 = parseDicom(bytes);
const ds2 = parseDicom(new Uint8Array(bytes));
const ds3 = parseDicom(bytes.buffer);

// Inspect File Meta + warnings.
console.log(ds1.fileMeta?.transferSyntaxUID);
for (const w of ds1.warnings) {
  if (w.code === WARNING_CODES.DICOM_MISSING_PREAMBLE) {
    console.warn("bare File Meta input at offset", w.position.byteOffset);
  }
}

// Strict mode + onWarning callback.
try {
  parseDicom(bytes, {
    strict: true,
    onWarning: (w) => console.error(w.code, "at offset", w.position.byteOffset),
  });
} catch (err) {
  if (err instanceof DicomParseError) {
    console.error(err.code, err.byteOffset, err.snippet);
  }
}
```

***

### parsePersonName()

> **parsePersonName**(`value`): [`PersonName`](#personname)

Parse a single (already charset-decoded, pad-trimmed) PN value string into
its structured [PersonName](#personname) form.

#### Parameters

##### value

`string`

#### Returns

[`PersonName`](#personname)

#### Example

```ts
import { parsePersonName } from "@cosyte/dicom";
const pn = parsePersonName("Doe^Jane^^Dr^");
pn.alphabetic.familyName; // "Doe"
pn.alphabetic.namePrefix; // "Dr"
```

***

### parseSpecificCharacterSet()

> **parseSpecificCharacterSet**(`bytes`): readonly `string`[]

Parse a `(0008,0005)` Specific Character Set value (a `CS`, possibly
multi-valued via ``) into its trimmed **defined terms**.

The first value may be empty (the ISO-2022 "G0 starts as ISO_IR 6" rule);
it is preserved as `""` rather than dropped so [resolveDecoderLabel](#resolvedecoderlabel)
can apply the default-repertoire fallback.

A component this closed table does not name is not a defined term, and it is
**withheld** rather than returned. This value is multi-valued on the
backslash, every component is a string a sender authored, and the result
lands on `Element.specificCharacterSet`, where it presents itself as an
identifier a downstream package may interpolate: that is the field, and the
delimiter, this package's measured PHI leak ran through. Decoding is
unaffected, because [resolveDecoderLabel](#resolvedecoderlabel) already skipped any term it
could not map and skips the withheld marker for the same reason.

#### Parameters

##### bytes

`Buffer`

#### Returns

readonly `string`[]

#### Example

```ts
import { parseSpecificCharacterSet } from "@cosyte/dicom";
// bytes for "ISO 2022 IR 6\\ISO 2022 IR 87"
const terms = parseSpecificCharacterSet(buf);
```

***

### parseTime()

> **parseTime**(`raw`): `object`

Decode a single `TM` value (max 14 bytes). Precision may be truncated from
the right (`HH`, `HHMM`, `HHMMSS`, `HHMMSS.FFFFFF`).

#### Parameters

##### raw

`string`

#### Returns

`object`

##### value

> **value**: [`DicomTime`](#dicomtime)

#### Example

```ts
import { parseTime } from "@cosyte/dicom";
parseTime("133015.5").value.fractionalSeconds; // 0.5
```

***

### readCode()

> **readCode**(`item`): [`CodedConcept`](#codedconcept)

Read the coded triplet off a code-item dataset (e.g. one item of a Code
Sequence). Every part is independently fail-safe; `schemeUid` is the
resolved OID for the designator when standard, else `undefined`.

#### Parameters

##### item

[`Dataset`](#dataset)

#### Returns

[`CodedConcept`](#codedconcept)

#### Example

```ts
import { parseDicom, readCode } from "@cosyte/dicom";
const units = parseDicom(buf).image.realWorldValueMaps?.[0]?.unitsCode;
// units?.codeValue / units?.codingSchemeDesignator / units?.codeMeaning
```

***

### readDicomHeader()

> **readDicomHeader**(`source`, `options?`): `Promise`\<[`Dataset`](#dataset)\>

Read a DICOM Part 10 file's header from a path, a file handle or a stream, without reading the
Pixel Data: the read stops before the first top-level element at or after `stopBeforeTag`
(Float Pixel Data `(7FE0,0008)` when it is not given, which also stops before Double Float Pixel
Data and Pixel Data), and the bytes after that are never read into memory.

The Dataset is the one `parseDicom(wholeFile, { ...options, stopBeforeTag })` returns: the same
elements, the same bytes, the same warnings, ending with `DICOM_PARSE_STOPPED_BEFORE_TAG`. It is
found by reading a prefix of the file (64 KiB, then twice as much each time) and parsing it until
one parse reaches the stop; `onWarning` is called once, for the warnings of that parse.

What it reads in full, and so holds in memory, is stated here rather than discovered:

- a file with no top-level element at or after the stop tag;
- a Deflated Explicit VR Little Endian file, whose Data Set, Pixel Data included, is one deflate
  stream that is inflated whole;
- a file `parseDicom` refuses, or one whose header `{ strict: true }` or a profile escalates a
  warning in: the error thrown is the one `parseDicom` throws on the whole file, read to its end.

A path is opened and closed here. A file handle is read from byte 0 and left open. A stream is
read from where it is and, once the stop is found, ended early through its iterator's `return`,
which destroys a Node `Readable` and cancels a web `ReadableStream`. A stream's chunks are held as
the stream makes them: one that hands over the whole file in one chunk has already put the whole
file in memory.

`options.maxBytes` bounds what is read: past it, with the stop not found, the read ends with a
`RangeError`. Set it for a source you do not trust.

#### Parameters

##### source

[`DicomByteSource`](#dicombytesource)

##### options?

[`ReadDicomHeaderOptions`](#readdicomheaderoptions) = `{}`

#### Returns

`Promise`\<[`Dataset`](#dataset)\>

#### Example

```ts
import { readDicomHeader } from "@cosyte/dicom";

// A 1 GiB study: only its header is read.
const ds = await readDicomHeader("study.dcm");
console.log(ds.study.instanceUid, ds.has("7FE00010")); // "2.25...." false

// Stop earlier, from a stream.
import { createReadStream } from "node:fs";
const patientOnly = await readDicomHeader(createReadStream("study.dcm"), {
  stopBeforeTag: "00200000",
});
```

***

### readPixelDataFragments()

> **readPixelDataFragments**(`ds`): [`PixelDataFragments`](#pixeldatafragments) \| `undefined`

Read the Basic Offset Table and every fragment of a Data Set's encapsulated
Pixel Data `(7FE0,0010)` as raw bytes, without decoding anything.

Pass the root [Dataset](#dataset) `parseDicom` returned: its Pixel Data is the
top-level element PS3.5 2026c section A.4 encapsulates. An `Item` is a
`Dataset` too, and is read the same way over its own elements.

**`undefined` means this Data Set has no encapsulated fragments**: Pixel Data
is absent, or it is present in native format with an explicit Value Length.
That is never an empty list and never a Basic Offset Table, so it cannot be
mistaken for an encapsulated result.

**The list can be short, and the parse says so.** A stream that ends with the
input before its Sequence Delimitation Item still parses, and
`DICOM_PIXEL_DATA_FRAGMENTS_NOT_DELIMITED` on `ds.warnings` says that the
fragments read may not be all the sender wrote. Read the warnings before
treating the list as complete.

#### Parameters

##### ds

[`Dataset`](#dataset)

#### Returns

[`PixelDataFragments`](#pixeldatafragments) \| `undefined`

#### Throws

with code `INVALID_FILE_META` when the element's
  bytes are not an Item stream (an Item header cut short, an Item reaching past
  the bytes, or a tag other than `(FFFE,E000)` / `(FFFE,E0DD)`). `parseDicom`
  refuses such bytes itself, so only a hand-built `Element` reaches this; the
  error carries no fragment byte and no length outside its 16-byte `snippet`.

#### Example

```ts
import { parseDicom, readPixelDataFragments } from "@cosyte/dicom";
const ds = parseDicom(buf); // e.g. a JPEG 2000 object
const pixels = readPixelDataFragments(ds);
if (pixels === undefined) {
  // no encapsulated Pixel Data: absent, or native
} else {
  for (const fragment of pixels.fragments) {
    // hand `fragment` to a codec of your choice; it is the bytes as written
  }
}
```

***

### resolveDecoderLabel()

> **resolveDecoderLabel**(`terms`): `string`

Resolve the `TextDecoder` label to use for a value, given the dataset's
Specific Character Set terms. Prefers a multibyte/extended decoder when
the term list mixes single-byte and code-extension sets; falls back to
the default repertoire (Latin-1, lenient) when no term resolves.

[decodeText](#decodetext) decodes under this label only when it names a multi-byte
set (`ISO_IR 192`, `GB18030`, `GBK`, or a multi-byte code-extension term sent
alone). A single-byte set decodes by its own table, which this label only
approximates: `latin1` is the WHATWG name of windows-1252, not ISO 8859-1,
and `shift_jis` is not JIS X 0201. Any other multi-term list decodes with
ISO 2022 code extensions, whatever label this returns.

#### Parameters

##### terms

readonly `string`[] \| `undefined`

#### Returns

`string`

#### Example

```ts
import { resolveDecoderLabel } from "@cosyte/dicom";
resolveDecoderLabel(["ISO 2022 IR 6", "ISO 2022 IR 87"]); // "iso-2022-jp"
resolveDecoderLabel(undefined); // "latin1"
```

***

### serializeDicom()

> **serializeDicom**(`ds`): `Buffer`

Serialize a [Dataset](#dataset) to a spec-clean DICOM Part 10 `Buffer`.

The dataset's transfer syntax is preserved (no transcoding): pixel-data
fragments are written back byte-for-byte, nested sequences carry the same
bytes with each Item's Data Elements in ascending tag order, and scalar values
are re-emitted with correct even-length padding and File Meta group length.
Pure function - the input `Dataset` is never mutated.

**Element order.** Every Data Set is written in ascending tag order
(PS3.5 2026c §7.1, §7.5.1): the root, and the Data Set of every Item in every
Sequence the writer can walk on the wire, at every depth up to
`NESTING_DEPTH_LIMIT`. Items stay in their order (PS3.5 2026c §7.5) and no
value changes; only whole element spans move, and only where the parsed
`items` match the bytes, so the output reads back as the source did. Limits:
a tag repeated inside an Item is kept twice, in source order, so that output
still breaks PS3.5 2026c §7.1's "at most once"; a Sequence whose Item stream
cannot be walked to exactly its end, one nested past the bound, one whose
`items` do not match its bytes (a Sequence the parser did not descend, for
one), and any `UN`-carried Sequence (under Implicit VR LE that includes a
private Sequence inside an Item, even one a `Profile` resolved to `SQ`, since
a default read resolves its tag to `UN`) are written as read, unordered; an
element whose own bytes do not show where a reader ends it (an
undefined-length `UN` the parser could not read as a Sequence, or a value
missing its Sequence Delimitation Item) is written after the ascending rest
of its Data Set, because a reader takes what follows it into its value, and
so is a Sequence nested past the bound (other than a defined-length one under
Implicit VR LE), whose end the writer would have to walk past the bound to
see; and an element the parser relocated because a length lied is ordered
where it was placed, since ordering cannot recover an order the source
destroyed.

**Encapsulated objects.** Under every Transfer Syntax PS3.5 2026c section A.4
names (JPEG, JPEG-LS, JPEG 2000, HTJ2K, RLE and the rest: the list `parseDicom`
reads), the File Meta Transfer Syntax UID is kept, the Data Set is written as
Explicit VR Little Endian, and the top-level Pixel Data `(7FE0,0010)` is
written as `OB` of undefined length: the input's Basic Offset Table Item and
fragment Items byte for byte and in order, then a zero-length Sequence
Delimitation Item. Nothing is decoded, transcoded or re-framed, and no offset
table is interpreted or rebuilt. The limit sits with it: a top-level Data Set
that section A.4 does not allow is refused with
`INVALID_ENCAPSULATED_PIXEL_DATA` rather than repaired, which includes a
fragment stream `parseDicom` read with `DICOM_PIXEL_DATA_FRAGMENTS_NOT_DELIMITED`,
an odd Item Length, an empty fragment, native or absent top-level Pixel Data,
and Float or Double Float Pixel Data. Pixel Data nested in a Sequence Item is
written as read.

**DICOMDIR offsets.** For a `Dataset` whose File Meta Media Storage SOP Class
UID is `1.2.840.10008.1.3.10`, `(0004,1200)`, `(0004,1202)` and each Directory
Record's `(0004,1400)` and `(0004,1420)` are written as the byte offset, from
the first preamble byte of the output, of the Directory Record each named when
the file was read (PS3.3 2026d Table F.3-3), whatever moved it: the rebuilt
File Meta group, the ascending order above, or `deidentify()`. A record is the
Item of the Directory Record Sequence `(0004,1220)` whose `Item.fileOffset`
the offset equals; nothing is found by scanning for an Item tag. A zero offset
is written as zero. Limits: the retired MRDR offset `(0004,1504)` is written as
read, and nothing checks record keys or `(0004,1202)` against the root chain.

**Input contract.** The writer is designed for a [Dataset](#dataset) produced by
`parseDicom`: it relies on the parser's `Element.rawBytes` representation
(value-only for scalars and Implicit-LE defined-length `SQ`; full on-wire span
for Explicit `SQ`, undefined-length spans, encapsulated Pixel Data, and the
`UN`/CP-246 fallbacks). A hand-built `Dataset` must follow the same
convention for its bytes to be encoded correctly.

**Round-trip scope.** `parseDicom(out)` re-reads to a dataset that is equal
over the *modeled* surface (every dataset element + the typed
"../dataset/file-meta".FileMeta fields plus any non-modeled File Meta
elements preserved on `extraElements`), not a byte-exact copy of the original
file: the 128-byte preamble is normalized to zeros, the File Meta group is
rebuilt in ascending tag order (modeled fields + `extraElements` - see
encodeFileMeta), the Data Sets are ordered as above, odd-length values
are padded even, and retired `(gggg,0000)` group lengths are dropped.

#### Parameters

##### ds

[`Dataset`](#dataset)

#### Returns

`Buffer`

#### Throws

with code `MISSING_TRANSFER_SYNTAX` when
  the dataset has no File Meta Transfer Syntax UID,
  `UNSUPPORTED_TRANSFER_SYNTAX` when that UID is neither one of the four
  native syntaxes nor a section A.4 one, `INVALID_ENCAPSULATED_PIXEL_DATA`
  when it is a section A.4 one and the top-level Pixel Data is not a fragment
  stream section A.4 allows, `DIRECTORY_OFFSET_UNRESOLVED` when a DICOMDIR
  carries an offset that is not zero and names no Directory Record the
  `Dataset` holds, or is not one 32-bit unsigned integer (never written stale
  or as zero), or `DIRECTORY_OFFSET_DEFLATED` when a DICOMDIR under Deflated
  Explicit VR LE carries a non-zero offset, or `VALUE_TOO_LONG_FOR_VR` when a
  Private Creator Data Element under an Explicit VR syntax, or a File Meta
  Information element under any, has a value past 65,534 bytes in a VR with a
  16-bit Value Length Field (PS3.5 2026c section 6.2.2 forbids the `UN` such a
  value is otherwise written as). Nothing is returned on a throw.

#### Example

```ts
import { parseDicom, serializeDicom } from "@cosyte/dicom";
const ds = parseDicom(buf);
const out = serializeDicom(ds); // spec-clean Part 10, same transfer syntax
// parseDicom(out) re-reads to a structurally-equal dataset.
```

***

### stringifyDicomJson()

> **stringifyDicomJson**(`json`, `space?`): `string`

The JSON text of a DICOM JSON Model Data Set, its attributes in ascending order of their tags at
every depth, as PS3.18 F.2.2 orders them. `JSON.stringify` cannot write that order for every
Data Set: an all-digit tag with no leading zero, such as `60000010` Overlay Rows or `20000010`
Number of Copies, is an integer index, which a JavaScript object lists before its other keys
whatever order they were added in. Tags are ordered by their value, so `0010000a` before
`0010000B`, whatever the case of their hex letters. Everything else is written as
`JSON.stringify` writes it, `space` included, so where the order already holds the two give the
same text; a `toJSON` method, the Data Set's own included, is called as `JSON.stringify` calls
it, once, with the key it is held under, and what it returns is written in its place.

#### Parameters

##### json

[`DicomJsonDataset`](#dicomjsondataset)

A Data Set of the DICOM JSON Model, usually from `toDicomJson`.

##### space?

`string` \| `number`

Indentation, as `JSON.stringify` takes it: a number of spaces up to 10, or a
  string of up to 10 characters.

#### Returns

`string`

The JSON text.

#### Throws

with `CONVERSION_FAILED` for a value `JSON.stringify` cannot
  write, such as a `bigint` or a cycle, for an error a `toJSON` method throws, and where the
  Data Set's own `toJSON` leaves no text; the error it replaces is not kept.

#### Example

```ts
import { parseDicom, stringifyDicomJson, toDicomJson } from "@cosyte/dicom";
const text = stringifyDicomJson(toDicomJson(parseDicom(buf)));
// '{"00080005":{...},...,"60000010":{"vr":"US","Value":[512]}}'
```

***

### toDate()

> **toDate**(`value`, `options?`): `Date` \| `undefined`

The value as an absolute instant, ONLY where the zone is determinate.

A stated `&ZZXX` offset wins and `options.assumeOffsetMinutes` is ignored.
With no stated offset the caller's `assumeOffsetMinutes` is applied, an
explicit `0` meaning "treat this naive value as UTC". With neither, the
answer is `undefined`: the host machine's zone is never read and UTC is never
assumed. A value with no year is never an instant, so a `TM` always answers
`undefined` however the call is made. A non-finite `assumeOffsetMinutes`
(`NaN`, `Infinity`, `-Infinity`) names no zone either, so it answers
`undefined` rather than an `Invalid Date` whose `getTime()` is `NaN`, and so
does a finite offset so large that applying it leaves the range a `Date` can
represent. A value naming no real calendar point is refused before any of
that, so an impossible day is never rolled into the next month.

Components below the stated precision fill to their lowest legal value for
the instant alone; the value's own precision is untouched, and a later
[toObject](#toobject) or [toISO](#toiso) on it returns what it returned before. A
four-digit year below 100 stays that year, so `0050` is the year 50 and the
two-digit remapping of `Date.UTC` never reaches the result.

#### Parameters

##### value

`DicomTemporal` \| `null` \| `undefined`

##### options?

[`ToDateOptions`](#todateoptions)

#### Returns

`Date` \| `undefined`

#### Example

```ts
import { parseDate, parseDateTime, toDate } from "@cosyte/dicom";

toDate(parseDate("20240115").value); // undefined: no zone was stated
toDate(parseDate("20240115").value, { assumeOffsetMinutes: 0 })?.toISOString();
// "2024-01-15T00:00:00.000Z"
toDate(parseDateTime("20240115133015+0100").value)?.toISOString();
// "2024-01-15T12:30:15.000Z"
toDate(parseDate("18700230").value, { assumeOffsetMinutes: 0 });
// undefined: never 1 March for a value the sender wrote as February
```

***

### toDicomJson()

> **toDicomJson**(`ds`, `options?`): [`DicomJsonDataset`](#dicomjsondataset)

The DICOM JSON Model (PS3.18 Annex F) of a [Dataset](#dataset): one JSON object whose keys are the
tags, eight uppercase hex digits, added in ascending order at every depth as PS3.18 F.2.2 orders
them, each with its `vr` and its value as `Value`, `InlineBinary` or `BulkDataURI`. Metadata only: no File Meta Information,
which the model does not carry, and no retired Group Length.

How each VR is written: text VRs as JSON strings with their padding removed, `null` for an empty
value among several; `PN` as an object of `Alphabetic`, `Ideographic` and `Phonetic` groups;
`DS`, `IS`, `US`, `SS`, `UL`, `SL`, `FL` and `FD` as JSON numbers, but a `DS` of at most 16
bytes whose value no JSON number holds exactly as a JSON string of its text, which PS3.18 F.2.3
allows; `AT` as eight hex digits;
`SQ` as an array of nested Data Sets; and `OB`, `OD`, `OF`, `OL`, `OV`, `OW` and `UN` as base64
`InlineBinary`, or as a `BulkDataURI` where the `bulkDataUri` option gives one. Pixel Data and
the other bulk values are written inline only with the `inlineBulkData` option. Encapsulated
Pixel Data, which the annex gives no inline form, is written only as the `BulkDataURI` the
option gives it. An attribute
with an empty value has no value field. Text is decoded through `(0008,0005)` Specific Character
Set, by the decoder `Element.value` uses, and `(0008,0005)` is kept as it is. Only one value of
the default repertoire, a single-byte `ISO_IR` set or `ISO_IR 192` is carried. With the
`fallbackCharacterSet` option, text whose Data Set declares no set (no `(0008,0005)`, or an empty
one) is read under the set it names instead of ISO-IR 6, and with
`fallbackCharacterSetForUnknown` so is text under a term this build does not decode; no
`(0008,0005)` is added to the result.

The result is a plain object, and `fromDicomJson` reads it back. Write its text with
`stringifyDicomJson`: `JSON.stringify` puts an all-digit tag such as `60000010` before the
others, out of the order F.2.2 requires, since JavaScript lists integer keys first.

#### Parameters

##### ds

[`Dataset`](#dataset)

The Data Set, usually from `parseDicom`.

##### options?

[`ToDicomJsonOptions`](#todicomjsonoptions) = `{}`

Where to hand binary values out as a `BulkDataURI`, and whether bulk values may
  go inline.

#### Returns

[`DicomJsonDataset`](#dicomjsondataset)

The Data Set as a DICOM JSON object.

#### Throws

rather than change or guess a value: `UNSUPPORTED_VR` for `SV`
  and `UV` values, whose form we have not read in a pinned copy of PS3.18, `UNSUPPORTED_ELEMENT` for encapsulated Pixel Data the `bulkDataUri` option gives no
  URI, or another undefined-length value that is not a read Sequence, `UNSUPPORTED_BYTE_ORDER` for an `OW`, `OF`, `OD`, `OL` or `OV`
  value under Explicit VR Big Endian, `UNREPRESENTABLE_NUMBER` for NaN, an infinity, an `FL` or
  `FD` negative zero, a `DS` or `IS` value that is not a number, or an `IS` that no JSON number
  holds exactly, `MALFORMED_VALUE` for a binary value whose length is not a whole number of values, a
  Person Name of more than three groups or text its Specific Character Set does not decode,
  `UNSUPPORTED_CHARACTER_SET` for a Specific Character Set of more than one value or one we do
  not carry, at any depth, `BULK_DATA_URI_REQUIRED` for a bulk value with no URI and no
  `inlineBulkData`, `INVALID_OPTION` for a `fallbackCharacterSet` outside
  `FALLBACK_CHARACTER_SETS` or a `fallbackCharacterSetForUnknown` that is not a boolean given with
  one, and `CONVERSION_FAILED` for any other error, one the `bulkDataUri` option
  threw included.

#### Example

```ts
import { parseDicom, stringifyDicomJson, toDicomJson } from "@cosyte/dicom";
const json = toDicomJson(parseDicom(buf), {
  bulkDataUri: (el) => `https://example.com/bulk/${el.tag}`,
});
json["00100010"]; // { vr: "PN", Value: [{ Alphabetic: "DOE^JANE" }] }
stringifyDicomJson(json);
```

***

### toISO()

> **toISO**(`value`): `string` \| `undefined`

The value as an ISO-8601 string, TRUNCATED to the precision it stated.

Nothing is padded out: a `DA` renders `2024-01-15`, a `DT` that stated only
an hour renders `2024-01-15T13`, and a `TM` renders the bare time. Fractional
digits are rendered exactly as written. A stated offset is appended, `Z` when
it is zero; a value that stated NO offset gets nothing appended, because a
fabricated `Z` would claim UTC the sender never wrote.

Returns `undefined` for an invalid value, for `null` / `undefined`, for a
value that stated no component at all, and for one naming no real calendar
point: a string such as `"2024-02-30"` is worse than no answer, because every
ISO-8601 reader moves it silently to 1 March. It never throws. This is not a
byte round-trip of the wire value and is not meant to be: `serializeDicom`
remains the route that reproduces the original bytes.

#### Parameters

##### value

`DicomTemporal` \| `null` \| `undefined`

#### Returns

`string` \| `undefined`

#### Example

```ts
import { parseDate, parseDateTime, parseTime, toISO } from "@cosyte/dicom";

toISO(parseDateTime("20240115133015-0500").value); // "2024-01-15T13:30:15-05:00"
toISO(parseTime("133015").value); // "13:30:15"
toISO(parseDate("18700431").value); // undefined: April has no 31st
```

***

### toObject()

> **toObject**(`value`): [`DateParts`](#dateparts) \| `undefined`

The calendar components a `DA`, `TM` or `DT` value stated, as a frozen object.

Returns `undefined` for a value the decoders marked `valid: false`, for
`null` / `undefined`, for a value that stated no component at all, and for
one whose components name no real calendar point (30 February, 29 February
outside a leap year, 31 April, second 60). It never throws.
`hours` / `minutes` / `seconds` are renamed to the singular
`hour` / `minute` / `second`; `raw`, `valid` and the `legacy` and
`nonstandardOffset` flags the decoders report beside the value never appear.

#### Parameters

##### value

`DicomTemporal` \| `null` \| `undefined`

#### Returns

[`DateParts`](#dateparts) \| `undefined`

#### Example

```ts
import { parseDate, parseDateTime, parseTime, toObject } from "@cosyte/dicom";

toObject(parseDateTime("20240115133015").value);
// { year: 2024, month: 1, day: 15, hour: 13, minute: 30, second: 15 }

toObject(parseTime("133015.123456").value).millisecond; // 123, from the digits
toObject(parseDate("18700230").value); // undefined: February has no 30th
```
