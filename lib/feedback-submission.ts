export const SCREENSHOT_ATTACHMENT_NOTE =
  "Screenshot captured separately; attach the reviewed PNG manually if you choose to share it.";

export function withScreenshotAttachmentNote(description: string, includeScreenshot: boolean): string {
  if (!includeScreenshot) return description;
  return [description.trim(), SCREENSHOT_ATTACHMENT_NOTE].filter(Boolean).join("\n\n");
}
