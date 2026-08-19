/** @type {import('@lingui/conf').LinguiConfig} */
module.exports = {
  locales: ["en-US", "en-GB", "zh-TW", "zh-CN"],
  sourceLocale: "en-US",
  catalogs: [{ path: "locales/{locale}", include: ["<rootDir>"], exclude: ["<rootDir>/node_modules", "<rootDir>/e2e/__screenshots__"] }],
};
