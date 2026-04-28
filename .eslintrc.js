module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaFeatures: { jsx: true },
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: [
    "@typescript-eslint",
    "react",
    "react-hooks",
    "react-native",
  ],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
  ],
  settings: {
    react: { version: "detect" },
  },
  env: {
    "react-native/react-native": true,
  },
  rules: {
    "react/react-in-jsx-scope": "off",
    "react/prop-types": "off",
    "@typescript-eslint/no-require-imports": "off",
    "max-lines": ["warn", { max: 700, skipBlankLines: true, skipComments: true }],
    "max-lines-per-function": ["warn", { max: 400, skipBlankLines: true, skipComments: true }],
    "complexity": ["warn", { max: 15 }],
    "no-restricted-syntax": [
      "warn",
      {
        selector:
          "Property[key.name=/color|backgroundColor|borderColor|tintColor/] > Literal[value=/^#[0-9A-Fa-f]{3,8}$/]",
        message:
          "Use theme.colors.* via useTheme() or import from constants/theme.ts instead of hardcoded hex colors.",
      },
      {
        selector:
          'JSXOpeningElement[name.name="Button"]:has(JSXAttribute[name.name="mode"][value.value="contained"]):not(:has(JSXAttribute[name.name="compact"])):not(:has(JSXAttribute[name.name="contentStyle"]))',
        message:
          'Non-compact contained Button must have contentStyle (e.g. {{ paddingVertical: 8 }}) for consistent sizing.',
      },
      {
        selector:
          'JSXOpeningElement[name.name="Button"]:has(JSXAttribute[name.name="mode"][value.value="outlined"]):not(:has(JSXAttribute[name.name="compact"])):not(:has(JSXAttribute[name.name="contentStyle"]))',
        message:
          'Non-compact outlined Button must have contentStyle (e.g. {{ paddingVertical: 8 }}) for consistent sizing.',
      },
    ],
  },
  overrides: [
    {
      files: [
        "constants/theme.ts",
        "constants/design-tokens.ts",
        "components/muscle-paths.ts",
        "**/*.test.*",
        "**/__tests__/**",
      ],
      rules: {
        "no-restricted-syntax": "off",
      },
    },
    {
      files: [
        "lib/animations/**",
        "components/ui/**",
        "components/SwipeRowAction.tsx",
        "components/SwipeToDelete.tsx",
        "components/exercises/ExerciseImageZoomModal.tsx",
      ],
      rules: {
        "react-hooks/immutability": "off",
        "react-hooks/exhaustive-deps": "warn",
        complexity: "off",
      },
    },
  ],
  ignorePatterns: ["node_modules/", ".expo/", "dist/", "web-build/"],
};
