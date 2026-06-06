# TermBridge

[![npm version](https://img.shields.io/npm/v/%40civilization-os%2Ftermbridge.svg)](https://www.npmjs.com/package/@civilization-os/termbridge)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-339933.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-vitest-6e9f18.svg)](https://vitest.dev/)
[![MCP](https://img.shields.io/badge/MCP-ready-444444.svg)](https://modelcontextprotocol.io/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

TypeScript SSH/SFTP toolkit with real PTY sessions, an Xshell-style terminal buffer, MCP tools, and user-owned skills/plugins.

`TermBridge` is meant for agents and automation systems that need to interact with remote shells like a human terminal client does: run commands, handle prompts, paste text, send Ctrl-C, inspect the live terminal screen, operate full-screen programs like `top`, and fall back to SFTP for file movement.

## Features

- SSH shell sessions allocate a real remote PTY through `ssh2`.
- Terminal output is parsed by headless xterm, so ANSI/VT output, cursor movement, full-screen TUIs, and scrollback are represented as a terminal buffer.
- Buffer inspection supports visible screen text, scrollback text, serialized terminal state, cursor position, and terminal size.
- Semantic input actions support text, line, raw bytes, paste, resize, Ctrl-C, Ctrl-V, Enter, Tab, arrows, Escape, Backspace, and Ctrl-D.
- `waitForIdle()` and `waitForText()` support command-style and prompt-style workflows.
- SFTP helpers support directory listing, stat, upload, download, mkdir, and unlink.
- MCP server exposes SSH, SFTP, session, transcript, skill, and plugin tools.
- Skills are runtime-loaded modules for user business flows.
- Plugins are directories with a `termbridge.plugin.json` manifest, similar in spirit to agent plugin packages.
- Docker integration tests cover real SSH, SFTP, user switching, Ctrl-C, paste, and `top` live buffer reads.

## Install

```bash
pnpm install
pnpm build
```

Runtime requires Node.js 22 or newer.

## Quick Start

Open an interactive SSH terminal:

```bash
pnpm dev ssh \
  --host 127.0.0.1 \
  --port 2222 \
  --username linssh \
  --password linssh-pass
```

Run one command and print the terminal snapshot:

```bash
pnpm dev command \
  --host 127.0.0.1 \
  --port 2222 \
  --username linssh \
  --password linssh-pass \
  --cmd "whoami"
```

Use SFTP:

```bash
pnpm dev sftp ls \
  --host 127.0.0.1 \
  --port 2222 \
  --username linssh \
  --password linssh-pass \
  --path /config
```

## Library Usage

```ts
import { TermBridgeClient } from "@civilization-os/termbridge";

const client = new TermBridgeClient({
  host: "127.0.0.1",
  port: 2222,
  username: "linssh",
  auth: {
    type: "password",
    password: "linssh-pass"
  }
});

const session = await client.shell({ cols: 120, rows: 40 });

try {
  await session.send({ type: "line", text: "whoami" });
  await session.waitForText("linssh");

  console.log(session.buffer.getVisibleText());
  console.log(session.snapshot());
} finally {
  session.close();
}
```

## PTY Input

Interactive sessions accept semantic actions:

```ts
await session.send({ type: "line", text: "ls -la" });
await session.send({ type: "text", text: "hello" });
await session.send({ type: "paste", text: "multi\nline\ntext" });
await session.send({ type: "key", key: "ctrlC" });
await session.send({ type: "key", key: "ctrlV" });
await session.send({ type: "resize", cols: 160, rows: 48 });
await session.send({ type: "raw", data: "\x1b[A" });
```

Available key names include `enter`, `lineFeed`, `ctrlC`, `ctrlD`, `ctrlV`, `tab`, `escape`, `backspace`, `arrowUp`, `arrowDown`, `arrowRight`, and `arrowLeft`.

## Terminal Buffer

`TermBridge` keeps both a parsed terminal buffer and a raw decoded output recorder.

```ts
const snapshot = session.snapshot();

snapshot.visibleText;
snapshot.scrollbackText;
snapshot.serialized;
snapshot.cursor;
snapshot.size;

session.buffer.getVisibleText();
session.buffer.getScrollbackText();
session.buffer.serialize();
session.recorder.text();
```

For prompt-style flows, wait for text:

```ts
await session.send({ type: "line", text: "su -" });
await session.waitForText(/Password:/);
await session.send({ type: "line", text: "secret" });
await session.send({ type: "line", text: "whoami" });
await session.waitForText(/\broot\b/);
```

For full-screen TUI programs:

```ts
await session.send({ type: "line", text: "top" });
await session.waitForText(/PID|COMMAND|Tasks:/);

const screen = session.snapshot().visibleText;

await session.send({ type: "raw", data: "q" });
```

## SFTP

```ts
const client = await new TermBridgeClient(profile).connect();
const sftp = await client.sftp();

try {
  const entries = await sftp.readdir("/tmp");
  await sftp.download("/tmp/remote.txt", "./remote.txt");
  await sftp.upload("./local.txt", "/tmp/local.txt");
} finally {
  sftp.end();
  client.end();
}
```

## MCP Server

Run the MCP server over stdio for local development:

```bash
pnpm --silent mcp
```

After build:

```bash
node dist/mcp/server.js
```

The package also exposes a binary:

```bash
termbridge-mcp
```

Stdio MCP servers exit when their stdin closes. If you run the command from a
non-interactive shell without an MCP client attached, it may start and then exit
with code 0. When configuring an MCP client, prefer `node dist/mcp/server.js` or
the `termbridge-mcp` binary after build; avoid `pnpm mcp` because pnpm writes its
lifecycle banner to stdout, which can corrupt the MCP stdio protocol.

Registered MCP tools include:

- `ssh_open`
- `ssh_sessions`
- `ssh_write`
- `ssh_input`
- `ssh_command`
- `ssh_snapshot`
- `ssh_transcript`
- `ssh_close`
- `sftp_readdir`
- `sftp_upload`
- `sftp_download`
- `skill_run`
- `plugin_skill_run`

For Claude Desktop setup and skill task examples, see [docs/claude-mcp.md](docs/claude-mcp.md).

## Skills

A skill is a user-owned module that composes SSH, SFTP, buffers, and prompts into a business flow.

```ts
import type { TermBridgeSkill } from "@civilization-os/termbridge";

export default {
  name: "uptime-check",
  description: "Run uptime and return the terminal buffer.",
  async run(ctx, input) {
    const session = await ctx.ssh.open(input.profile);
    try {
      await session.send({ type: "line", text: "uptime" });
      await session.waitForIdle(300);
      return session.buffer.getVisibleText();
    } finally {
      session.close();
    }
  }
} satisfies TermBridgeSkill;
```

Run a skill file:

```bash
pnpm dev skill --path ./skills/uptime-check.mjs --input '{"profile":{"host":"127.0.0.1","port":2222,"username":"linssh","auth":{"type":"password","password":"linssh-pass"}}}'
```

## Plugins

A plugin is a directory with a manifest and one or more skills.

```text
my-plugin/
  termbridge.plugin.json
  skills/
    run-command.mjs
```

`termbridge.plugin.json`:

```json
{
  "name": "ops",
  "version": "0.1.0",
  "description": "Operational SSH workflows.",
  "skills": [
    {
      "name": "run-command",
      "path": "skills/run-command.mjs",
      "description": "Run a command in a PTY and return the buffer."
    }
  ]
}
```

Run a plugin skill:

```bash
pnpm dev plugin run \
  --root examples/plugins/ops \
  --skill run-command \
  --input '{"profile":{"host":"127.0.0.1","port":2222,"username":"linssh","auth":{"type":"password","password":"linssh-pass"}},"command":"uptime"}'
```

## Docker Test Fixture

Start a local SSH/SFTP fixture:

```bash
pnpm docker:ssh
```

Stop it:

```bash
pnpm docker:ssh:stop
```

Run integration tests:

```bash
pnpm test:integration
```

The fixture uses Docker if available, or Podman through the Docker-compatible CLI. The integration suite starts an OpenSSH container on `127.0.0.1:2222`, prepares a test user and SFTP directory, runs the tests, then cleans up the container.

Covered integration cases:

- PTY command execution and terminal buffer reads.
- Paste and Ctrl-C input.
- `whoami`, `su -`, and post-switch `whoami`.
- `top` full-screen live buffer inspection.
- SFTP list, download, and upload.

## Development

```bash
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

Useful scripts:

```bash
pnpm dev --help
pnpm --silent mcp
pnpm docker:ssh
pnpm docker:ssh:stop
```

## Architecture

```text
src/core       shared SSH profile, PTY, snapshot, and SFTP types
src/terminal   headless xterm buffer and serialization
src/ssh        ssh2 client, PTY session, input actions, output recorder
src/sftp       SFTP wrapper
src/session    long-lived session registry for MCP and agents
src/skills     user skill runtime
src/plugins    plugin manifest loader
src/mcp        MCP tool server
```

## License

MIT.
