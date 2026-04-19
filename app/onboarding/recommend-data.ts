import { STARTER_TEMPLATES, STARTER_PROGRAMS } from "../../lib/starter-templates";

const FULL_BODY = STARTER_TEMPLATES.find((t) => t.id === "starter-tpl-1")!;
const PPL = STARTER_PROGRAMS.find((p) => p.id === "starter-prog-1")!;

export const BEGINNER_REC = {
  name: FULL_BODY.name,
  desc: `This ${FULL_BODY.duration} workout covers all major muscle groups — perfect for building a foundation.`,
  chip: "Recommended",
  action: "template" as const,
  metaItems: [
    { icon: "clock-outline" as const, label: FULL_BODY.duration },
    { icon: "dumbbell" as const, label: `${FULL_BODY.exercises.length} exercises` },
  ],
};

export const INTERMEDIATE_REC = {
  name: PPL.name,
  desc: PPL.description,
  chip: "Program",
  action: "program" as const,
  metaItems: [
    { icon: "calendar-sync" as const, label: `${PPL.days.length}-day cycle` },
  ],
};
