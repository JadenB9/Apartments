import { describe, expect, test } from "bun:test";
import { safeUrl } from "./sanitize";

describe("safeUrl", () => {
  test("passes http and https URLs through", () => {
    expect(safeUrl("https://example.com/menu")).toBe("https://example.com/menu");
    expect(safeUrl("http://example.com")).toBe("http://example.com/");
  });

  test("upgrades scheme-less values (common in OSM)", () => {
    expect(safeUrl("example.com/menu")).toBe("https://example.com/menu");
    expect(safeUrl("www.tandoorinights.com")).toBe("https://www.tandoorinights.com/");
  });

  test("rejects dangerous schemes", () => {
    expect(safeUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeUrl("JAVASCRIPT:alert(1)")).toBeUndefined();
    expect(safeUrl("data:text/html,<script>alert(1)</script>")).toBeUndefined();
    expect(safeUrl("vbscript:msgbox(1)")).toBeUndefined();
    expect(safeUrl("file:///etc/passwd")).toBeUndefined();
  });

  test("rejects sneaky wrappers", () => {
    expect(safeUrl("  javascript:alert(1)  ")).toBeUndefined();
    expect(safeUrl("jAvAsCrIpT:alert(1)")).toBeUndefined();
  });

  test("rejects empty/garbage", () => {
    expect(safeUrl(undefined)).toBeUndefined();
    expect(safeUrl(null)).toBeUndefined();
    expect(safeUrl("")).toBeUndefined();
    expect(safeUrl("   ")).toBeUndefined();
    expect(safeUrl("ht tp://bad")).toBeUndefined();
  });
});
