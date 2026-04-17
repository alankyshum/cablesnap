const { getDefaultConfig } = require("expo/metro-config");
const http = require("http");

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push("wasm");

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
