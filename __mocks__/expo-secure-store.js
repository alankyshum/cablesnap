// Mock for expo-secure-store - avoids loading Expo native module system in Jest
const store = {};

module.exports = {
  getItemAsync: jest.fn(async (key) => store[key] ?? null),
  setItemAsync: jest.fn(async (key, value) => { store[key] = value; }),
  deleteItemAsync: jest.fn(async (key) => { delete store[key]; }),
  isAvailableAsync: jest.fn(async () => true),
  WHEN_UNLOCKED: "WHEN_UNLOCKED",
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "WHEN_UNLOCKED_THIS_DEVICE_ONLY",
  AFTER_FIRST_UNLOCK: "AFTER_FIRST_UNLOCK",
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY",
  ALWAYS: "ALWAYS",
  ALWAYS_THIS_DEVICE_ONLY: "ALWAYS_THIS_DEVICE_ONLY",
};
