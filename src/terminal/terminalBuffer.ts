import { createRequire } from "node:module";
import { StringDecoder } from "node:string_decoder";
import type { SerializeAddon as XtermSerializeAddon } from "@xterm/addon-serialize";
import type { Terminal as XtermTerminal } from "@xterm/headless";
import type { TerminalSnapshot } from "../core/types.js";

const require = createRequire(import.meta.url);
const { SerializeAddon } = require("@xterm/addon-serialize") as typeof import("@xterm/addon-serialize");
const { Terminal } = require("@xterm/headless") as typeof import("@xterm/headless");

export interface TerminalBufferOptions {
  cols?: number;
  rows?: number;
  scrollback?: number;
}

export class TerminalBuffer {
  private readonly terminal: XtermTerminal;
  private readonly serializeAddon: XtermSerializeAddon = new SerializeAddon();
  private readonly decoder = new StringDecoder("utf8");
  private pendingWrites: Promise<void> = Promise.resolve();

  constructor(options: TerminalBufferOptions = {}) {
    this.terminal = new Terminal({
      cols: options.cols ?? 120,
      rows: options.rows ?? 40,
      scrollback: options.scrollback ?? 10_000,
      allowProposedApi: true
    });
    this.terminal.loadAddon(this.serializeAddon);
  }

  write(data: string | Buffer): void {
    const text = typeof data === "string" ? data : this.decoder.write(data);
    if (!text) {
      return;
    }

    this.pendingWrites = this.pendingWrites.then(
      () =>
        new Promise<void>((resolve) => {
          this.terminal.write(text, resolve);
        })
    );
  }

  async flush(): Promise<void> {
    await this.pendingWrites;
  }

  resize(cols: number, rows: number): void {
    this.terminal.resize(cols, rows);
  }

  getVisibleText(): string {
    const buffer = this.terminal.buffer.active;
    const start = buffer.baseY;
    const end = buffer.baseY + this.terminal.rows;
    return this.lines(start, end).join("\n");
  }

  getScrollbackText(): string {
    const buffer = this.terminal.buffer.active;
    return this.lines(0, buffer.length).join("\n");
  }

  serialize(): string {
    return this.serializeAddon.serialize();
  }

  snapshot(): TerminalSnapshot {
    const buffer = this.terminal.buffer.active;
    return {
      visibleText: this.getVisibleText(),
      scrollbackText: this.getScrollbackText(),
      serialized: this.serialize(),
      cursor: {
        x: buffer.cursorX,
        y: buffer.cursorY
      },
      size: {
        cols: this.terminal.cols,
        rows: this.terminal.rows
      }
    };
  }

  private lines(start: number, end: number): string[] {
    const buffer = this.terminal.buffer.active;
    const output: string[] = [];
    for (let i = start; i < end; i += 1) {
      const line = buffer.getLine(i);
      output.push(line?.translateToString(true) ?? "");
    }
    return output;
  }
}
