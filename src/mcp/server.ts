#!/usr/bin/env node
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
      description: "Open an interactive SSH PTY session and keep its terminal buffer in memory.",
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
      description: "List active SSH PTY sessions.",
      inputSchema: {}
    },
    async () => textResult(JSON.stringify(sessionManager.list(), null, 2))
  );

  server.registerTool(
    "ssh_write",
    {
      title: "Write SSH Input",
      description: "Write raw input to an existing SSH PTY session and return the terminal snapshot.",
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
      description: "Send a semantic input action such as line, key, paste, ctrlC, ctrlV, or resize.",
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
      description: "Open a PTY, run one command, wait for output to become idle, and return the buffer.",
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
      description: "Read the current terminal buffer snapshot for an existing session.",
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
      description: "Read raw decoded output chunks recorded for an existing session.",
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
      description: "Close an existing SSH PTY session.",
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
      description: "List files in a remote directory.",
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
      description: "Upload a local file to a remote path.",
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
      description: "Download a remote file to a local path.",
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
      description: "Load a user skill module and run it with arbitrary JSON input.",
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
      description: "Load a TermBridge plugin directory and run one named skill from its manifest.",
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createTermBridgeMcpServer();
  await server.connect(new StdioServerTransport());
}
