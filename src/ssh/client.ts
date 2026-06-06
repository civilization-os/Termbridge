import { Client } from "ssh2";
import { createDeferred } from "../core/deferred.js";
import type { PtyOptions, SshProfile } from "../core/types.js";
import { toSsh2Config } from "../core/types.js";
import { LinsshSftpClient } from "../sftp/client.js";
import { SshSession } from "./session.js";

export class LinsshClient {
  private readonly client = new Client();
  private connected = false;

  constructor(readonly profile: SshProfile) {}

  async connect(): Promise<this> {
    if (this.connected) {
      return this;
    }

    const ready = createDeferred<this>();
    this.client.once("ready", () => {
      this.connected = true;
      ready.resolve(this);
    });
    this.client.once("error", ready.reject);
    this.client.connect(toSsh2Config(this.profile));
    return ready.promise;
  }

  async shell(options: PtyOptions = {}): Promise<SshSession> {
    await this.connect();
    const cols = options.cols ?? 120;
    const rows = options.rows ?? 40;

    return new Promise((resolve, reject) => {
      this.client.shell(
        {
          term: options.term ?? "xterm-256color",
          cols,
          rows
        },
        {
          env: options.env
        },
        (error, channel) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(new SshSession(this.client, channel, { cols, rows }));
        }
      );
    });
  }

  async sftp(options: { closeClientOnEnd?: boolean } = {}): Promise<LinsshSftpClient> {
    await this.connect();
    return LinsshSftpClient.open(this.client, options.closeClientOnEnd);
  }

  end(): void {
    this.client.end();
    this.connected = false;
  }
}

export async function openSshSession(profile: SshProfile, options?: PtyOptions): Promise<SshSession> {
  const client = new LinsshClient(profile);
  return client.shell(options);
}
