import { describe, expect, it } from "vitest";
import { TerminalBuffer } from "./terminalBuffer.js";

describe("TerminalBuffer", () => {
  it("keeps visible text and serialized screen state", async () => {
    const buffer = new TerminalBuffer({ cols: 20, rows: 3 });
    buffer.write("hello\r\nworld");
    await buffer.flush();

    expect(buffer.getVisibleText()).toContain("hello");
    expect(buffer.getVisibleText()).toContain("world");
    expect(buffer.serialize()).toContain("hello");
  });

  it("tracks resize in snapshots", () => {
    const buffer = new TerminalBuffer({ cols: 20, rows: 3 });
    buffer.resize(40, 10);
    expect(buffer.snapshot().size).toEqual({ cols: 40, rows: 10 });
  });
});
