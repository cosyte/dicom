import cosyte from "@cosyte/eslint-config";

export default [
  ...cosyte(import.meta.dirname, {
    ignores: ["vendor/**", "src/dictionary/generated/**"],
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
