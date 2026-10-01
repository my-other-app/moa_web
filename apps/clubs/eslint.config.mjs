import next from "eslint-config-next";

export default [
  ...next(),
  {
    rules: {
      // Feature code must not reach across features; shared things belong in
      // packages/* or src/components. Enforced here so the architecture does
      // not quietly erode one import at a time.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/features/*/*/*"],
              message:
                "Import a feature's public surface (@/features/<name>) rather than reaching into its internals.",
            },
          ],
        },
      ],
    },
  },
];
