const React = require("react");

module.exports = {
  KeyboardProvider: ({ children }) => children,
  KeyboardAvoidingView: ({ children, ...props }) => React.createElement(require("react-native").View, props, children),
  OverKeyboardView: ({ children }) => children,
  KeyboardContext: React.createContext({}),
  KeyboardController: { addListener: () => ({ remove: () => {} }) },
  KeyboardEvents: {},
};
