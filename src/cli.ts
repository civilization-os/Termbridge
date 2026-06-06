#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Command } from "commander";
import type { SshProfile } from "./core/types.js";
import { PluginLoader } from "./plugins/pluginLoader.js";
import { LinsshClient } from "./ssh/client.js";
import { SkillRuntime } from "./skills/runtime.js";

interface CommonSshOptions {
  host: string;
  port?: string;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  agent?: string;
}

const program = new Command();

program
  .name("termbridge")
  .description("SSH/SFTP toolkit with PTY buffers, MCP tools, and user skills")
  .version("0.1.0");

program
  .command("ssh")
  .description("Open an interactive SSH PTY session")
  .requiredOption("--host <host>")
  .option("--port <port>", "SSH port", "22")
  .requiredOption("--username <username>")
  .option("--password <password>")
  .option("--private-key <path>")
  .option("--passphrase <passphrase>")
  .option("--agent [path]", "Use SSH agent")
  .option("--cols <cols>", "PTY columns", String(process.stdout.columns || 120))
  .option("--rows <rows>", "PTY rows", String(process.stdout.rows || 40))
  .action(async (options: CommonSshOptions & { cols: string; rows: string }) => {
    const client = new LinsshClient(buildProfile(options));
    const session = await client.shell({
      cols: Number(options.cols),
      rows: Number(options.rows)
    });

    const cleanup = () => {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
    };

    session.on("data", (chunk) => process.stdout.write(chunk));
    session.once("close", () => {
      cleanup();
      process.exit(0);
    });
    session.once("error", (error) => {
      cleanup();
      throw error;
    });

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.on("data", (chunk) => {
      void session.write(chunk);
    });

    process.stdout.on("resize", () => {
      session.resize(process.stdout.columns || 120, process.stdout.rows || 40);
    });
  });

program
  .command("command")
  .description("Run one command and print the terminal buffer snapshot")
  .requiredOption("--host <host>")
  .option("--port <port>", "SSH port", "22")
  .requiredOption("--username <username>")
  .option("--password <password>")
  .option("--private-key <path>")
  .option("--passphrase <passphrase>")
  .option("--agent [path]", "Use SSH agent")
  .requiredOption("--cmd <command>")
  .option("--idle-ms <ms>", "Idle wait", "500")
  .option("--timeout-ms <ms>", "Timeout", "10000")
  .action(async (options: CommonSshOptions & { cmd: string; idleMs: string; timeoutMs: string }) => {
    const client = new LinsshClient(buildProfile(options));
    const session = await client.shell();
    try {
      await session.writeLine(options.cmd);
      await session.waitForIdle(Number(options.idleMs), Number(options.timeoutMs));
      process.stdout.write(`${JSON.stringify(session.snapshot(), null, 2)}\n`);
    } finally {
      session.close();
    }
  });

const sftp = program.command("sftp").description("SFTP helpers");

sftp
  .command("ls")
  .requiredOption("--host <host>")
  .option("--port <port>", "SSH port", "22")
  .requiredOption("--username <username>")
  .option("--password <password>")
  .option("--private-key <path>")
  .option("--passphrase <passphrase>")
  .option("--agent [path]", "Use SSH agent")
  .requiredOption("--path <path>")
  .action(async (options: CommonSshOptions & { path: string }) => {
    const client = await new LinsshClient(buildProfile(options)).connect();
    try {
      const remote = await client.sftp();
      try {
        process.stdout.write(`${JSON.stringify(await remote.readdir(options.path), null, 2)}\n`);
      } finally {
        remote.end();
      }
    } finally {
      client.end();
    }
  });

sftp
  .command("upload")
  .requiredOption("--host <host>")
  .option("--port <port>", "SSH port", "22")
  .requiredOption("--username <username>")
  .option("--password <password>")
  .option("--private-key <path>")
  .option("--passphrase <passphrase>")
  .option("--agent [path]", "Use SSH agent")
  .requiredOption("--local <path>")
  .requiredOption("--remote <path>")
  .action(async (options: CommonSshOptions & { local: string; remote: string }) => {
    const client = await new LinsshClient(buildProfile(options)).connect();
    try {
      const remote = await client.sftp();
      try {
        await remote.upload(options.local, options.remote);
      } finally {
        remote.end();
      }
    } finally {
      client.end();
    }
  });

sftp
  .command("download")
  .requiredOption("--host <host>")
  .option("--port <port>", "SSH port", "22")
  .requiredOption("--username <username>")
  .option("--password <password>")
  .option("--private-key <path>")
  .option("--passphrase <passphrase>")
  .option("--agent [path]", "Use SSH agent")
  .requiredOption("--remote <path>")
  .requiredOption("--local <path>")
  .action(async (options: CommonSshOptions & { local: string; remote: string }) => {
    const client = await new LinsshClient(buildProfile(options)).connect();
    try {
      const remote = await client.sftp();
      try {
        await remote.download(options.remote, options.local);
      } finally {
        remote.end();
      }
    } finally {
      client.end();
    }
  });

program
  .command("skill")
  .description("Run a user skill module")
  .requiredOption("--path <path>")
  .option("--input <json>", "JSON input", "{}")
  .action(async (options: { path: string; input: string }) => {
    const input = JSON.parse(options.input) as unknown;
    const result = await new SkillRuntime().run(options.path, input);
    process.stdout.write(`${typeof result === "string" ? result : JSON.stringify(result, null, 2)}\n`);
  });

const plugin = program.command("plugin").description("Plugin helpers");

plugin
  .command("run")
  .description("Run a skill from a TermBridge plugin directory")
  .requiredOption("--root <path>")
  .requiredOption("--skill <name>")
  .option("--input <json>", "JSON input", "{}")
  .action(async (options: { root: string; skill: string; input: string }) => {
    const input = JSON.parse(options.input) as unknown;
    const result = await new PluginLoader().runSkill(options.root, options.skill, input);
    process.stdout.write(`${typeof result === "string" ? result : JSON.stringify(result, null, 2)}\n`);
  });

await program.parseAsync();

function buildProfile(options: CommonSshOptions): SshProfile {
  const profile: SshProfile = {
    host: options.host,
    port: Number(options.port ?? 22),
    username: options.username
  };

  if (options.password) {
    profile.auth = {
      type: "password",
      password: options.password
    };
    return profile;
  }

  if (options.privateKey) {
    profile.auth = {
      type: "privateKey",
      privateKey: readFileSync(options.privateKey, "utf8"),
      passphrase: options.passphrase
    };
    return profile;
  }

  if (options.agent !== undefined) {
    profile.auth = {
      type: "agent",
      agent: typeof options.agent === "string" ? options.agent : undefined
    };
  }

  return profile;
}
