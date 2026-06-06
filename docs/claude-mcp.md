# Use TermBridge with Claude Desktop MCP

This guide covers the path from cloning the repository to configuring Claude Desktop as an MCP client, then adding a custom skill task.

Claude Desktop local MCP servers are configured through `claude_desktop_config.json` with a `command` and `args` entry. See the official MCP local server guide for current platform paths and troubleshooting: https://modelcontextprotocol.io/docs/develop/connect-local-servers

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
Desktop with plain `pnpm mcp`, because pnpm writes its script banner to stdout
and stdout is reserved for MCP JSON-RPC messages.

## Configure Claude Desktop

Open the Claude Desktop config file.

macOS:

```text
~/Library/Application Support/Claude/claude_desktop_config.json
```

Windows:

```text
%APPDATA%\Claude\claude_desktop_config.json
```

Add TermBridge under `mcpServers`:

```json
{
  "mcpServers": {
    "termbridge": {
      "command": "node",
      "args": [
        "/ABS/PATH/Termbridge/dist/mcp/server.js"
      ]
    }
  }
}
```

Replace `/ABS/PATH/Termbridge` with the real absolute path, for example:

```json
{
  "mcpServers": {
    "termbridge": {
      "command": "node",
      "args": [
        "/Users/you/dev/Termbridge/dist/mcp/server.js"
      ]
    }
  }
}
```

Fully quit and restart Claude Desktop after saving the config.

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

If Claude does not show TermBridge tools:

- Restart Claude Desktop completely.
- Confirm `claude_desktop_config.json` is valid JSON.
- Use absolute paths in `args`.
- Run `node /ABS/PATH/Termbridge/dist/mcp/server.js` manually to catch startup errors.
- If you start the server through pnpm during development, use `pnpm --silent mcp`.
  Plain `pnpm mcp` prints pnpm lifecycle output to stdout and can break the MCP
  stdio protocol.
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
