# Dictionary

Public Dictionary namespace for `@cosyte/dicom`.

 - [lookup](#lookup) - accepts either an 8-char hex tag (`"00100010"`) or a
   keyword (`"PatientName"`) and returns the typed [DictionaryEntry](#dictionaryentry)
   or `undefined`.
 - [byKeyword](#bykeyword) - keyword-only lookup; for cases where the caller has
   already validated the input shape and wants a narrower call.
 - [uid](#uid-1) - UID lookup.

No function throws on miss: each returns the typed entry or `undefined`.
Returned entries are deeply frozen - mutation attempts
throw `TypeError` in strict mode (which all of `@cosyte/dicom`'s emitted code
runs under, given `"use strict"` is implicit for ES modules).

## Example

```ts
import { Dictionary } from "@cosyte/dicom";

// Tag or keyword, either way round, and `undefined` rather than a throw on a miss.
Dictionary.lookup("00100020")?.name; // "Patient ID"
Dictionary.byKeyword("Modality")?.tag; // "00080060"

// UIDs resolve to their registered name, so nobody hard-codes a SOP Class table.
Dictionary.uid("1.2.840.10008.5.1.4.1.1.2")?.name; // "CT Image Storage"
```

## Interfaces

### DictionaryEntry

One DICOM attribute as published in PS3.6 (Data Dictionary).

#### Example

```ts
import { Dictionary } from "@cosyte/dicom";
  const entry = Dictionary.lookup("00100010");
  if (entry) {
    // entry.keyword === "PatientName"
    // entry.vr      === ["PN"]
  }
```

#### Properties

##### keyword

> `readonly` **keyword**: `string`

##### name

> `readonly` **name**: `string`

##### repeatingGroup?

> `readonly` `optional` **repeatingGroup?**: `boolean`

`true` for repeating-group families (`(50xx,xxxx)`, `(60xx,xxxx)`:
curves/overlays); the [DictionaryEntry.tag](#tag) field for these contains
lowercase `x` placeholders, NOT a concrete 8-hex-char tag. Repeating-group
entries are not surfaced by `Dictionary.lookup(tag)` for concrete tags.

##### retired

> `readonly` **retired**: `boolean`

##### tag

> `readonly` **tag**: `string`

##### vm

> `readonly` **vm**: `string`

##### vr

> `readonly` **vr**: readonly [`VR`](#vr-1)[]

***

### UidEntry

One DICOM UID as published in PS3.6 Annex A (Tables A-1 and A-2).

`name` is the normative UID Name, with two deliberate conveniences. Retirement is carried in
`retired` rather than as the trailing `(Retired)` every retired Annex A row carries in its UID
Name, and four transfer syntaxes carry the short form every DICOM toolkit prints rather than
PS3.6's longer `...: Default Transfer Syntax for ...` form. Every other name is the normative
text.

#### Example

```ts
import { Dictionary } from "@cosyte/dicom";
  const ts = Dictionary.uid("1.2.840.10008.1.2.1");
  if (ts) {
    // ts.name === "Explicit VR Little Endian"
    // ts.type === "TransferSyntax"
  }
```

#### Properties

##### name

> `readonly` **name**: `string`

##### retired

> `readonly` **retired**: `boolean`

##### type

> `readonly` **type**: `"TransferSyntax"` \| `"SOPClass"` \| `"MetaSOPClass"` \| `"WellKnownFrameOfReference"` \| `"WellKnownSOPInstance"` \| `"CodingScheme"` \| `"ApplicationContext"` \| `"ServiceClass"` \| `"Other"`

##### uid

> `readonly` **uid**: `string`

## Type Aliases

### Tag

> **Tag** = `string`

8-character uppercase hex DICOM tag, e.g., `"00100010"` (Patient's Name).

For repeating-group attribute families (`(50xx,xxxx)` curves, `(60xx,xxxx)`
overlays, etc.), the tag string preserves lowercase `x` placeholders verbatim
- those entries cannot be looked up by concrete tag and are flagged via
[DictionaryEntry.repeatingGroup](#repeatinggroup).

#### Example

```ts
const tag: Tag = "00100010"; // Patient's Name
```

***

### VR

> **VR** = `"AE"` \| `"AS"` \| `"AT"` \| `"CS"` \| `"DA"` \| `"DS"` \| `"DT"` \| `"FL"` \| `"FD"` \| `"IS"` \| `"LO"` \| `"LT"` \| `"OB"` \| `"OD"` \| `"OF"` \| `"OL"` \| `"OV"` \| `"OW"` \| `"PN"` \| `"SH"` \| `"SL"` \| `"SQ"` \| `"SS"` \| `"ST"` \| `"SV"` \| `"TM"` \| `"UC"` \| `"UI"` \| `"UL"` \| `"UN"` \| `"UR"` \| `"US"` \| `"UT"` \| `"UV"`

The 33 standard DICOM Value Representations from PS3.5 §6.2 plus the 64-bit
additions (`OV`, `SV`, `UV`) introduced in DICOM 2018.

Note that some attributes in the data dictionary list MULTIPLE possible VRs
- see [DictionaryEntry.vr](#vr) (which is always an array, possibly empty
for retired entries with no VR or special "See Note" entries).

#### Example

```ts
const vr: VR = "PN"; // Person Name
```

## Functions

### byKeyword()

> **byKeyword**(`keyword`): [`DictionaryEntry`](#dictionaryentry) \| `undefined`

Look up a DICOM attribute strictly by keyword (`"PatientName"`).

Returns `undefined` for unknown keywords or malformed input. Use
[lookup](#lookup) if the input could be either a tag or a keyword.

#### Parameters

##### keyword

`string`

#### Returns

[`DictionaryEntry`](#dictionaryentry) \| `undefined`

#### Example

```ts
import { Dictionary } from "@cosyte/dicom";
  const e = Dictionary.byKeyword("StudyInstanceUID");
  // e?.tag === "0020000D"
```

***

### lookup()

> **lookup**(`tagOrKeyword`): [`DictionaryEntry`](#dictionaryentry) \| `undefined`

Look up a DICOM attribute by tag (`"00100010"`) or keyword (`"PatientName"`).

Hex tag input is normalized to uppercase; keyword input is case-sensitive.
Returns `undefined` for unknown tags, unknown keywords, malformed input, or
tags from repeating-group families (those resolve via the family entry's
`repeatingGroup` flag - see [DictionaryEntry](#dictionaryentry)).

#### Parameters

##### tagOrKeyword

`string`

#### Returns

[`DictionaryEntry`](#dictionaryentry) \| `undefined`

#### Example

```ts
import { Dictionary } from "@cosyte/dicom";
  const a = Dictionary.lookup("00100010");        // by tag
  const b = Dictionary.lookup("PatientName");     // by keyword
  const c = Dictionary.lookup("not-real");        // undefined, never a throw
```

***

### uid()

> **uid**(`uidValue`): [`UidEntry`](#uidentry) \| `undefined`

Look up a DICOM UID by its dotted-decimal value.

Covers PS3.6 Annex A whole: transfer syntaxes, SOP and Meta SOP Classes,
well-known SOP Instances and Frames of Reference, coding schemes and the
rest, current and retired alike. Returns `undefined` for unknown UIDs or
malformed input. Used by `parseDicom()` to render human-readable
Transfer Syntax names.

#### Parameters

##### uidValue

`string`

#### Returns

[`UidEntry`](#uidentry) \| `undefined`

#### Example

```ts
import { Dictionary } from "@cosyte/dicom";
  const ts = Dictionary.uid("1.2.840.10008.1.2.1");
  // ts?.name === "Explicit VR Little Endian"
  // ts?.type === "TransferSyntax"
```
