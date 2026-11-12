---
"@cosyte/dicom": patch
---

Under Implicit VR Little Endian, an attribute PS3.6 lists with more than one VR now reads with the VR PS3.5 gives it, not the first listed.

- Pixel Data `(7FE0,0010)`, Overlay Data `(60xx,3000)`, Waveform Data `(5400,1010)`, Channel
  Minimum Value `(5400,0110)`, Channel Maximum Value `(5400,0112)`, Waveform Padding Value
  `(5400,100A)`, Dark Current Counts `(0014,3050)` and Air Counts `(0014,3070)` report `vr` `"OW"`
  where they reported `"OB"`. A 16-bit value read as OB and written as Big Endian was never
  byte-swapped, so every sample came out reversed.
- LUT Data `(0028,3006)` and Gray Lookup Table Data `(0028,1200)` report `"OW"` when the value is
  longer than 65,534 bytes, which an Explicit VR US cannot declare, and `"US"` otherwise, as before.
- The US or SS attributes that hold a pixel sample value (Smallest and Largest Image Pixel Value,
  Pixel Padding Value, Real World Value First and Last Value Mapped, Histogram First and Last Bin
  Value and the rest) report `"SS"`, and `element.value` decodes them as signed, when the Pixel
  Representation `(0028,0103)` read before them in their Data Set or an enclosing one is 1. They
  stay `"US"` otherwise. The lookup table descriptors stay `"US"`.
- The bytes read do not change, and neither does an Explicit VR read. A caller that compared
  `element.vr` to `"OB"` for native Pixel Data from an Implicit VR file compares it to `"OW"`, or
  to either.
