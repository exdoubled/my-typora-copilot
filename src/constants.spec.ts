import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./typora-utils", () => ({ TYPORA_RESOURCE_DIR: "/usr/share/typora/resources" }));
vi.mock("./utils/tools", () => ({ setGlobalVar: vi.fn() }));

describe("plugin location", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    Files.isWin = false;
  });

  it("locates the language server beside the injected script in a Windows user directory", async () => {
    Files.isWin = true;
    const script = document.createElement("script");
    script.src =
      "file:///C:/Users/Example/AppData/Local/TyporaCopilot/%E4%B8%AD%E6%96%87%20%231%25/index.js";
    vi.spyOn(document, "currentScript", "get").mockReturnValue(script);
    const { PLUGIN_DIR } = await import("./constants");
    expect(PLUGIN_DIR).toBe("C:\\Users\\Example\\AppData\\Local\\TyporaCopilot\\中文 #1%");
  });

  it("keeps the existing location when there is no current script", async () => {
    vi.spyOn(document, "currentScript", "get").mockReturnValue(null);
    const { PLUGIN_DIR } = await import("./constants");
    expect(PLUGIN_DIR).toBe("/usr/share/typora/resources/copilot");
  });
});
