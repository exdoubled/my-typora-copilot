import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { session } = vi.hoisted(() => ({
  session: {
    id: "test-session",
    modelId: "test-model",
    title: "Test chat",
    messages: [
      { role: "system", content: "Normal" },
      { role: "assistant", content: "" },
    ],
  },
}));

vi.mock("@/client/chat", () => ({
  COPILOT_MARKDOWN_INSTRUCTIONS: "Normal",
  COPILOT_ACADEMIC_INSTRUCTIONS: "Academic",
  COPILOT_CREATIVE_INSTRUCTIONS: "Creative",
  COPILOT_CATGIRL_INSTRUCTIONS: "CatGirl",
  ChatSession: {
    loadAll: () => Promise.resolve(),
    getAll: () => [session],
    save: () => Promise.resolve(),
  },
  listCopilotChatModels: () => Promise.resolve([]),
}));

import { attachChatPanel, detachChatPanel } from "./ChatPanel";

describe("chat response rendering", () => {
  beforeEach(() => {
    document.body.innerHTML = "<main><content></content></main>";
    localStorage.clear();
  });
  afterEach(async () => {
    await act(() => detachChatPanel?.());
    document.body.innerHTML = "";
  });

  async function showResponse(content: string) {
    session.messages[1]!.content = content;
    await act(async () => {
      attachChatPanel();
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(document.querySelector(".markdown-content")).not.toBeNull());
    return document.querySelector(".markdown-content")!;
  }

  it("removes active HTML and executable or local-file links", async () => {
    const content = await showResponse(
      '<img src="x" onerror="window.injected=true">\n' +
        '<svg onload="window.injected=true"></svg>\n' +
        '<iframe srcdoc="<script>alert(1)</script>"></iframe>\n' +
        '<a href="javascript:alert(1)">run</a>\n' +
        '<a href="file:///etc/passwd">local</a>\n' +
        "<style>body { display: none }</style>",
    );

    expect(content.querySelector("[onerror], [onload], iframe, svg, script, style")).toBeNull();
    expect(content.querySelector("a[href]")).toBeNull();
  });

  it("preserves Markdown, highlighting, copy buttons and safe external links", async () => {
    const content = await showResponse(
      '**Hello** [GitHub](https://github.com)\n\n~~~javascript\nconst x = "<img>";\n~~~',
    );

    expect(content.querySelector("strong")?.textContent).toBe("Hello");
    expect(content.querySelector("a")?.getAttribute("href")).toBe("https://github.com");
    expect(content.querySelector("a")?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(content.querySelector("code")?.textContent).toContain('const x = "<img>";');
    expect(content.querySelector("code .hljs-keyword")).not.toBeNull();
    expect(content.querySelector(".copy-code-button")).not.toBeNull();
  });
});
