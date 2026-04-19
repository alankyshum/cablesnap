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
  { name: "nutrition/targets", options: { headerShown: true, title: "Macro Targets", presentation: "modal", animation: "slide_from_bottom" } },
  { name: "nutrition/profile", options: { headerShown: true, title: "Nutrition Profile", presentation: "modal", animation: "slide_from_bottom" } },
  { name: "errors", options: { headerShown: true, title: "Error Log" } },
  { name: "feedback", options: { headerShown: true, title: "Feedback & Reports" } },
  { name: "body", options: { headerShown: false } },
  { name: "progress", options: { headerShown: false } },
  { name: "history", options: { headerShown: true, title: "Workout History" } },
  { name: "session/summary/[id]", options: { headerShown: true, title: "Summary" } },
  { name: "settings/import-strong", options: { headerShown: true, title: "Import from Strong" } },
  { name: "settings/import-backup", options: { headerShown: true, title: "Import Backup" } },
  { name: "tools/index", options: { headerShown: true, title: "Workout Tools" } },
  { name: "tools/plates", options: { headerShown: true, title: "Plate Calculator" } },
  { name: "tools/rm", options: { headerShown: true, title: "1RM Calculator" } },
  { name: "tools/timer", options: { headerShown: true, title: "Interval Timer" } },
];
