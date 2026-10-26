import { fork } from "child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer } from "node:http";

import { WebSocketServer } from "ws";

if (!process.argv[2] || !process.argv[3] || !process.argv[4]) {
  console.log("Usage: node mac-server.cjs <port> <lsp-node-module-path> <token>");
  process.exit(1);
}

const port = Number(process.argv[2]);
const token = process.argv[4];
if (!Number.isInteger(port) || port < 1 || port > 65535 || !/^[a-f0-9]{64}$/.test(token)) {
  console.error("Invalid port or authentication token");
  process.exit(1);
}

console.log("Process PID:", process.pid);

const server = fork(process.argv[3], ["--stdio", "true"], {
  silent: true,
}) as ChildProcessWithoutNullStreams;
console.log("Copilot LSP server started. PID:", server.pid);

const startWebSocketServer = () => {
  const httpServer = createServer((_request, response) => {
    response.writeHead(404).end();
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 * 1024 });

  httpServer.on("upgrade", (request, socket, head) => {
    if (request.headers["sec-websocket-protocol"] !== token || wss.clients.size > 0) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
  });

  wss.on("connection", (ws) => {
    console.log(`➕➕ Connection (${wss.clients.size})`);

    ws.once("close", () => {
      console.log("🚨 WebSocket Server shutting down...");
      cleanupServer();
    });

    ws.on("message", (data) => {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const payload = data.toString("utf-8");
      server.stdin.write(payload);
    });

    const onData = (data: Buffer) => {
      const message: string = data.toString("utf-8");
      ws.send(message);
    };
    server.stdout.on("data", onData);
    ws.once("close", () => server.stdout.off("data", onData));
    ws.on("error", cleanupServer);
  });

  httpServer.listen(port, "127.0.0.1", () => {
    console.log(`✅ WebSocket Server listening on ws://127.0.0.1:${port}`);
  });

  const cleanupServer = (() => {
    let called = false;
    return () => {
      if (called) return;
      called = true;
      console.log("🚨 WebSocket Server shutting down...");
      server.kill();
      wss.clients.forEach((ws) => ws.terminate());
      wss.close();
      httpServer.close(() => process.exit(0));
    };
  })();

  httpServer.on("error", (error) => {
    console.error("WebSocket Server failed:", error);
    cleanupServer();
  });
  server.on("error", cleanupServer);
  server.on("exit", cleanupServer);
  process.on("exit", () => server.kill());
  process.on("SIGINT", cleanupServer);
  process.on("SIGTERM", cleanupServer);
  process.on("SIGUSR1", cleanupServer);
  process.on("SIGUSR2", cleanupServer);
  process.on("uncaughtException", cleanupServer);
};

startWebSocketServer();
