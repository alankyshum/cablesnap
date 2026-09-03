import { compileMessage } from "@lingui/message-utils/compileMessage";
import enUS from "../locales/en-US.json";
import enGB from "../locales/en-GB.json";
import zhTW from "../locales/zh-TW.json";
import zhCN from "../locales/zh-CN.json";

describe("runtime catalog ICU validity", () => {
  it.each([
    ["en-US", enUS],
    ["en-GB", enGB],
    ["zh-TW", zhTW],
    ["zh-CN", zhCN],
  ])("compiles every %s message", (_locale, catalog) => {
    for (const [id, entry] of Object.entries(catalog)) {
      let compiled: unknown;
      expect(() => {
        compiled = compileMessage(entry.message);
      }).not.toThrow(`Invalid ICU in ${id}`);
      if (/\{[^{}]*,\s*(plural|select|selectordinal)\b/.test(entry.message)) {
        // compileMessage logs and returns [message] rather than throwing for
        // malformed ICU, so explicitly reject that silent fallback.
        expect(compiled).not.toEqual([entry.message]);
      }
    }
  });
});
