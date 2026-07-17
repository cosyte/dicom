# Trademarks

`@cosyte/dicom` is an independent open-source project. cosyte is **not affiliated with, endorsed by,
or sponsored by** any company named in this repository or its documentation.

## Why these names appear

DICOM private data elements carry no on-wire VR under Implicit VR Little Endian, so resolving them
requires knowing whose private blocks they belong to. Naming the vendor is the only way to
describe — or correctly decode — its private dictionary.

Every reference is **descriptive**: it identifies whose private dictionary a profile resolves, and nothing more. Naming a system is the only way to say
whether a library works with it.

## Where the profiles come from

The built-in source profiles are authored through this package's own public `defineProfile()` API,
from public open-source dictionaries — the GDCM private dictionary and dcm2niix tag notes — and
from vendor-published schema identifiers. Each profile documents its sources inline. They embed
no privileged, confidential, or reverse-engineered material, and no patient data.

## Names referenced

| Name    | Where it appears                                                               |
| ------- | ------------------------------------------------------------------------------ |
| GE      | `profiles.ge` — a built-in profile name, resolving the `GEMS_*` private blocks |
| Siemens | `profiles.siemens` — a built-in profile name                                   |
| Philips | `profiles.philips` — a built-in profile name                                   |

All product names, logos, and brands are the property of their respective owners. Use of a name here
does not imply any affiliation with, or endorsement by, its owner. If you own one of these marks and
would like a reference changed, please open an issue.
