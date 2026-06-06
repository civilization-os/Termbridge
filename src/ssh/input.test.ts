import { describe, expect, it } from "vitest";
import { encodeInputAction, Keys } from "./input.js";

describe("encodeInputAction", () => {
  it("encodes line, key, and paste actions", () => {
    expect(encodeInputAction({ type: "line", text: "pwd" })).toBe(`pwd${Keys.enter}`);
    expect(encodeInputAction({ type: "key", key: "ctrlC" })).toBe(Keys.ctrlC);
    expect(encodeInputAction({ type: "paste", text: "a\nb" })).toBe("\x1b[200~a\nb\x1b[201~");
  });
});
