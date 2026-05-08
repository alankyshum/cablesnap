// Global mock for expo-video — native video modules are unavailable under Jest.
// Prevents "Cannot read properties of undefined (reading 'prototype')" on import.
const React = require('react');

const mockPlayer = {
  play: jest.fn(),
  pause: jest.fn(),
  seekBy: jest.fn(),
  seekTo: jest.fn(),
  replay: jest.fn(),
  release: jest.fn(),
  addListener: jest.fn(),
  removeAllListeners: jest.fn(),
  loop: false,
  muted: false,
  playbackRate: 1,
  status: 'idle',
  currentTime: 0,
  duration: 0,
};

const VideoView = React.forwardRef((props, ref) =>
  React.createElement('View', { ...props, ref, testID: props.testID || 'video-view' }, props.children)
);
VideoView.displayName = 'VideoView';

module.exports = {
  __esModule: true,
  VideoView,
  useVideoPlayer: jest.fn(() => mockPlayer),
  VideoPlayer: jest.fn(),
};
