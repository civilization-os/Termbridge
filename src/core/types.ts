import type { ConnectConfig } from "ssh2";

export type SshAuth =
  | {
      type: "password";
      password: string;
    }
  | {
      type: "privateKey";
      privateKey: string;
      passphrase?: string;
    }
  | {
      type: "agent";
      agent?: string;
    };

export interface SshProfile {
  host: string;
  port?: number;
  username: string;
  auth?: SshAuth;
  readyTimeout?: number;
  keepaliveInterval?: number;
}

export interface PtyOptions {
  term?: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
}

export interface TerminalSnapshot {
  visibleText: string;
  scrollbackText: string;
  serialized: string;
  cursor: {
    x: number;
    y: number;
  };
  size: {
    cols: number;
    rows: number;
  };
}

export interface FileEntry {
  filename: string;
  longname: string;
  attrs: {
    size: number;
    mode: number;
    uid: number;
    gid: number;
    atime: number;
    mtime: number;
  };
}

export function toSsh2Config(profile: SshProfile): ConnectConfig {
  const config: ConnectConfig = {
    host: profile.host,
    port: profile.port ?? 22,
    username: profile.username,
    readyTimeout: profile.readyTimeout ?? 20_000,
    keepaliveInterval: profile.keepaliveInterval ?? 15_000
  };

  if (!profile.auth) {
    return config;
  }

  switch (profile.auth.type) {
    case "password":
      config.password = profile.auth.password;
      break;
    case "privateKey":
      config.privateKey = profile.auth.privateKey;
      config.passphrase = profile.auth.passphrase;
      break;
    case "agent":
      config.agent = profile.auth.agent ?? process.env.SSH_AUTH_SOCK;
      break;
  }

  return config;
}
