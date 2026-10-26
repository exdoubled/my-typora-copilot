import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

describe("macOS language server bridge", () => {
  let directory: string;
  let child: ReturnType<typeof spawn> | undefined;
  const sockets: WebSocket[] = [];

  afterEach(async () => {
    sockets.forEach((socket) => socket.terminate());
    sockets.length = 0;
    if (child?.exitCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("rejects unauthorized clients and keeps private LSP payloads out of logs", async () => {
    const reservation = net.createServer();
    reservation.listen(0, "127.0.0.1");
    await once(reservation, "listening");
    const port = (reservation.address() as net.AddressInfo).port;
    await new Promise<void>((resolve) => reservation.close(() => resolve()));

    directory = await mkdtemp(path.join(tmpdir(), "typora-copilot-bridge-"));
    const lsp = path.join(directory, "echo.cjs");
    await writeFile(lsp, 'process.stdin.on("data", data => process.stdout.write(data));');
    const token = "a".repeat(64);
    child = spawn(
      process.execPath,
      ["--import", "tsx", "src/mac-server.ts", String(port), lsp, token],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let logs = "";
    child.stdout!.on("data", (data: Buffer) => (logs += data.toString()));
    await new Promise<void>((resolve, reject) => {
      child!.once("exit", (code) => reject(new Error(`Bridge exited: ${code}`)));
      child!.stdout!.on("data", () => {
        if (logs.includes("WebSocket Server listening")) resolve();
      });
    });

    const url = `ws://127.0.0.1:${port}`;
    const unauthorized = new WebSocket(url);
    sockets.push(unauthorized);
    await expect(once(unauthorized, "open")).rejects.toThrow("403");

    const authorized = new WebSocket(url, token);
    sockets.push(authorized);
    await once(authorized, "open");
    const response = once(authorized, "message");
    authorized.send("PRIVATE-DOCUMENT-AND-TOKEN");
    const [data] = await response;
    expect(data.toString()).toBe("PRIVATE-DOCUMENT-AND-TOKEN");
    expect(logs).not.toContain("PRIVATE-DOCUMENT-AND-TOKEN");

    const second = new WebSocket(url, token);
    sockets.push(second);
    await expect(once(second, "open")).rejects.toThrow("403");
  });
});
