jest.mock("expo-constants", () => ({
  executionEnvironment: "standalone",
}));

jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Warning: "warning" },
}));

jest.mock("expo-notifications", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handler: any = null;
  return {
    getPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
    requestPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
    cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
    cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
    dismissNotificationAsync: jest.fn().mockResolvedValue(undefined),
    scheduleNotificationAsync: jest.fn().mockResolvedValue("notif-id"),
    setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
    AndroidImportance: { LOW: 2 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setNotificationHandler: jest.fn((h: any) => { handler = h; }),
    addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
    SchedulableTriggerInputTypes: { WEEKLY: "weekly", TIME_INTERVAL: "timeInterval" },
    _getHandler: () => handler,
  };
});

jest.mock("../../lib/db", () => ({
  getSchedule: jest.fn().mockResolvedValue([]),
  getAppSetting: jest.fn().mockResolvedValue(null),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
  getTemplateById: jest.fn().mockResolvedValue(null),
}));

// eslint-disable-next-line max-lines-per-function
describe("notifications", () => {
  let notifications: typeof import("../../lib/notifications");
  let Notifications: typeof import("expo-notifications");
  let db: { getSchedule: jest.Mock; getTemplateById: jest.Mock };

  beforeEach(() => {
    jest.resetModules();
    jest.doMock("expo-constants", () => ({
      executionEnvironment: "standalone",
    }));
    jest.doMock("expo-haptics", () => ({
      selectionAsync: jest.fn().mockResolvedValue(undefined),
      notificationAsync: jest.fn().mockResolvedValue(undefined),
      NotificationFeedbackType: { Warning: "warning" },
    }));
    jest.doMock("expo-notifications", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let handler: any = null;
      return {
        getPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
        requestPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
        cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
        cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
        dismissNotificationAsync: jest.fn().mockResolvedValue(undefined),
        scheduleNotificationAsync: jest.fn().mockResolvedValue("notif-id"),
        setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
        AndroidImportance: { LOW: 2 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setNotificationHandler: jest.fn((h: any) => { handler = h; }),
        addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
        SchedulableTriggerInputTypes: { WEEKLY: "weekly", TIME_INTERVAL: "timeInterval" },
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

  describe("scheduleRestComplete", () => {
    it("schedules a time-interval notification with identifier", async () => {
      const id = await notifications.scheduleRestComplete(60, "session-1");
      expect(id).toBe("notif-id");
      const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
      expect(call.identifier).toBe("rest-complete-session-1");
      expect(call.content.title).toBe("Rest complete");
      expect(call.content.body).toBe("Time for your next set.");
      expect(call.trigger.seconds).toBe(60);
    });

    it("uses preview body when preview provided (no isLastSet)", async () => {
      const preview: import("../../lib/notifications").NextSetPreview = {
        exerciseName: "Cable Row", exerciseKind: "weighted",
        plannedWeight: 60, weightUnit: "lb", repRange: "8-10",
        durationSeconds: null, distanceMeters: null,
      };
      await notifications.scheduleRestComplete(60, "s1", preview, false);
      const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
      expect(call.content.body).toBe("Cable Row — 60 lb × 8-10");
    });

    it("uses 'Last set complete' when isLastSet=true", async () => {
      await notifications.scheduleRestComplete(60, "s1", null, true);
      const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
      expect(call.content.body).toBe("Last set complete");
    });

    it("returns null when schedule throws", async () => {
      (Notifications.scheduleNotificationAsync as jest.Mock).mockRejectedValueOnce(new Error("fail"));
      const id = await notifications.scheduleRestComplete(60, "s1");
      expect(id).toBeNull();
    });
  });

  describe("cancelRestComplete", () => {
    it("cancels a specific scheduled notification", async () => {
      await notifications.cancelRestComplete("notif-123");
      expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("notif-123");
    });

    it("does not throw when cancel fails", async () => {
      (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockRejectedValueOnce(new Error("gone"));
      await expect(notifications.cancelRestComplete("notif-123")).resolves.toBeUndefined();
    });
  });

  describe("handleResponse — rest_complete", () => {
    const navigate = jest.fn();
    const showSnackbar = jest.fn();

    beforeEach(() => {
      navigate.mockClear();
      showSnackbar.mockClear();
    });

    it("navigates to session on rest_complete notification tap", async () => {
      const response = {
        notification: { request: { content: { data: { type: "rest_complete", sessionId: "sess-42" } } } },
      };
      await notifications.handleResponse(response, navigate, showSnackbar);
      expect(navigate).toHaveBeenCalledWith("/session/sess-42");
      expect(showSnackbar).not.toHaveBeenCalled();
    });
  });

  // BLD-1137: Smart Rest Coach notification helpers
  describe("formatPreviewBody", () => {
    it("returns null for null input", () => {
      expect(notifications.formatPreviewBody(null)).toBeNull();
    });

    it("formats weighted exercise with weight and reps", () => {
      const result = notifications.formatPreviewBody({
        exerciseName: "Cable Row",
        exerciseKind: "weighted",
        plannedWeight: 60,
        weightUnit: "lb",
        repRange: "8-10",
        durationSeconds: null,
        distanceMeters: null,
      });
      expect(result).toBe("Cable Row — 60 lb × 8-10");
    });

    it("formats weighted exercise with null weight as bodyweight", () => {
      const result = notifications.formatPreviewBody({
        exerciseName: "Pull-Up",
        exerciseKind: "weighted",
        plannedWeight: null,
        weightUnit: "lb",
        repRange: "5-8",
        durationSeconds: null,
        distanceMeters: null,
      });
      expect(result).toBe("Pull-Up — bodyweight × 5-8");
    });

    it("formats bodyweight exercise", () => {
      const result = notifications.formatPreviewBody({
        exerciseName: "Push-Up",
        exerciseKind: "bodyweight",
        plannedWeight: null,
        weightUnit: "kg",
        repRange: "12",
        durationSeconds: null,
        distanceMeters: null,
      });
      expect(result).toBe("Push-Up — bodyweight × 12");
    });

    it("formats time_based exercise", () => {
      const result = notifications.formatPreviewBody({
        exerciseName: "Plank",
        exerciseKind: "time_based",
        plannedWeight: null,
        weightUnit: "kg",
        repRange: null,
        durationSeconds: 75,
        distanceMeters: null,
      });
      expect(result).toBe("Plank — 1:15");
    });

    it("formats distance exercise in meters", () => {
      const result = notifications.formatPreviewBody({
        exerciseName: "Sled Push",
        exerciseKind: "distance",
        plannedWeight: null,
        weightUnit: "kg",
        repRange: null,
        durationSeconds: null,
        distanceMeters: 20,
      });
      expect(result).toBe("Sled Push — 20 m");
    });

    it("formats distance exercise in km when >= 1000m", () => {
      const result = notifications.formatPreviewBody({
        exerciseName: "Run",
        exerciseKind: "distance",
        plannedWeight: null,
        weightUnit: "kg",
        repRange: null,
        durationSeconds: null,
        distanceMeters: 5000,
      });
      expect(result).toBe("Run — 5.0 km");
    });

    it("returns null for weighted with null reps (insufficient data)", () => {
      expect(notifications.formatPreviewBody({
        exerciseName: "Cable Row",
        exerciseKind: "weighted",
        plannedWeight: 60,
        weightUnit: "lb",
        repRange: null,
        durationSeconds: null,
        distanceMeters: null,
      })).toBeNull();
    });

    it("returns null for time_based with null duration", () => {
      expect(notifications.formatPreviewBody({
        exerciseName: "Plank",
        exerciseKind: "time_based",
        plannedWeight: null,
        weightUnit: "kg",
        repRange: null,
        durationSeconds: null,
        distanceMeters: null,
      })).toBeNull();
    });

    it("uses kg unit correctly", () => {
      const result = notifications.formatPreviewBody({
        exerciseName: "Cable Row",
        exerciseKind: "weighted",
        plannedWeight: 40,
        weightUnit: "kg",
        repRange: "8",
        durationSeconds: null,
        distanceMeters: null,
      });
      expect(result).toBe("Cable Row — 40 kg × 8");
    });
  });

  describe("schedulePreEndCue (BLD-1137)", () => {
    it("schedules with correct identifier and body when no preview", async () => {
      const id = await notifications.schedulePreEndCue(50, null, false, 10, "sess-1");
      expect(id).toBeTruthy();
      const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
      expect(call.identifier).toBe("rest-preend-sess-1");
      expect(call.content.title).toBe("Rest ending in 10s");
      expect(call.content.body).toBe("Next set in 10s");
      expect(call.trigger.seconds).toBe(50);
    });

    it("uses 'Workout ending' body when isLastSet", async () => {
      await notifications.schedulePreEndCue(50, null, true, 10, "sess-1");
      const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
      expect(call.content.body).toBe("Workout ending in 10s");
    });

    it("includes preview in body when preview provided", async () => {
      const preview = {
        exerciseName: "Cable Row",
        exerciseKind: "weighted" as const,
        plannedWeight: 60,
        weightUnit: "lb" as const,
        repRange: "8-10",
        durationSeconds: null,
        distanceMeters: null,
      };
      await notifications.schedulePreEndCue(50, preview, false, 10, "sess-1");
      const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
      expect(call.content.body).toBe("Next: Cable Row — 60 lb × 8-10");
    });

    it("returns null when secondsUntilCue <= 0", async () => {
      const result = await notifications.schedulePreEndCue(0, null, false, 10, "sess-1");
      expect(result).toBeNull();
      expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    });
  });

  describe("cancelAllRestNotifications (BLD-1137)", () => {
    it("cancels all three notification IDs", async () => {
      await notifications.cancelAllRestNotifications("sess-1");
      expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("rest-preend-sess-1");
      expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("rest-complete-sess-1");
      expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("rest-live-sess-1");
    });
  });

  describe("setupHandler — BLD-1137 dispatcher", () => {
    it("suppresses banner for rest_preend notifications in foreground", async () => {
      notifications.setupHandler();
      type HandlerFn = (notification: { request: { content: { data: { type: string } } } }) => Promise<{ shouldShowAlert: boolean; shouldPlaySound: boolean; shouldSetBadge: boolean }>;
      const handler = (Notifications as typeof Notifications & { _getHandler: () => { handleNotification: HandlerFn } })._getHandler();
      const result = await handler.handleNotification({
        request: { content: { data: { type: "rest_preend" } } },
      });
      expect(result.shouldShowAlert).toBe(false);
      expect(result.shouldPlaySound).toBe(false);
    });

    it("shows alert for non-rest_preend notifications", async () => {
      notifications.setupHandler();
      type HandlerFn = (notification: { request: { content: { data: { type: string } } } }) => Promise<{ shouldShowAlert: boolean; shouldPlaySound: boolean; shouldSetBadge: boolean }>;
      const handler = (Notifications as typeof Notifications & { _getHandler: () => { handleNotification: HandlerFn } })._getHandler();
      const result = await handler.handleNotification({
        request: { content: { data: { type: "rest_complete" } } },
      });
      expect(result.shouldShowAlert).toBe(true);
    });
  });
});
