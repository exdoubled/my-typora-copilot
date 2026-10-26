import { createRequire } from "node:module";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("executable arguments", () => {
  const isNode = Files.isNode;
  const reqnode = window.reqnode;
  let runExecutable: typeof import("./cli-tools").runExecutable;

  beforeAll(async () => {
    Files.isNode = true;
    window.reqnode = createRequire(import.meta.url);
    ({ runExecutable } = await import("./cli-tools"));
  });
  afterAll(() => {
    Files.isNode = isNode;
    window.reqnode = reqnode;
  });

  it("passes shell metacharacters and environment references as literal arguments", async () => {
    const argument = '" & echo INJECTED & $HOME $(printf injected) %PATH% `id`';
    const output = await runExecutable(process.execPath, [
      "-e",
      "process.stdout.write(process.argv[1])",
      argument,
    ]);

    expect(output).toBe(argument);
  });
});
