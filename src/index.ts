export type {
  FileEntry,
  PtyOptions,
  SshAuth,
  SshProfile,
  TerminalSnapshot
} from "./core/types.js";
export { LinsshClient, LinsshClient as TermBridgeClient, openSshSession } from "./ssh/client.js";
export { Keys, bracketedPaste, encodeInputAction } from "./ssh/input.js";
export type { InputAction, KeyName } from "./ssh/input.js";
export { OutputRecorder } from "./ssh/outputRecorder.js";
export type { OutputRecord, OutputRecorderOptions } from "./ssh/outputRecorder.js";
export { SshSession } from "./ssh/session.js";
export { LinsshSftpClient, LinsshSftpClient as TermBridgeSftpClient } from "./sftp/client.js";
export { TerminalBuffer } from "./terminal/terminalBuffer.js";
export type {
  LinsshSkill,
  LinsshSkill as TermBridgeSkill,
  LinsshSkillContext,
  LinsshSkillContext as TermBridgeSkillContext,
  SkillSshApi
} from "./skills/types.js";
export { SkillRuntime } from "./skills/runtime.js";
export type {
  LinsshPluginManifest,
  LinsshPluginManifest as TermBridgePluginManifest,
  LinsshPluginSkill,
  LinsshPluginSkill as TermBridgePluginSkill,
  LoadedLinsshPlugin,
  LoadedLinsshPlugin as LoadedTermBridgePlugin
} from "./plugins/types.js";
export { PluginLoader } from "./plugins/pluginLoader.js";
export { SessionManager, type ManagedSession } from "./session/sessionManager.js";
export {
  createTermBridgeMcpServer,
  createTermBridgeMcpServer as createLinsshMcpServer
} from "./mcp/server.js";
