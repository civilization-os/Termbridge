import { StringDecoder } from "node:string_decoder";

export interface OutputRecord {
  at: string;
  data: string;
}

export interface OutputRecorderOptions {
  maxBytes?: number;
}

export class OutputRecorder {
  private readonly chunks: OutputRecord[] = [];
  private readonly decoder = new StringDecoder("utf8");
  private readonly maxBytes: number;
  private byteLength = 0;

  constructor(options: OutputRecorderOptions = {}) {
    this.maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
  }

  append(chunk: Buffer): void {
    const data = this.decoder.write(chunk);
    if (!data) {
      return;
    }

    const record = {
      at: new Date().toISOString(),
      data
    };
    this.chunks.push(record);
    this.byteLength += Buffer.byteLength(record.data);
    this.trim();
  }

  all(): OutputRecord[] {
    return [...this.chunks];
  }

  text(): string {
    return this.chunks.map((chunk) => chunk.data).join("");
  }

  clear(): void {
    this.chunks.length = 0;
    this.byteLength = 0;
  }

  private trim(): void {
    while (this.byteLength > this.maxBytes && this.chunks.length > 0) {
      const shifted = this.chunks.shift();
      if (shifted) {
        this.byteLength -= Buffer.byteLength(shifted.data);
      }
    }
  }
}
