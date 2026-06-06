import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, it } from "vitest";

const clients: Client[] = [];

afterEach(async () => {
  await Promise.all(
    clients.splice(0).map(async (client) => {
      await client.close();
    })
  );
});

describe("MCP server", () => {
  it("accepts stdio connections from the TypeScript entrypoint", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", "src/mcp/server.ts"],
      cwd: process.cwd(),
      stderr: "pipe"
    });

    const client = new Client({ name: "vitest", version: "0.0.0" }, { capabilities: {} });
    clients.push(client);

    await client.connect(transport, { timeout: 5_000 });
    const tools = await client.listTools();

    expect(tools.tools.length).toBeGreaterThan(0);
    expect(tools.tools.some((tool) => tool.name === "ssh_command")).toBe(true);
  }, 10_000);
});
