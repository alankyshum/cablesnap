import { eq } from "drizzle-orm";
import { getDrizzle } from "./helpers";
import { shareSettings } from "./schema";

export const DEFAULT_PROMO_CAPTION = "Tracked with CableSnap · https://github.com/alankyshum/cablesnap";

export type ShareSettingsRow = {
  id: number;
  promo_caption: string;
  promo_caption_enabled: number;
  strava_description_enabled: number;
  updated_at: number;
};

const DEFAULT_ROW: ShareSettingsRow = {
  id: 1,
  promo_caption: "",
  promo_caption_enabled: 0,
  strava_description_enabled: 1,
  updated_at: Date.now(),
};

export async function getShareSettings(): Promise<ShareSettingsRow> {
  const db = await getDrizzle();
  const row = await db.select()
    .from(shareSettings)
    .where(eq(shareSettings.id, 1))
    .get();
  if (!row) {
    await db.insert(shareSettings).values(DEFAULT_ROW).onConflictDoNothing();
    const created = await db.select()
      .from(shareSettings)
      .where(eq(shareSettings.id, 1))
      .get();
    return (created as unknown as ShareSettingsRow) ?? DEFAULT_ROW;
  }
  return row as unknown as ShareSettingsRow;
}

export async function saveShareSettings(
  partial: Partial<Omit<ShareSettingsRow, "id">>
): Promise<void> {
  if (
    typeof partial.promo_caption === "string" &&
    partial.promo_caption.length > 200
  ) {
    throw new Error("Promo caption exceeds 200 characters");
  }
  const db = await getDrizzle();
  const payload = {
    ...partial,
    updated_at: Date.now(),
  };
  await db.insert(shareSettings)
    .values({ ...DEFAULT_ROW, ...payload })
    .onConflictDoUpdate({
      target: shareSettings.id,
      set: payload,
    });
}

export async function getEffectivePromoCaption(): Promise<string> {
  const settings = await getShareSettings();
  if (!settings.promo_caption_enabled) return "";
  const caption = settings.promo_caption.trim();
  return caption.length > 0 ? caption : DEFAULT_PROMO_CAPTION;
}
