import { readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import type { LinsshSkill } from "../skills/types.js";
import { SkillRuntime } from "../skills/runtime.js";
import type { LinsshPluginManifest, LoadedLinsshPlugin } from "./types.js";

const manifestNames = ["termbridge.plugin.json", "linssh.plugin.json", "plugin.json"] as const;

export class PluginLoader {
  constructor(private readonly skillRuntime = new SkillRuntime()) {}

  async load(root: string): Promise<LoadedLinsshPlugin> {
    const pluginRoot = resolve(root);
    const attempts = manifestNames.map((name) => join(pluginRoot, name));
    for (const manifestPath of attempts) {
      try {
        const manifest = parseManifest(await readFile(manifestPath, "utf8"), manifestPath);
        return {
          ...manifest,
          root: pluginRoot,
          manifestPath
        };
      } catch (error) {
        if (isMissingFile(error)) {
          continue;
        }
        throw error;
      }
    }
    throw new Error(`No TermBridge plugin manifest found in ${pluginRoot}`);
  }

  async loadSkill(pluginRoot: string, skillName: string): Promise<LinsshSkill> {
    const plugin = await this.load(pluginRoot);
    const skill = plugin.skills?.find((candidate) => candidate.name === skillName);
    if (!skill) {
      throw new Error(`Plugin ${plugin.name} does not define skill ${skillName}`);
    }
    return this.skillRuntime.load(resolvePluginPath(plugin.root, skill.path));
  }

  async runSkill(pluginRoot: string, skillName: string, input: unknown): Promise<unknown> {
    const skill = await this.loadSkill(pluginRoot, skillName);
    return skill.run(this.skillRuntime.context, input);
  }
}

function parseManifest(raw: string, manifestPath: string): LinsshPluginManifest {
  const parsed = JSON.parse(raw) as unknown;
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as { name?: unknown }).name !== "string"
  ) {
    throw new Error(`Invalid TermBridge plugin manifest: ${manifestPath}`);
  }
  return parsed as LinsshPluginManifest;
}

function resolvePluginPath(root: string, path: string): string {
  return isAbsolute(path) ? path : join(root, path);
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT";
}
