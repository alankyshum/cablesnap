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
    "no-restricted-syntax": [
      "warn",
      {
        selector:
          "Property[key.name=/color|backgroundColor|borderColor|tintColor/] > Literal[value=/^#[0-9A-Fa-f]{3,8}$/]",
        message:
          "Use theme.colors.* via useTheme() or import from constants/theme.ts instead of hardcoded hex colors.",
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
      ],
      rules: {
        "react-hooks/immutability": "off",
        "react-hooks/exhaustive-deps": "warn",
      },
    },
  ],
  ignorePatterns: ["node_modules/", ".expo/", "dist/", "web-build/"],
};
