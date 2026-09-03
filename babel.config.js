module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // Keep source defaults in release bundles. Lingui otherwise strips the
    // `message` field in production, exposing dotted IDs when a catalog entry
    // is missing or stale.
    plugins: [
      ["@lingui/babel-plugin-lingui-macro", { descriptorFields: "message" }],
      "react-native-reanimated/plugin",
    ],
  };
};
