const http = require("http");
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = process.env.CABLESNAP_FDROID === "1"
  ? getDefaultConfig(__dirname)
  : require("@sentry/react-native/metro").getSentryExpoConfig(__dirname);
config.resolver.assetExts.push("wasm");

// F-Droid redirects Sentry to the local stub so the APK does not include
// the native Sentry implementation.
if (process.env.CABLESNAP_FDROID === "1") {
  const sentryStub = path.resolve(__dirname, "lib/fdroid-sentry-stub.tsx");
  const resolveRequest = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName === "@sentry/react-native") {
      return { type: "sourceFile", filePath: sentryStub };
    }
    return resolveRequest
      ? resolveRequest(context, moduleName, platform)
      : context.resolveRequest(context, moduleName, platform);
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
