const http = require("http");
const path = require("path");
const {
  getSentryExpoConfig
} = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);
config.resolver.assetExts.push("wasm");

const isFdroidBuild = process.env.CABLESNAP_FDROID === "1";
if (isFdroidBuild) {
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName === "expo-notifications") {
      return context.resolveRequest(
        context,
        path.join(__dirname, "modules/expo-notifications-foss"),
        platform
      );
    }
    if (moduleName === "expo-application") {
      return context.resolveRequest(
        context,
        path.join(__dirname, "modules/expo-application-foss"),
        platform
      );
    }
    return context.resolveRequest(context, moduleName, platform);
  };
}

// Inject COOP/COEP headers into every HTTP response so expo-sqlite
// can use OPFS (persistent storage) on web.  Metro's enhanceMiddleware
// only wraps the bundler handler; the root HTML page is served by
// Expo's ManifestMiddleware which runs earlier in the connect stack.
// Patching ServerResponse.writeHead is the only reliable way to cover
// ALL responses from the dev server.
const _writeHead = http.ServerResponse.prototype.writeHead;
http.ServerResponse.prototype.writeHead = function (...args) {
  if (!this.headersSent) {
    this.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    this.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    this.setHeader("Cache-Control", "no-store");
  }
  return _writeHead.apply(this, args);
};

module.exports = config;