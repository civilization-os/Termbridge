#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { LinsshClient } from "../ssh/client.js";
import { PluginLoader } from "../plugins/pluginLoader.js";
import { SessionManager } from "../session/sessionManager.js";
import { SkillRuntime } from "../skills/runtime.js";
import { inputActionSchema, profileSchema, ptySchema } from "./schemas.js";

const sessionManager = new SessionManager();

export function createTermBridgeMcpServer(): McpServer {
  const server = new McpServer({
    name: "termbridge",
    version: "0.1.0"
  });

  server.registerTool(
    "ssh_open",
    {
      title: "Open SSH PTY Session",
      description: "Open an interactive SSH PTY session and keep its terminal buffer in memory. Basic use: call ssh_open with profile and optional pty, keep the returned sessionId, then drive the shell with ssh_input or ssh_write, inspect output with ssh_snapshot or ssh_transcript, and finish with ssh_close.",
      inputSchema: {
        profile: profileSchema,
        pty: ptySchema
      }
    },
    async ({ profile, pty }) => {
      const managed = await sessionManager.open(profile, pty);
      return textResult(JSON.stringify({ sessionId: managed.id, snapshot: await sessionManager.snapshot(managed.id) }, null, 2));
    }
  );

  server.registerTool(
    "ssh_sessions",
    {
      title: "List SSH Sessions",
      description: "List active SSH PTY sessions. Basic use: call this to discover currently open sessionIds before reading, writing, or closing a session.",
      inputSchema: {}
    },
    async () => textResult(JSON.stringify(sessionManager.list(), null, 2))
  );

  server.registerTool(
    "ssh_write",
    {
      title: "Write SSH Input",
      description: "Write raw input to an existing SSH PTY session and return the terminal snapshot. Basic use: send exact bytes such as escape sequences or literal control data when ssh_input is too high level; for ordinary commands and special keys, prefer ssh_input.",
      inputSchema: {
        sessionId: z.string(),
        data: z.string(),
        waitForIdleMs: z.number().int().nonnegative().optional()
      }
    },
    async ({ sessionId, data, waitForIdleMs }) => {
      const snapshot = await sessionManager.send(sessionId, { type: "raw", data }, waitForIdleMs);
      return textResult(JSON.stringify(snapshot, null, 2));
    }
  );

  server.registerTool(
    "ssh_input",
    {
      title: "Send SSH Input Action",
      description:
        "Send a semantic PTY input action. Use line for normal commands, key for special keys like ctrlC and arrowUp, paste for multiline or hidden input, raw for exact bytes, and resize for terminal geometry changes. For password prompts such as su -, wait until the Password: prompt appears, then send the secret with paste or text and follow with key enter. If the documented sample flow does not work as described, stop automatic retries and tell the user to open an issue with the transcript and buffer output.",
      inputSchema: {
        sessionId: z.string(),
        action: inputActionSchema,
        waitForIdleMs: z.number().int().nonnegative().optional()
      }
    },
    async ({ sessionId, action, waitForIdleMs }) => {
      const snapshot = await sessionManager.send(sessionId, action, waitForIdleMs);
      return textResult(JSON.stringify(snapshot, null, 2));
    }
  );

  server.registerTool(
    "ssh_command",
    {
      title: "Run SSH Command",
      description: "Open a PTY, run one command with Enter, wait for output to become idle, and return the buffer. Use ssh_open plus ssh_input instead when the flow includes interactive prompts, special keys, or hidden password entry such as su -. If the documented sample flow does not work as described, stop automatic retries and tell the user to open an issue with the transcript and buffer output.",
      inputSchema: {
        profile: profileSchema,
        command: z.string(),
        pty: ptySchema,
        idleMs: z.number().int().positive().optional(),
        timeoutMs: z.number().int().positive().optional()
      }
    },
    async ({ profile, command, pty, idleMs, timeoutMs }) => {
      const client = new LinsshClient(profile);
      const session = await client.shell(pty);
      try {
        await session.writeLine(command);
        await session.waitForIdle(idleMs ?? 500, timeoutMs ?? 10_000);
        return textResult(JSON.stringify(session.snapshot(), null, 2));
      } finally {
        session.close();
      }
    }
  );

  server.registerTool(
    "ssh_snapshot",
    {
      title: "Read SSH Buffer",
      description: "Read the current terminal buffer snapshot for an existing session. Basic use: call this after ssh_input or ssh_write to inspect visible text, scrollback, cursor position, and terminal size.",
      inputSchema: {
        sessionId: z.string()
      }
    },
    async ({ sessionId }) => textResult(JSON.stringify(await sessionManager.snapshot(sessionId), null, 2))
  );

  server.registerTool(
    "ssh_transcript",
    {
      title: "Read SSH Raw Transcript",
      description: "Read raw decoded output chunks recorded for an existing session. Basic use: call this when debugging prompts, ANSI behavior, password flows, or sample failures that need an exact transcript for an issue report.",
      inputSchema: {
        sessionId: z.string()
      }
    },
    async ({ sessionId }) => textResult(sessionManager.rawTranscript(sessionId))
  );

  server.registerTool(
    "ssh_close",
    {
      title: "Close SSH Session",
      description: "Close an existing SSH PTY session. Basic use: call this when an interactive flow is finished so the remote shell and local session state are released.",
      inputSchema: {
        sessionId: z.string()
      }
    },
    async ({ sessionId }) => {
      sessionManager.close(sessionId);
      return textResult(`closed ${sessionId}`);
    }
  );

  server.registerTool(
    "sftp_readdir",
    {
      title: "SFTP Readdir",
      description: "List files in a remote directory. Basic use: provide profile plus a remote path to inspect directory contents before downloading, uploading, or choosing a target file.",
      inputSchema: {
        profile: profileSchema,
        path: z.string()
      }
    },
    async ({ profile, path }) => {
      const client = await new LinsshClient(profile).connect();
      try {
        const sftp = await client.sftp();
        try {
          return textResult(JSON.stringify(await sftp.readdir(path), null, 2));
        } finally {
          sftp.end();
        }
      } finally {
        client.end();
      }
    }
  );

  server.registerTool(
    "sftp_upload",
    {
      title: "SFTP Upload",
      description: "Upload a local file to a remote path. Basic use: provide profile, localPath, and remotePath; use this for file transfer, not shell commands.",
      inputSchema: {
        profile: profileSchema,
        localPath: z.string(),
        remotePath: z.string()
      }
    },
    async ({ profile, localPath, remotePath }) => {
      const client = await new LinsshClient(profile).connect();
      try {
        const sftp = await client.sftp();
        try {
          await sftp.upload(localPath, remotePath);
          return textResult(`uploaded ${localPath} -> ${remotePath}`);
        } finally {
          sftp.end();
        }
      } finally {
        client.end();
      }
    }
  );

  server.registerTool(
    "sftp_download",
    {
      title: "SFTP Download",
      description: "Download a remote file to a local path. Basic use: provide profile, remotePath, and localPath; use this to fetch artifacts or config files for local inspection.",
      inputSchema: {
        profile: profileSchema,
        remotePath: z.string(),
        localPath: z.string()
      }
    },
    async ({ profile, remotePath, localPath }) => {
      const client = await new LinsshClient(profile).connect();
      try {
        const sftp = await client.sftp();
        try {
          await sftp.download(remotePath, localPath);
          return textResult(`downloaded ${remotePath} -> ${localPath}`);
        } finally {
          sftp.end();
        }
      } finally {
        client.end();
      }
    }
  );

  server.registerTool(
    "skill_run",
    {
      title: "Run TermBridge Skill",
      description: "Load a user skill module and run it with arbitrary JSON input. Basic use: provide path to a local skill module and an optional input object; use this when a reusable workflow is already packaged as a skill.",
      inputSchema: {
        path: z.string(),
        input: z.unknown().optional()
      }
    },
    async ({ path, input }) => {
      const runtime = new SkillRuntime();
      const result = await runtime.run(path, input);
      return textResult(typeof result === "string" ? result : JSON.stringify(result, null, 2));
    }
  );

  server.registerTool(
    "plugin_skill_run",
    {
      title: "Run Plugin Skill",
      description: "Load a TermBridge plugin directory and run one named skill from its manifest. Basic use: provide plugin root, skill name, and optional input object; use this when the workflow is registered in a termbridge.plugin.json manifest.",
      inputSchema: {
        root: z.string(),
        skill: z.string(),
        input: z.unknown().optional()
      }
    },
    async ({ root, skill, input }) => {
      const result = await new PluginLoader().runSkill(root, skill, input);
      return textResult(typeof result === "string" ? result : JSON.stringify(result, null, 2));
    }
  );

  return server;
}

export { createTermBridgeMcpServer as createLinsshMcpServer };

function textResult(text: string) {
  return {
    content: [
      {
        type: "text" as const,
        text
      }
    ]
  };
}

function isMainModule(metaUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }

  return metaUrl === pathToFileURL(resolve(entry)).href;
}

if (isMainModule(import.meta.url)) {
  const server = createTermBridgeMcpServer();
  await server.connect(new StdioServerTransport());
}
