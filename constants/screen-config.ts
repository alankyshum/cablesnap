export type ScreenConfig = {
  name: string;
  options: {
    headerShown: boolean;
    title?: string;
    presentation?: "modal";
    animation?: "slide_from_bottom";
  };
};

export const SCREEN_CONFIGS: ScreenConfig[] = [
  { name: "(tabs)", options: { headerShown: false } },
  { name: "onboarding", options: { headerShown: false } },
  { name: "exercise/[id]", options: { headerShown: true } },
  { name: "exercise/create", options: { headerShown: true, title: "New Exercise" } },
  { name: "exercise/edit/[id]", options: { headerShown: true, title: "Edit Exercise" } },
  { name: "template/create", options: { headerShown: true, title: "New Template" } },
  { name: "template/[id]", options: { headerShown: true, title: "Edit Template" } },
  { name: "program/[id]", options: { headerShown: true, title: "Program" } },
  { name: "program/create", options: { headerShown: true, title: "New Program" } },
  { name: "program/pick-template", options: { headerShown: true, title: "Pick Template", presentation: "modal", animation: "slide_from_bottom" } },
  { name: "session/[id]", options: { headerShown: true, title: "Workout" } },
  { name: "session/detail/[id]", options: { headerShown: true, title: "Workout Summary" } },
  { name: "errors", options: { headerShown: true, title: "Error Log" } },
  { name: "feedback", options: { headerShown: true, title: "Feedback & Reports" } },
  { name: "strava-callback", options: { headerShown: false } },
  { name: "body", options: { headerShown: false } },
  { name: "progress", options: { headerShown: false } },
  { name: "history", options: { headerShown: true, title: "Workout History" } },
  { name: "session/summary/[id]", options: { headerShown: true, title: "Summary" } },
  { name: "day-session/[id]", options: { headerShown: true } },
  // Route groups own their headers via a nested app/<group>/_layout.tsx (the
  // native header handles the top safe-area inset). New screens dropped into
  // these folders inherit the header automatically — no per-route registration.
  { name: "settings", options: { headerShown: false } },
  { name: "tools", options: { headerShown: false } },
  { name: "nutrition", options: { headerShown: false } },
];
