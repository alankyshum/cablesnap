import { insertInteraction, getInteractions } from "./db";
import type { Interaction, InteractionAction } from "./types";

export async function log(
  action: InteractionAction,
  screen: string,
  detail?: string
): Promise<void> {
  try {
    await insertInteraction(action, screen, detail ?? null);
  } catch {
    // Never crash the app for interaction logging
  }
}

export async function recent(): Promise<Interaction[]> {
  try {
    const rows = await getInteractions();
    return rows as Interaction[];
  } catch {
    return [];
  }
}
