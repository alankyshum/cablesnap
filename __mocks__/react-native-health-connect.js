module.exports = {
  initialize: jest.fn().mockResolvedValue(undefined),
  getSdkStatus: jest.fn().mockResolvedValue(1),
  requestPermission: jest.fn().mockResolvedValue([{ recordType: "ExerciseSession", accessType: "write" }]),
  getGrantedPermissions: jest.fn().mockResolvedValue([{ recordType: "ExerciseSession", accessType: "write" }]),
  insertRecords: jest.fn().mockResolvedValue(["mock-record-id-1"]),
  SdkAvailabilityStatus: {
    SDK_AVAILABLE: 1,
    SDK_UNAVAILABLE: 2,
    SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED: 3,
  },
};
