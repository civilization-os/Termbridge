import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SshProfile } from "../core/types.js";
import { LinsshClient } from "./client.js";

const profile: SshProfile = {
  host: process.env.LINSSH_IT_HOST ?? "127.0.0.1",
  port: Number(process.env.LINSSH_IT_PORT ?? 2222),
  username: process.env.LINSSH_IT_USERNAME ?? "linssh",
  auth: {
    type: "password",
    password: process.env.LINSSH_IT_PASSWORD ?? "linssh-pass"
  }
};
const remoteDir = process.env.LINSSH_IT_REMOTE_DIR ?? "/config/linssh-sftp";

describe("docker SSH fixture", () => {
  it("runs commands through a PTY and keeps a readable terminal buffer", async () => {
    const client = new LinsshClient(profile);
    const session = await client.shell({ cols: 100, rows: 30 });

    try {
      await session.send({ type: "line", text: "printf 'LINSSH_IT_OK:%s\\n' \"$(pwd)\"" });
      await session.waitForIdle(500, 10_000);

      const snapshot = session.snapshot();
      expect(snapshot.visibleText).toContain("LINSSH_IT_OK:/config");
      expect(snapshot.size).toEqual({ cols: 100, rows: 30 });
      expect(session.recorder.text()).toContain("LINSSH_IT_OK:/config");
    } finally {
      session.close();
    }
  });

  it("supports semantic paste and ctrl-c input", async () => {
    const client = new LinsshClient(profile);
    const session = await client.shell({ cols: 100, rows: 30 });

    try {
      await session.send({ type: "paste", text: "printf 'PASTE_OK\\n'", bracketed: false });
      await session.send({ type: "key", key: "enter" });
      await session.waitForIdle(500, 10_000);
      expect(session.snapshot().scrollbackText).toContain("PASTE_OK");

      await session.send({ type: "line", text: "sleep 5" });
      await new Promise((resolve) => setTimeout(resolve, 250));
      await session.send({ type: "key", key: "ctrlC" });
      await session.waitForIdle(500, 10_000);
      expect(session.snapshot().scrollbackText).toContain("^C");
    } finally {
      session.close();
    }
  });

  it("switches users in a PTY and reports the active user with whoami", async () => {
    const client = new LinsshClient(profile);
    const session = await client.shell({ cols: 100, rows: 30 });

    try {
      await session.send({ type: "line", text: "whoami" });
      await session.waitForIdle(500, 10_000);
      expect(session.snapshot().scrollbackText).toContain(profile.username);

      await session.send({ type: "line", text: "su -" });
      await session.waitForText(/Password:/, 10_000);

      await session.send({ type: "line", text: process.env.LINSSH_IT_PASSWORD ?? "linssh-pass" });
      await session.send({ type: "line", text: "whoami" });
      await session.waitForText(/\broot\b/, 10_000);

      expect(session.snapshot().scrollbackText).toContain("root");
    } finally {
      session.close();
    }
  }, 20_000);

  it("runs top in a PTY and exposes its live screen buffer", async () => {
    const client = new LinsshClient(profile);
    const session = await client.shell({ cols: 100, rows: 30 });

    try {
      await session.send({ type: "line", text: "top" });
      await session.waitForText(/PID|COMMAND|Tasks:/, 10_000);

      const runningTop = session.snapshot().visibleText;
      expect(runningTop).toMatch(/top -|Mem:|CPU|PID/);

      await session.send({ type: "raw", data: "q" });
    } finally {
      session.close();
    }
  }, 20_000);

  it("lists, downloads, and uploads files through SFTP", async () => {
    const client = await new LinsshClient(profile).connect();
    const sftp = await client.sftp();
    const temp = await mkdtemp(join(tmpdir(), "linssh-it-"));
    const downloadPath = join(temp, "source.txt");
    const uploadPath = join(temp, "upload.txt");

    try {
      const before = await sftp.readdir(remoteDir);
      expect(before.map((entry) => entry.filename)).toContain("source.txt");

      await sftp.download(`${remoteDir}/source.txt`, downloadPath);
      expect(await readFile(downloadPath, "utf8")).toBe("fixture\n");

      await writeFile(uploadPath, "uploaded\n", "utf8");
      await sftp.upload(uploadPath, `${remoteDir}/upload.txt`);
      const after = await sftp.readdir(remoteDir);
      expect(after.map((entry) => entry.filename)).toContain("upload.txt");
    } finally {
      sftp.end();
      client.end();
    }
  });
});
