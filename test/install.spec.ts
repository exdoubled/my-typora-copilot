import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "/bin/bash";

describe("bootstrap download failures", () => {
  let directory: string;
  let existing: string;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), "typora-copilot-installer-test-"));
    existing = path.join(directory, "typora-copilot-", "keep.txt");
    mkdirSync(path.dirname(existing));
    writeFileSync(existing, "existing user data");
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it("stops the shell installer before touching existing files", (context) => {
    if (!existsSync(bash)) context.skip();
    const result = spawnSync(
      bash,
      [
        "--noprofile",
        "--norc",
        "-c",
        'id() { printf 0; }; curl() { return 22; }; unzip() { return 1; }; export -f id curl unzip; bash "$1"',
        "test",
        path.resolve("install.sh").replace(/\\/g, "/"),
      ],
      { cwd: directory, encoding: "utf8" },
    );

    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(readFileSync(existing, "utf8")).toBe("existing user data");
  });

  it("runs downloaded shell scripts in a temporary directory and cleans up", (context) => {
    if (!existsSync(bash)) context.skip();
    const marker = path.join(directory, "installed");
    const archive = path.join(directory, "typora-copilot-vtest.zip");
    writeFileSync(archive, "existing archive");
    const result = spawnSync(
      bash,
      [
        "--noprofile",
        "--norc",
        "-c",
        `id() { printf 0; }
curl() {
  if [[ "$*" == *api.github.com* ]]; then
    printf '%s' '{"tag_name": "vtest", "browser_download_url": "https://example.com/release.zip"}'
  else
    printf archive > release.zip
  fi
}
unzip() {
  mkdir -p release/bin
  printf '#!/usr/bin/env bash\\nexit 0\\n' > release/bin/uninstall_linux.sh
  printf '#!/usr/bin/env bash\\nprintf installed > "$INSTALL_MARKER"\\n' > release/bin/install_linux.sh
}
OSTYPE=linux-gnu
source "$1"`,
        "test",
        path.resolve("install.sh").replace(/\\/g, "/"),
      ],
      {
        cwd: directory,
        encoding: "utf8",
        env: {
          ...process.env,
          INSTALL_MARKER: marker.replace(/\\/g, "/"),
          TMPDIR: directory.replace(/\\/g, "/"),
        },
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(marker, "utf8")).toBe("installed");
    expect(readFileSync(archive, "utf8")).toBe("existing archive");
    expect(readdirSync(directory).some((name) => name.startsWith("typora-copilot."))).toBe(false);
  });

  it("stops the PowerShell installer on non-terminating API errors", (context) => {
    if (process.platform !== "win32") context.skip();
    const script = path.join(directory, "install.ps1");
    const wrapper = path.join(directory, "wrapper.ps1");
    writeFileSync(
      script,
      readFileSync("install.ps1", "utf8").replace(/^#Requires -RunAsAdministrator\r?\n/, ""),
    );
    writeFileSync(
      wrapper,
      'function Invoke-RestMethod { Write-Error "No release" }\n' +
        'function Invoke-WebRequest { Write-Error "No archive" }\n' +
        'function Expand-Archive { Write-Error "Cannot extract" }\n' +
        "& $args[0]\n",
    );
    const result = spawnSync(
      path.join(
        process.env.SystemRoot ?? "C:/Windows",
        "System32/WindowsPowerShell/v1.0/powershell.exe",
      ),
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", wrapper, script],
      { cwd: directory, encoding: "utf8" },
    );

    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(readFileSync(existing, "utf8")).toBe("existing user data");
  });
});
