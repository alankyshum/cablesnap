import * as FossApplication from "../../modules/expo-application-foss/src";

describe("expo-application-foss contract test", () => {
  it("exports every required API surface", () => {
    expect(FossApplication.nativeApplicationVersion).toBeDefined();
    expect(FossApplication.nativeBuildVersion).toBeDefined();
    expect(FossApplication.applicationName).toBeDefined();
    expect(FossApplication.applicationId).toBeDefined();

    expect(typeof FossApplication.getAndroidId).toBe("function");
    expect(typeof FossApplication.getInstallReferrerAsync).toBe("function");
    expect(typeof FossApplication.getIosIdForVendorAsync).toBe("function");
    expect(typeof FossApplication.getIosApplicationReleaseTypeAsync).toBe("function");
    expect(typeof FossApplication.getIosPushNotificationServiceEnvironmentAsync).toBe("function");
    expect(typeof FossApplication.getInstallationTimeAsync).toBe("function");
    expect(typeof FossApplication.getLastUpdateTimeAsync).toBe("function");
  });

  it("exports matching release types", () => {
    expect(FossApplication.ApplicationReleaseType.SIMULATOR).toBe(1);
    expect(FossApplication.ApplicationReleaseType.APP_STORE).toBe(5);
  });
});
