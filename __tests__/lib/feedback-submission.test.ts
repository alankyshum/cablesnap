import {
  SCREENSHOT_ATTACHMENT_NOTE,
  withScreenshotAttachmentNote,
} from "../../lib/feedback-submission";

describe("screenshot submission conventions", () => {
  it("does not mention an unconsented screenshot", () => {
    expect(withScreenshotAttachmentNote("Steps", false)).toBe("Steps");
  });

  it("truthfully records that a consented screenshot must be attached manually", () => {
    const description = withScreenshotAttachmentNote("Steps", true);
    expect(description).toContain("Steps");
    expect(description).toContain(SCREENSHOT_ATTACHMENT_NOTE);
    expect(description).toContain("manually");
  });
});
