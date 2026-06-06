import { z } from "zod";
import { Keys } from "../ssh/input.js";

export const authSchema = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("password"),
      password: z.string().describe("Password for SSH login authentication.")
    }),
    z.object({
      type: z.literal("privateKey"),
      privateKey: z.string().describe("PEM private key content."),
      passphrase: z.string().optional().describe("Optional passphrase for the private key.")
    }),
    z.object({
      type: z.literal("agent"),
      agent: z.string().optional().describe("Optional SSH agent socket path.")
    })
  ])
  .optional();

export const profileSchema = z.object({
  host: z.string().describe("SSH host name or IP address."),
  port: z.number().int().positive().optional().describe("SSH port. Defaults to 22."),
  username: z.string().describe("SSH username."),
  auth: authSchema,
  readyTimeout: z.number().int().positive().optional().describe("Optional SSH ready timeout in milliseconds."),
  keepaliveInterval: z.number().int().positive().optional().describe("Optional SSH keepalive interval in milliseconds.")
});

export const ptySchema = z
  .object({
    term: z.string().optional().describe("PTY terminal type such as xterm-256color."),
    cols: z.number().int().positive().optional().describe("PTY width in columns."),
    rows: z.number().int().positive().optional().describe("PTY height in rows."),
    env: z.record(z.string()).optional().describe("Optional environment variables for the shell.")
  })
  .optional();

export const inputActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("raw"),
    data: z
      .string()
      .describe("Send exact bytes with no translation. Use for escape sequences or prompts that need literal control data.")
  }),
  z.object({
    type: z.literal("text"),
    text: z.string().describe("Send plain text with no trailing Enter key.")
  }),
  z.object({
    type: z.literal("line"),
    text: z.string().optional().describe("Send text followed by Enter. Use for ordinary shell commands.")
  }),
  z.object({
    type: z.literal("key"),
    key: z
      .enum(Object.keys(Keys) as [keyof typeof Keys, ...(keyof typeof Keys)[]])
      .describe("Named special key. Supported keys: enter, lineFeed, ctrlC, ctrlD, ctrlV, tab, escape, backspace, arrowUp, arrowDown, arrowRight, arrowLeft.")
  }),
  z.object({
    type: z.literal("paste"),
    text: z
      .string()
      .describe("Paste text as one chunk. Useful for multiline input or hidden password prompts such as su - after the Password: prompt appears."),
    bracketed: z
      .boolean()
      .optional()
      .describe("Defaults to true for bracketed paste. Set false to send the text literally.")
  }),
  z.object({
    type: z.literal("resize"),
    cols: z.number().int().positive().describe("New terminal width in columns."),
    rows: z.number().int().positive().describe("New terminal height in rows.")
  })
]);
