import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const shell = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "/bin/bash";

vi.mock("@/utils/cli-tools", () => ({
  getEnv: () => Promise.resolve(process.env),
  runCommand: (command: string) =>
    new Promise<string>((resolve, reject) => {
      execFile(shell, ["--noprofile", "--norc", "-c", command], (error, stdout) => {
        if (error) reject(new Error(error.message));
        else resolve(stdout);
      });
    }),
}));

describe.skipIf(!existsSync(shell))("macOS file operations", () => {
  const platform = { isMac: Files.isMac, isNode: Files.isNode, isWin: Files.isWin };
  let fs: typeof import("./fs");
  let directory: string;

  beforeAll(async () => {
    Object.assign(Files, { isMac: true, isNode: false, isWin: false });
    fs = await import("./fs");
  });
  afterAll(() => Object.assign(Files, platform));
  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), "typora-copilot-test-")).replace(/\\/g, "/");
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it("writes heredoc delimiters and shell syntax as literal content", async () => {
    const destination = `${directory}/chat.json`;
    const marker = `${directory}/injected`;
    const content = `Chat\nTYPORA_EOF\nprintf injected > '${marker}'\nTYPORA_EOF\n你好 '$HOME' $(id)`;

    await fs.writeFile(destination, content).catch(() => {});

    expect(existsSync(marker)).toBe(false);
    expect(readFileSync(destination, "utf8")).toBe(content);
  });

  it("treats metacharacters in paths literally across file operations", async () => {
    const folder = `${directory}/folder'$(printf injected)`;
    const destination = `${folder}/chat.json`;

    await fs.mkdir(folder, { recursive: true });
    expect(existsSync(folder)).toBe(true);
    await fs.writeFile(destination, "saved chat");
    expect(await fs.access(folder)).toBe(folder);
    expect(await fs.accessDir(folder)).toBe(folder);
    expect(await fs.accessFile(destination)).toBe(destination);
    expect(await fs.readDir(folder, "filesOnly")).toContain("chat.json");
    await fs.rmFile(destination);
    expect(existsSync(destination)).toBe(false);
  });
});
