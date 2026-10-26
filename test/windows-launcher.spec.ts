import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const powershell = path.join(
  process.env.SystemRoot ?? "C:/Windows",
  "System32/WindowsPowerShell/v1.0/powershell.exe",
);
const originalHtml =
  '<html><script src="./appsrc/window/frame.js" defer="defer"></script><p>Keep me</p></html>';

describe("Windows persistent launcher", { timeout: 30_000 }, () => {
  let temporary: string;
  let directory: string;
  let registry: string;
  let typora: string;
  let html: string;
  let release: string;
  let home: string;

  const run = (body: string, mode = "normal") => {
    const script = path.join(directory, "test.ps1");
    writeFileSync(
      script,
      '\uFEFF$ErrorActionPreference = "Stop"\n[Console]::OutputEncoding = [Text.Encoding]::UTF8\n' +
        body,
    );
    return spawnSync(powershell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script], {
      encoding: "utf8",
      timeout: 30_000,
      env: {
        ...process.env,
        LOCALAPPDATA: path.join(directory, "Local"),
        APPDATA: path.join(directory, "Roaming"),
        COPILOT_TEST_ROOT: directory,
        COPILOT_TEST_REGISTRY: registry,
        COPILOT_TEST_MODE: mode,
        COPILOT_TEST_NODE: process.execPath,
      },
    });
  };
  const check = (body: string, mode?: string) => {
    const result = run(body, mode);
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    return result;
  };
  const install = () => {
    check(
      '& "$env:COPILOT_TEST_ROOT\\release\\bin\\install_windows.ps1" -Path "$env:COPILOT_TEST_ROOT\\Typora"',
    );
  };
  const launch = (mode?: string) => {
    check(
      "& \"$env:LOCALAPPDATA\\TyporaCopilot\\bin\\launch_windows.ps1\" (Join-Path $env:COPILOT_TEST_ROOT 'notes & $value [x] #100%.md')",
      mode,
    );
  };
  const launches = () =>
    readFileSync(path.join(directory, "launches.jsonl"), "utf8")
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line) as { FilePath: string; ArgumentList: string; Verb: string });

  beforeEach((context) => {
    if (process.platform !== "win32") context.skip();
    temporary = mkdtempSync(path.join(tmpdir(), "typora-launcher-test-"));
    directory = path.join(temporary, "中文 & $tag [x] #100%");
    registry = `HKCU:\\Software\\TyporaCopilot.Tests\\${randomUUID()}`;
    typora = path.join(directory, "Typora");
    html = path.join(typora, "resources", "window.html");
    release = path.join(directory, "release");
    home = path.join(directory, "Local", "TyporaCopilot");
    mkdirSync(path.dirname(html), { recursive: true });
    writeFileSync(html, originalHtml);
    writeFileSync(path.join(typora, "Typora.exe"), "not executable: launches must be intercepted");
    mkdirSync(path.join(release, "bin"), { recursive: true });
    for (const name of readdirSync("bin"))
      writeFileSync(path.join(release, "bin", name), readFileSync(path.join("bin", name)));
    mkdirSync(path.join(release, "language-server"));
    writeFileSync(path.join(release, "index.js"), "plugin payload");
    writeFileSync(path.join(release, "mac-server.cjs"), "bridge payload");
    writeFileSync(path.join(release, "package.json"), '{"type":"module"}');
    writeFileSync(path.join(release, "language-server", "language-server.cjs"), "server payload");
    // Redirect shell integration to an isolated registry subtree and shortcut directory.
    // Intercept app launch/UAC/dialogs; HTML writes, installation and registry operations stay real.
    appendFileSync(
      path.join(release, "bin", "windows-common.ps1"),
      `
function Get-CopilotShellPaths {
    return @{ Shortcut = "$env:COPILOT_TEST_ROOT\\launcher.lnk"; Classes = $env:COPILOT_TEST_REGISTRY }
}
function Show-CopilotWarning([string] $Message) {
    Add-Content -LiteralPath "$env:COPILOT_TEST_ROOT\\warnings.txt" -Value $Message -Encoding UTF8
}
function Get-Process { return @() }
function Start-Process {
    param($FilePath, $ArgumentList, $Verb, $WindowStyle, [switch] $Wait, [switch] $PassThru)
    @{ FilePath = $FilePath; ArgumentList = $ArgumentList; Verb = $Verb } | ConvertTo-Json -Compress |
        Add-Content -LiteralPath "$env:COPILOT_TEST_ROOT\\launches.jsonl" -Encoding UTF8
    if ($Verb -eq 'RunAs') {
        if ($env:COPILOT_TEST_MODE -eq 'cancelled') { throw 'UAC cancelled' }
        $oldMode = $env:COPILOT_TEST_MODE
        $env:COPILOT_TEST_MODE = 'normal'
        try {
            & "$env:SystemRoot\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\\TyporaCopilot\\bin\\repair_windows.ps1"
            return @{ ExitCode = $LASTEXITCODE }
        }
        finally { $env:COPILOT_TEST_MODE = $oldMode }
    }
}
if ($env:COPILOT_TEST_MODE -in @('denied', 'cancelled')) {
    function Repair-Copilot { throw [UnauthorizedAccessException]::new('Access denied') }
}
`,
    );
  });

  afterEach(() => {
    if (!temporary) return;
    try {
      check(
        "if (Test-Path -LiteralPath $env:COPILOT_TEST_REGISTRY) { Remove-Item -LiteralPath $env:COPILOT_TEST_REGISTRY -Recurse -Force }",
      );
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("migrates the old injection, registers the launcher and survives replacement of resources", () => {
    writeFileSync(
      html,
      originalHtml.replace("<p>", '<script src="./copilot/index.js" defer="defer"></script><p>'),
    );
    install();
    const installed = readFileSync(html, "utf8");
    expect(installed).not.toContain('src="./copilot/index.js"');
    expect(installed.match(/typora-copilot-loader/g)).toHaveLength(1);
    expect(installed).toContain("file:///");
    expect(installed).toContain("%23");
    expect(installed).toContain("%25");
    expect(
      readFileSync(path.join(home, "plugin", "language-server", "language-server.cjs"), "utf8"),
    ).toBe("server payload");
    expect(existsSync(path.join(directory, "launcher.lnk"))).toBe(true);
    expect(readFileSync(path.join(home, "plugin", "package.json"), "utf8")).toBe(
      '{"type":"module"}',
    );
    check(`
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut("$env:COPILOT_TEST_ROOT\\launcher.lnk")
if ($shortcut.Arguments -notlike '*launch_windows.ps1*') { throw 'Wrong shortcut target' }
$command = (Get-Item -LiteralPath "$env:COPILOT_TEST_REGISTRY\\TyporaCopilot.Markdown\\shell\\open\\command").GetValue('')
if (-not $command.EndsWith('"%1"')) { throw 'Missing document argument' }
if ((Get-Item -LiteralPath "$env:COPILOT_TEST_REGISTRY\\.md\\OpenWithProgids").GetValueNames() -notcontains 'TyporaCopilot.Markdown') { throw 'Missing Open with registration' }
`);
    rmSync(path.join(typora, "resources"), { recursive: true });
    mkdirSync(path.dirname(html));
    writeFileSync(html, originalHtml.replace("Keep me", "Updated Typora"));
    launch();
    const repaired = readFileSync(html, "utf8");
    expect(repaired).toContain("Updated Typora");
    expect(repaired.match(/typora-copilot-loader/g)).toHaveLength(1);
    expect(readFileSync(html + ".copilot-backup", "utf8")).not.toContain("typora-copilot-loader");
    launch();
    expect(readFileSync(html, "utf8")).toBe(repaired);
    expect(launches()).toHaveLength(2);
    expect(launches()[0]?.FilePath).toBe(path.join(typora, "Typora.exe"));
    expect(launches()[0]?.Verb).toBeNull();
    expect(launches()[0]?.ArgumentList).toContain('notes & $value [x] #100%.md"');
  });

  it("updates the persistent payload without duplicating the injection", () => {
    install();
    writeFileSync(path.join(release, "index.js"), "updated plugin");
    install();
    expect(readFileSync(path.join(home, "plugin", "index.js"), "utf8")).toBe("updated plugin");
    expect(readFileSync(html, "utf8").match(/typora-copilot-loader/g)).toHaveLength(1);
    expect(existsSync(path.join(home, "plugin.previous"))).toBe(false);
  });

  it("leaves unknown layouts untouched and still opens Typora", () => {
    install();
    writeFileSync(html, "<html>A future Typora loading entry</html>");
    launch();
    expect(readFileSync(html, "utf8")).toBe("<html>A future Typora loading entry</html>");
    expect(readFileSync(path.join(directory, "warnings.txt"), "utf8")).toContain(
      "unknown loading entry",
    );
    expect(launches()).toHaveLength(1);
  });

  it("elevates only repair and still launches normally when UAC is cancelled", () => {
    install();
    launch("cancelled");
    const calls = launches();
    expect(calls).toHaveLength(2);
    expect(calls[0]?.Verb).toBe("RunAs");
    expect(calls[0]?.ArgumentList).toContain("repair_windows.ps1");
    expect(calls[0]?.ArgumentList).not.toContain("notes");
    expect(calls[1]?.Verb).toBeNull();
    expect(calls[1]?.FilePath).toBe(path.join(typora, "Typora.exe"));
    expect(readFileSync(path.join(directory, "warnings.txt"), "utf8")).toContain("UAC cancelled");
  });

  it("restores the entry with the repair helper before launching without elevation", () => {
    install();
    writeFileSync(html, originalHtml);
    launch("denied");
    expect(readFileSync(html, "utf8")).toContain("typora-copilot-loader");
    expect(launches().map((call) => call.Verb)).toEqual(["RunAs", null]);
    expect(existsSync(path.join(directory, "warnings.txt"))).toBe(false);
  });

  it("preserves literal arguments across the native Windows command line", () => {
    writeFileSync(
      path.join(directory, "record.cjs"),
      'require("node:fs").writeFileSync(process.argv[2], JSON.stringify(process.argv.slice(3)));',
    );
    check(`
. "$env:COPILOT_TEST_ROOT\\release\\bin\\windows-common.ps1"
$values = @("$env:COPILOT_TEST_ROOT\\record.cjs", "$env:COPILOT_TEST_ROOT\\argv.json", 'space & $value [x] #100%', 'trailing\\', 'embedded"quote')
$arguments = ($values | ForEach-Object { ConvertTo-CopilotArgument $_ }) -join ' '
$process = Microsoft.PowerShell.Management\\Start-Process -FilePath $env:COPILOT_TEST_NODE -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru
if ($process.ExitCode -ne 0) { throw 'Native argument recorder failed' }
`);
    expect(JSON.parse(readFileSync(path.join(directory, "argv.json"), "utf8"))).toEqual([
      "space & $value [x] #100%",
      "trailing\\",
      'embedded"quote',
    ]);
  });

  it("opens Typora with a warning if the saved language server is missing", () => {
    install();
    rmSync(path.join(home, "plugin", "language-server", "language-server.cjs"));
    writeFileSync(html, originalHtml);
    launch();
    expect(readFileSync(html, "utf8")).toBe(originalHtml);
    expect(readFileSync(path.join(directory, "warnings.txt"), "utf8")).toContain("incomplete");
    expect(launches()).toHaveLength(1);
  });

  it("uninstalls after an update removed the injection without deleting other file associations", () => {
    install();
    writeFileSync(html, originalHtml);
    check(`
New-ItemProperty -LiteralPath "$env:COPILOT_TEST_REGISTRY\\.md\\OpenWithProgids" -Name OtherEditor -Value '' -PropertyType String | Out-Null
& "$env:LOCALAPPDATA\\TyporaCopilot\\bin\\uninstall_windows.ps1"
if ((Get-Item -LiteralPath "$env:COPILOT_TEST_REGISTRY\\.md\\OpenWithProgids").GetValueNames() -notcontains 'OtherEditor') { throw 'Removed another editor' }
if (Test-Path -LiteralPath "$env:COPILOT_TEST_REGISTRY\\TyporaCopilot.Markdown") { throw 'Left launcher registration' }
`);
    expect(readFileSync(html, "utf8")).toBe(originalHtml);
    expect(existsSync(home)).toBe(false);
    expect(existsSync(path.join(directory, "launcher.lnk"))).toBe(false);
  });

  it("refuses to repair through a junction", () => {
    install();
    const outside = path.join(directory, "outside");
    mkdirSync(outside);
    writeFileSync(path.join(outside, "window.html"), originalHtml);
    rmSync(path.join(typora, "resources"), { recursive: true });
    symlinkSync(outside, path.join(typora, "resources"), "junction");
    launch();
    expect(readFileSync(path.join(outside, "window.html"), "utf8")).toBe(originalHtml);
    expect(readFileSync(path.join(directory, "warnings.txt"), "utf8")).toContain("junction");
  });
});
