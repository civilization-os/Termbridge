export interface LinsshPluginManifest {
  name: string;
  version?: string;
  description?: string;
  skills?: LinsshPluginSkill[];
  mcp?: {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
  };
}

export interface LinsshPluginSkill {
  name: string;
  path: string;
  description?: string;
}

export interface LoadedLinsshPlugin extends LinsshPluginManifest {
  root: string;
  manifestPath: string;
}
