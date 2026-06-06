# Use TermBridge with Claude CLI MCP

This guide covers the path from cloning the repository to configuring Claude CLI as an MCP client, then adding a custom skill task.

## Clone and Build

```bash
git clone git@github.com:civilization-os/Termbridge.git
cd Termbridge

pnpm install
pnpm build
```

Optional verification:

```bash
pnpm typecheck
pnpm test
pnpm test:integration
```

Manually confirm the MCP server can start:

```bash
node dist/mcp/server.js
```

This is a stdio MCP server. It waits while stdin is open, and exits normally
when stdin closes. Press `Ctrl-C` to stop it in an interactive shell. For
development without building, use `pnpm --silent mcp`; do not configure Claude
CLI with plain `pnpm mcp`, because pnpm writes its script banner to stdout
and stdout is reserved for MCP JSON-RPC messages.

## Configure Claude CLI

Claude CLI supports MCP server management through `claude mcp`.

Linux or macOS:

```bash
claude mcp add --transport stdio termbridge -- \
  node /ABS/PATH/Termbridge/dist/mcp/server.js
```

If you are already in the repository root after `pnpm build`, this also works:

```bash
claude mcp add --transport stdio termbridge -- \
  node "$(pwd)/dist/mcp/server.js"
```

Windows PowerShell:

```powershell
claude mcp add --transport stdio termbridge -- `
  node "$PWD\dist\mcp\server.js"
```

Windows with an explicit absolute path:

```powershell
claude mcp add --transport stdio termbridge -- `
  node "C:\ABS\PATH\Termbridge\dist\mcp\server.js"
```

Verify the server was added:

```bash
claude mcp get termbridge
claude mcp list
```

Inside Claude CLI, use `/mcp` to inspect connection status and available tools.

Do not use `pnpm mcp` in Claude CLI config. `pnpm` writes its lifecycle banner to stdout, and MCP stdio requires stdout to contain only protocol messages.

## Verify in Claude

Ask Claude:

```text
Use termbridge to connect to 127.0.0.1:2222 with username linssh and password linssh-pass. Run whoami and return the terminal buffer.
```

A more explicit tool request:

```text
Call termbridge ssh_command with:
profile = {
  host: "127.0.0.1",
  port: 2222,
  username: "linssh",
  auth: { type: "password", password: "linssh-pass" }
}
command = "whoami"
```

Interactive PTY example:

```text
Open an SSH session with termbridge, run top, wait until the buffer contains PID or COMMAND, read the current screen, then send q to exit.
```

## Available MCP Tools

TermBridge currently registers:

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

## Add a Skill Task

Recommended layout:

```text
examples/plugins/ops/
  termbridge.plugin.json
  skills/
    check-disk.mjs
```

Create `examples/plugins/ops/skills/check-disk.mjs`:

```js
export default {
  name: "check-disk",
  description: "Check remote disk usage with df -h.",
  async run(ctx, input) {
    const session = await ctx.ssh.open(input.profile, {
      cols: 120,
      rows: 40
    });

    try {
      await session.send({ type: "line", text: "df -h" });
      await session.waitForIdle(500, 10000);

      return {
        visibleText: session.buffer.getVisibleText(),
        scrollbackText: session.buffer.getScrollbackText()
      };
    } finally {
      session.close();
    }
  }
};
```

Register the skill in `examples/plugins/ops/termbridge.plugin.json`:

```json
{
  "name": "ops",
  "version": "0.1.0",
  "description": "Example TermBridge plugin with operational SSH workflows.",
  "skills": [
    {
      "name": "run-command",
      "path": "skills/run-command.mjs"
    },
    {
      "name": "list-dir",
      "path": "skills/list-dir.mjs"
    },
    {
      "name": "check-disk",
      "path": "skills/check-disk.mjs",
      "description": "Check remote disk usage with df -h."
    }
  ]
}
```

Local test:

```bash
pnpm dev plugin run \
  --root examples/plugins/ops \
  --skill check-disk \
  --input '{"profile":{"host":"127.0.0.1","port":2222,"username":"linssh","auth":{"type":"password","password":"linssh-pass"}}}'
```

Claude request:

```text
Call termbridge plugin_skill_run:
root = "/ABS/PATH/Termbridge/examples/plugins/ops"
skill = "check-disk"
input = {
  profile: {
    host: "127.0.0.1",
    port: 2222,
    username: "linssh",
    auth: { type: "password", password: "linssh-pass" }
  }
}
```

## Troubleshooting

If Claude CLI does not show TermBridge tools:

- Restart the client completely.
- Use an absolute path in the configured `node /ABS/PATH/Termbridge/dist/mcp/server.js` command.
- Run `node /ABS/PATH/Termbridge/dist/mcp/server.js` manually to catch startup errors.
- If you start the server through pnpm during development, use `pnpm --silent mcp`.
  Plain `pnpm mcp` prints pnpm lifecycle output to stdout and can break the MCP
  stdio protocol.
- If Claude CLI reports an MCP connection error such as `32000`, first check
  whether the configured command is `pnpm mcp`. Replace it with
  `node /ABS/PATH/Termbridge/dist/mcp/server.js` or re-add it with
  `claude mcp add --transport stdio termbridge -- node /ABS/PATH/Termbridge/dist/mcp/server.js`.
- In Claude CLI, run `claude mcp get termbridge` and `/mcp` to inspect the
  configured server and its live connection status.
- Check Claude MCP logs.

macOS logs:

```bash
tail -n 50 -f ~/Library/Logs/Claude/mcp*.log
```

Windows logs:

```text
%APPDATA%\Claude\logs
```

## Security Notes

Do not commit SSH passwords or private keys. Prefer SSH agent authentication for routine use, or pass credentials as MCP tool input only when needed.
