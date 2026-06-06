import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PluginLoader } from "./pluginLoader.js";

describe("PluginLoader", () => {
  it("loads plugin manifest and named skills", async () => {
    const loader = new PluginLoader();
    const root = resolve("examples/plugins/ops");
    const plugin = await loader.load(root);
    const skill = await loader.loadSkill(root, "run-command");

    expect(plugin.name).toBe("ops");
    expect(skill.name).toBe("run-command");
  });
});
