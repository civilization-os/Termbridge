import { EventEmitter } from "node:events";
import type { Client, ClientChannel } from "ssh2";
import { TerminalBuffer } from "../terminal/terminalBuffer.js";
import type { PtyOptions, TerminalSnapshot } from "../core/types.js";
import { bracketedPaste, encodeInputAction, Keys, type InputAction } from "./input.js";
import { OutputRecorder } from "./outputRecorder.js";

export interface SshSessionEvents {
  data: [chunk: Buffer];
  close: [];
  error: [error: Error];
}

export class SshSession extends EventEmitter<SshSessionEvents> {
  readonly buffer: TerminalBuffer;
  readonly recorder: OutputRecorder;
  private lastDataAt = Date.now();
  private closed = false;

  constructor(
    private readonly client: Client,
    private readonly channel: ClientChannel,
    options: Required<Pick<PtyOptions, "cols" | "rows">> & { recordMaxBytes?: number }
  ) {
    super();
    this.buffer = new TerminalBuffer({
      cols: options.cols,
      rows: options.rows
    });
    this.recorder = new OutputRecorder({ maxBytes: options.recordMaxBytes });

    this.channel.on("data", (chunk: Buffer) => {
      this.lastDataAt = Date.now();
      this.recorder.append(chunk);
      this.buffer.write(chunk);
      this.emit("data", chunk);
    });
    this.channel.once("close", () => {
      this.closed = true;
      this.emit("close");
    });
    this.channel.once("error", (error: Error) => {
      this.emit("error", error);
    });
  }

  write(data: string | Buffer): Promise<void> {
    if (this.closed) {
      return Promise.reject(new Error("SSH session is closed"));
    }

    this.lastDataAt = Date.now();
    return new Promise((resolve, reject) => {
      this.channel.write(data, (error?: Error | null) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  writeLine(command = ""): Promise<void> {
    return this.write(`${command}${Keys.enter}`);
  }

  send(action: InputAction): Promise<void> {
    if (action.type === "resize") {
      this.resize(action.cols, action.rows);
      return Promise.resolve();
    }
    return this.write(encodeInputAction(action));
  }

  flush(): Promise<void> {
    return this.buffer.flush();
  }

  sendEnter(): Promise<void> {
    return this.write(Keys.enter);
  }

  sendLineFeed(): Promise<void> {
    return this.write(Keys.lineFeed);
  }

  sendCtrlC(): Promise<void> {
    return this.write(Keys.ctrlC);
  }

  sendCtrlD(): Promise<void> {
    return this.write(Keys.ctrlD);
  }

  sendCtrlV(): Promise<void> {
    return this.write(Keys.ctrlV);
  }

  paste(text: string, bracketed = true): Promise<void> {
    return this.write(bracketed ? bracketedPaste(text) : text);
  }

  resize(cols: number, rows: number): void {
    this.channel.setWindow(rows, cols, 0, 0);
    this.buffer.resize(cols, rows);
  }

  snapshot(): TerminalSnapshot {
    return this.buffer.snapshot();
  }

  async waitForIdle(idleMs = 500, timeoutMs = 10_000): Promise<void> {
    const started = Date.now();
    while (Date.now() - started <= timeoutMs) {
      if (Date.now() - this.lastDataAt >= idleMs) {
        await this.flush();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(idleMs, 100)));
    }
    throw new Error(`SSH session did not become idle within ${timeoutMs}ms`);
  }

  async waitForText(pattern: string | RegExp, timeoutMs = 10_000): Promise<TerminalSnapshot> {
    const started = Date.now();
    while (Date.now() - started <= timeoutMs) {
      await this.flush();
      const snapshot = this.snapshot();
      const text = `${snapshot.visibleText}\n${snapshot.scrollbackText}\n${this.recorder.text()}`;
      if (typeof pattern === "string" ? text.includes(pattern) : pattern.test(text)) {
        return snapshot;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`SSH session did not match ${String(pattern)} within ${timeoutMs}ms`);
  }

  close(): void {
    if (!this.closed) {
      this.channel.end();
    }
    this.client.end();
  }
}
