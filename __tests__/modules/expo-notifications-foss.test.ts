import * as FossNotifications from "../../modules/expo-notifications-foss/src";

describe("expo-notifications-foss contract test", () => {
  it("exports every required API surface", () => {
    expect(FossNotifications.AndroidImportance).toBeDefined();
    expect(FossNotifications.AndroidNotificationPriority).toBeDefined();
    expect(FossNotifications.SchedulableTriggerInputTypes).toBeDefined();

    expect(typeof FossNotifications.getPermissionsAsync).toBe("function");
    expect(typeof FossNotifications.requestPermissionsAsync).toBe("function");
    expect(typeof FossNotifications.scheduleNotificationAsync).toBe("function");
    expect(typeof FossNotifications.dismissNotificationAsync).toBe("function");
    expect(typeof FossNotifications.cancelScheduledNotificationAsync).toBe("function");
    expect(typeof FossNotifications.cancelAllScheduledNotificationsAsync).toBe("function");
    expect(typeof FossNotifications.setNotificationChannelAsync).toBe("function");
    expect(typeof FossNotifications.deleteNotificationChannelAsync).toBe("function");
    expect(typeof FossNotifications.setNotificationHandler).toBe("function");
    expect(typeof FossNotifications.addNotificationResponseReceivedListener).toBe("function");
    expect(typeof FossNotifications.addNotificationReceivedListener).toBe("function");
    expect(typeof FossNotifications.default).toBe("function"); // Config Plugin
  });

  it("retains matching enum values", () => {
    expect(FossNotifications.AndroidNotificationPriority.MAX).toBe("max");
    expect(FossNotifications.SchedulableTriggerInputTypes.TIME_INTERVAL).toBe("timeInterval");
    expect(FossNotifications.SchedulableTriggerInputTypes.WEEKLY).toBe("weekly");
  });
});
