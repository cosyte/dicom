import cosyte from "@cosyte/eslint-config";

// The shared CI, release and mutation workflows check their tooling out inside the workspace for
// the length of a job. Those checkouts are another repository's files, never linted here.
const toolingCheckouts = [
  ".cosyte-ci-tooling/**",
  ".cosyte-mutation-tooling/**",
  ".cosyte-release-tooling/**",
];

export default [
  ...cosyte(import.meta.dirname, {
    ignores: ["vendor/**", "src/dictionary/generated/**", ...toolingCheckouts],
  }),

  // dicom's test fixtures and helpers legitimately log to stdout (scripts are already
  // console-exempt in the shared config).
  {
    files: ["test/**/*.ts", "src/**/*.test.ts"],
    rules: {
      "no-console": "off",
    },
  },
];
