import { pathToFileURL } from "node:url";
import { LinsshClient } from "../ssh/client.js";
import type { LinsshSkill, LinsshSkillContext } from "./types.js";

export interface SkillRuntimeOptions {
  logger?: LinsshSkillContext["logger"];
}

export class SkillRuntime {
  readonly context: LinsshSkillContext;

  constructor(options: SkillRuntimeOptions = {}) {
    this.context = {
      ssh: {
        async connect(profile) {
          return new LinsshClient(profile).connect();
        },
        async open(profile, ptyOptions) {
          return new LinsshClient(profile).shell(ptyOptions);
        },
        async sftp(profile) {
          const client = await new LinsshClient(profile).connect();
          return client.sftp({ closeClientOnEnd: true });
        }
      },
      logger: options.logger ?? console
    };
  }

  async load(path: string): Promise<LinsshSkill> {
    const moduleUrl = pathToFileURL(path).href;
    const loaded = (await import(moduleUrl)) as { default?: unknown; skill?: unknown };
    const candidate = loaded.default ?? loaded.skill;
    if (!isSkill(candidate)) {
      throw new Error(`Module ${path} does not export a LinsshSkill`);
    }
    return candidate;
  }

  async run(path: string, input: unknown): Promise<unknown> {
    const skill = await this.load(path);
    return skill.run(this.context, input);
  }
}

function isSkill(value: unknown): value is LinsshSkill {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    "run" in value &&
    typeof (value as { name: unknown }).name === "string" &&
    typeof (value as { run: unknown }).run === "function"
  );
}
