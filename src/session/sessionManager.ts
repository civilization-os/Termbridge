import { randomUUID } from "node:crypto";
import { LinsshClient } from "../ssh/client.js";
import type { InputAction } from "../ssh/input.js";
import type { SshSession } from "../ssh/session.js";
import type { PtyOptions, SshProfile, TerminalSnapshot } from "../core/types.js";

export interface ManagedSession {
  id: string;
  profile: Pick<SshProfile, "host" | "port" | "username">;
  createdAt: string;
  session: SshSession;
}

export class SessionManager {
  private readonly sessions = new Map<string, ManagedSession>();

  async open(profile: SshProfile, pty?: PtyOptions): Promise<ManagedSession> {
    const client = new LinsshClient(profile);
    const session = await client.shell(pty);
    const managed: ManagedSession = {
      id: randomUUID(),
      profile: {
        host: profile.host,
        port: profile.port,
        username: profile.username
      },
      createdAt: new Date().toISOString(),
      session
    };
    this.sessions.set(managed.id, managed);
    session.once("close", () => {
      this.sessions.delete(managed.id);
    });
    return managed;
  }

  get(id: string): SshSession {
    const managed = this.sessions.get(id);
    if (!managed) {
      throw new Error(`Unknown SSH session: ${id}`);
    }
    return managed.session;
  }

  list(): Array<Omit<ManagedSession, "session">> {
    return [...this.sessions.values()].map(({ session: _session, ...managed }) => managed);
  }

  async send(id: string, action: InputAction, waitForIdleMs?: number): Promise<TerminalSnapshot> {
    const session = this.get(id);
    await session.send(action);
    if (waitForIdleMs !== undefined) {
      await session.waitForIdle(waitForIdleMs);
    } else {
      await session.flush();
    }
    return session.snapshot();
  }

  async snapshot(id: string): Promise<TerminalSnapshot> {
    const session = this.get(id);
    await session.flush();
    return session.snapshot();
  }

  rawTranscript(id: string): string {
    return this.get(id).recorder.text();
  }

  close(id: string): void {
    this.get(id).close();
    this.sessions.delete(id);
  }

  closeAll(): void {
    for (const id of this.sessions.keys()) {
      this.close(id);
    }
  }
}
