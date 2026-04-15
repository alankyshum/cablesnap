jest.mock("expo-constants", () => ({
  executionEnvironment: "standalone",
}));

jest.mock("expo-notifications", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handler: any = null;
  return {
    getPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
    requestPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
    cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
    scheduleNotificationAsync: jest.fn().mockResolvedValue("notif-id"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setNotificationHandler: jest.fn((h: any) => { handler = h; }),
    addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
    SchedulableTriggerInputTypes: { WEEKLY: "weekly" },
    _getHandler: () => handler,
  };
});

jest.mock("../../lib/db", () => ({
  getSchedule: jest.fn().mockResolvedValue([]),
  getAppSetting: jest.fn().mockResolvedValue(null),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
  getTemplateById: jest.fn().mockResolvedValue(null),
}));

describe("notifications", () => {
  let notifications: typeof import("../../lib/notifications");
  let Notifications: typeof import("expo-notifications");
  let db: { getSchedule: jest.Mock; getTemplateById: jest.Mock };

  beforeEach(() => {
    jest.resetModules();
    jest.doMock("expo-constants", () => ({
      executionEnvironment: "standalone",
    }));
    jest.doMock("expo-notifications", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let handler: any = null;
      return {
        getPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
        requestPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
        cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
        scheduleNotificationAsync: jest.fn().mockResolvedValue("notif-id"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setNotificationHandler: jest.fn((h: any) => { handler = h; }),
        addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
        SchedulableTriggerInputTypes: { WEEKLY: "weekly" },
        _getHandler: () => handler,
      };
    });
    jest.doMock("../../lib/db", () => ({
      getSchedule: jest.fn().mockResolvedValue([]),
      getAppSetting: jest.fn().mockResolvedValue(null),
      setAppSetting: jest.fn().mockResolvedValue(undefined),
      getTemplateById: jest.fn().mockResolvedValue(null),
    }));
    notifications = require("../../lib/notifications");
    Notifications = require("expo-notifications");
    db = require("../../lib/db");
  });

  describe("requestPermission", () => {
    it("returns true when already granted", async () => {
      const result = await notifications.requestPermission();
      expect(result).toBe(true);
      expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    });

    it("requests permission when not granted", async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: "undetermined" });
      (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: "granted" });
      const result = await notifications.requestPermission();
      expect(result).toBe(true);
      expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
    });

    it("returns false when denied", async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: "undetermined" });
      (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: "denied" });
      const result = await notifications.requestPermission();
      expect(result).toBe(false);
    });
  });

  describe("getPermissionStatus", () => {
    it("returns current status", async () => {
      const status = await notifications.getPermissionStatus();
      expect(status).toBe("granted");
    });
  });

  describe("scheduleReminders", () => {
    it("returns 0 when no schedule entries", async () => {
      db.getSchedule.mockResolvedValueOnce([]);
      const count = await notifications.scheduleReminders({ hour: 8, minute: 0 });
      expect(count).toBe(0);
      expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
      expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    });

    it("schedules one notification per scheduled day", async () => {
      db.getSchedule.mockResolvedValueOnce([
        { id: "1", day_of_week: 0, template_id: "t1", template_name: "Push Day", exercise_count: 5, created_at: 0 },
        { id: "2", day_of_week: 2, template_id: "t2", template_name: "Pull Day", exercise_count: 4, created_at: 0 },
        { id: "3", day_of_week: 4, template_id: "t3", template_name: "Leg Day", exercise_count: 6, created_at: 0 },
      ]);
      const count = await notifications.scheduleReminders({ hour: 9, minute: 30 });
      expect(count).toBe(3);
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(3);
      // Mon (day_of_week=0) → weekday = ((0+1)%7)+1 = 2 (Monday)
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
        content: { title: "Time to train!", body: "Push Day is scheduled for today", data: { templateId: "t1" } },
        trigger: { type: "weekly", weekday: 2, hour: 9, minute: 30 },
      });
      // Wed (day_of_week=2) → weekday = ((2+1)%7)+1 = 4 (Wednesday)
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
        content: { title: "Time to train!", body: "Pull Day is scheduled for today", data: { templateId: "t2" } },
        trigger: { type: "weekly", weekday: 4, hour: 9, minute: 30 },
      });
    });

    it("cancels all before scheduling", async () => {
      db.getSchedule.mockResolvedValueOnce([
        { id: "1", day_of_week: 0, template_id: "t1", template_name: "Push", exercise_count: 3, created_at: 0 },
      ]);
      await notifications.scheduleReminders({ hour: 7, minute: 0 });
      const cancelOrder = (Notifications.cancelAllScheduledNotificationsAsync as jest.Mock).mock.invocationCallOrder[0];
      const schedOrder = (Notifications.scheduleNotificationAsync as jest.Mock).mock.invocationCallOrder[0];
      expect(cancelOrder).toBeLessThan(schedOrder);
    });

    it("maps all 7 days correctly", async () => {
      // day_of_week: 0=Mon..6=Sun → expo weekday: 2=Mon..1=Sun
      const mapping = [
        { day: 0, expected: 2 }, // Mon
        { day: 1, expected: 3 }, // Tue
        { day: 2, expected: 4 }, // Wed
        { day: 3, expected: 5 }, // Thu
        { day: 4, expected: 6 }, // Fri
        { day: 5, expected: 7 }, // Sat
        { day: 6, expected: 1 }, // Sun
      ];
      db.getSchedule.mockResolvedValueOnce(
        mapping.map((m) => ({
          id: `${m.day}`,
          day_of_week: m.day,
          template_id: `t${m.day}`,
          template_name: `Day ${m.day}`,
          exercise_count: 1,
          created_at: 0,
        }))
      );
      await notifications.scheduleReminders({ hour: 8, minute: 0 });
      const calls = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls;
      expect(calls).toHaveLength(7);
      for (let i = 0; i < 7; i++) {
        expect(calls[i][0].trigger.weekday).toBe(mapping[i].expected);
      }
    });
  });

  describe("cancelAll", () => {
    it("calls cancelAllScheduledNotificationsAsync", async () => {
      await notifications.cancelAll();
      expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
    });
  });

  describe("handleResponse", () => {
    const navigate = jest.fn();
    const showSnackbar = jest.fn();

    beforeEach(() => {
      navigate.mockClear();
      showSnackbar.mockClear();
    });

    it("navigates to workout when template exists", async () => {
      db.getTemplateById.mockResolvedValueOnce({ id: "t1", name: "Push Day" });
      const response = {
        notification: { request: { content: { data: { templateId: "t1" } } } },
      };
      await notifications.handleResponse(response, navigate, showSnackbar);
      expect(navigate).toHaveBeenCalledWith("/workout/new", { templateId: "t1" });
    });

    it("navigates home with snackbar when template deleted", async () => {
      db.getTemplateById.mockResolvedValueOnce(null);
      const response = {
        notification: { request: { content: { data: { templateId: "deleted" } } } },
      };
      await notifications.handleResponse(response, navigate, showSnackbar);
      expect(navigate).toHaveBeenCalledWith("/");
      expect(showSnackbar).toHaveBeenCalledWith("Scheduled template no longer exists");
    });

    it("navigates home when no templateId in data", async () => {
      const response = {
        notification: { request: { content: { data: {} } } },
      };
      await notifications.handleResponse(response, navigate, showSnackbar);
      expect(navigate).toHaveBeenCalledWith("/");
    });
  });

  describe("setupHandler", () => {
    it("configures the notification handler", () => {
      notifications.setupHandler();
      expect(Notifications.setNotificationHandler).toHaveBeenCalled();
    });

    it("handler returns correct config", async () => {
      notifications.setupHandler();
      const call = (Notifications.setNotificationHandler as jest.Mock).mock.calls[0][0];
      const config = await call.handleNotification();
      expect(config).toEqual({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      });
    });
  });
});
