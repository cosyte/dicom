---
"@cosyte/dicom": patch
---

An Explicit VR element now agrees with any VR the dictionary lists for its tag, so Pixel Data written as OW no longer raises DICOM_VR_MISMATCH or throws under the strict preset.

The parser compared the on-wire VR with only the first VR the dictionary lists. Tags such as Pixel Data (7FE0,0010) as OB or OW, and Smallest Image Pixel Value (0028,0106) as US or SS, raised a false warning when written with the second VR, and the strict preset escalated it to a throw. A VR the dictionary does not list for the tag still raises the warning, which names the first listed VR.
