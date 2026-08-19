import { redactSentryBreadcrumb } from "../../lib/ai/redact";
import { filterLocalhostEvents } from "../../lib/sentry-localhost-filter";
import * as fs from "fs";
import * as path from "path";

describe("AI key telemetry redaction", () => {
  const sentinel = `sk-or-v1-${"b".repeat(64)}`;

  it("does not allow a planted key or authorization header through Sentry serialization", () => {
    const event = filterLocalhostEvents({
      message: `request failed with ${sentinel}`,
      request: { headers: { Authorization: `Bearer ${sentinel}`, "X-Test": sentinel } },
      extra: { nested: [sentinel] },
    } as never);
    const breadcrumb = redactSentryBreadcrumb({
      category: "test",
      message: sentinel,
      data: { authorization: sentinel },
    });

    expect(event).not.toBeNull();
    expect(JSON.stringify(event)).not.toContain(sentinel);
    expect(JSON.stringify(breadcrumb)).not.toContain(sentinel);
    expect(JSON.stringify(event)).toContain("[REDACTED]");

    const layout = fs.readFileSync(path.resolve(__dirname, "../../app/_layout.tsx"), "utf8");
    expect(layout).toContain("beforeSend: filterLocalhostEvents");
  });
});
