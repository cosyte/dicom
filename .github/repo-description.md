# GitHub repository description proposal

This file records the one line public description proposed for this repository,
the formula it was derived from, and the evidence behind it. It is a proposal.

Rewrite required: yes
Failed constraint: 4

## Proposed line

Copy the line inside the fence below verbatim into the repository description
field. No editing, reflowing, or reassembly is needed.

```
DICOM Part 10 parser + utility library for Node.js and TypeScript: metadata-first, vendor-quirky-tolerant, dual ESM/CJS.
```

## Application status

Not applied. No stage can reach the GitHub repository description field; the operator applies this line.

The backlog item reports the GitHub description as empty; that is the item's premise, attributed to the backlog item, not observed by any stage.

## The formula

Shape:

    <STANDARD> <capabilities> for Node.js and TypeScript: <differentiator>.

- <STANDARD> is the standard as the org names it. For this repository it is
  exactly DICOM, and the line begins with it.
- <capabilities> are the primary artefacts the package ships, as a comma
  separated noun list.
- "for Node.js and TypeScript" is verbatim, byte identical in every suite
  repository. It is the phrase that makes the suite read as one family.
- A colon and one space separate the family phrase from the differentiator.
- <differentiator> is one short clause on what this implementation is like. No
  marketing superlatives, no version numbers, no links.
- A single "." terminates the line.

### The six mechanical constraints

1. Exactly one line; no embedded newline.
2. Length between 40 and 140 characters inclusive.
3. Printable US-ASCII only. No en dash, no em dash, no smart quotes, no emoji.
4. Begins with "DICOM " and contains the substring "for Node.js and TypeScript".
5. Ends with "." and carries no leading or trailing whitespace.
6. Contains the substring "for Node.js and TypeScript: ", the colon separator
   the shape line requires.

### How the value on record measures against them

The description carried by package.json before this change was:

    Developer-focused DICOM Part 10 parser + utility library for Node.js and TypeScript: metadata-first, vendor-quirky-tolerant, dual ESM/CJS.

That value is 138 characters (constraint 2), one line (1), printable US-ASCII
(3), ends with a single "." and no surrounding whitespace (5), and contains
"for Node.js and TypeScript: " (6). It does not begin with "DICOM ", because of
the "Developer-focused " lead-in. It fails constraint 4, and constraint 4 only.

The proposed line is that value with the 18 character "Developer-focused "
lead-in removed and nothing else changed: 120 characters, clearing all six. The
capabilities list and the differentiator wording are preserved exactly as the
value on record earned them.

### The "dual ESM/CJS" clause

That clause is a factual claim about the build, so it is checked against this
repository's own package.json, which is the authority for it:

    main:    "./dist/index.cjs"
    module:  "./dist/index.mjs"
    types:   "./dist/index.d.ts"
    exports: "." resolves "import" to ./dist/index.mjs with ./dist/index.d.ts,
             and "require" to ./dist/index.cjs with ./dist/index.d.cts

A "require" condition resolving to a .cjs entry point sits alongside the ESM
one, and "main" points at that same .cjs file, so the build is dual and the
clause is true. It stays in the proposed line.
