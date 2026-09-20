import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { describe, expect, it, vi } from "vitest";
import ts from "typescript";

describe("native process cancellation", () => {
  it("rejects an in-flight xdotool operation when its task signal is aborted", async () => {
    const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
    const code = source.slice(
      source.indexOf("function runXdotool("),
      source.indexOf("function findChromiumWindow("),
    );
    const execFile = vi.fn(
      (
        _file: string,
        _arguments: string[],
        options: { signal?: AbortSignal },
        callback: (error: Error | null) => void,
      ) => {
        options.signal?.addEventListener(
          "abort",
          () => callback(Object.assign(new Error("aborted"), { name: "AbortError" })),
          { once: true },
        );
      },
    );
    const run = runInNewContext(
      `${ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2023 } }).outputText}; runXdotool`,
      { execFile, x11Environment: () => ({ DISPLAY: ":99" }), Promise },
    ) as (arguments_: string[], signal: AbortSignal) => Promise<void>;
    const controller = new AbortController();
    const operation = run(["click", "1"], controller.signal);

    controller.abort();

    await expect(operation).rejects.toMatchObject({ name: "AbortError" });
    expect(execFile).toHaveBeenCalledOnce();
    expect(execFile.mock.calls[0]?.[2].signal).toBe(controller.signal);
  });
});
