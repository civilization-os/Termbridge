import type { LinsshClient } from "../ssh/client.js";
import type { LinsshSftpClient } from "../sftp/client.js";
import type { PtyOptions, SshProfile } from "../core/types.js";
import type { SshSession } from "../ssh/session.js";

export interface SkillSshApi {
  connect(profile: SshProfile): Promise<LinsshClient>;
  open(profile: SshProfile, options?: PtyOptions): Promise<SshSession>;
  sftp(profile: SshProfile): Promise<LinsshSftpClient>;
}

export interface LinsshSkillContext {
  ssh: SkillSshApi;
  logger: {
    info(message: string, meta?: unknown): void;
    warn(message: string, meta?: unknown): void;
    error(message: string, meta?: unknown): void;
  };
}

export interface LinsshSkill<Input = unknown, Output = unknown> {
  name: string;
  description?: string;
  run(context: LinsshSkillContext, input: Input): Promise<Output> | Output;
}
