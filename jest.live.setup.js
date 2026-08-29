/* eslint-env node */
// Expo's Jest bootstrap provides React Native transforms, but also installs an
// Expo web-stream implementation. Node fetch returns Node web streams; restore
// Node's constructors before the AI SDK parses the live SSE response.
const streams = require('node:stream/web');
Object.assign(global, {
  ReadableStream: streams.ReadableStream,
  WritableStream: streams.WritableStream,
  TransformStream: streams.TransformStream,
});
