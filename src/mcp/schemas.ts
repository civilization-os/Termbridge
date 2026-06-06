import { z } from "zod";
import { Keys } from "../ssh/input.js";

export const authSchema = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("password"),
      password: z.string()
    }),
    z.object({
      type: z.literal("privateKey"),
      privateKey: z.string(),
      passphrase: z.string().optional()
    }),
    z.object({
      type: z.literal("agent"),
      agent: z.string().optional()
    })
  ])
  .optional();

export const profileSchema = z.object({
  host: z.string(),
  port: z.number().int().positive().optional(),
  username: z.string(),
  auth: authSchema,
  readyTimeout: z.number().int().positive().optional(),
  keepaliveInterval: z.number().int().positive().optional()
});

export const ptySchema = z
  .object({
    term: z.string().optional(),
    cols: z.number().int().positive().optional(),
    rows: z.number().int().positive().optional(),
    env: z.record(z.string()).optional()
  })
  .optional();

export const inputActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("raw"),
    data: z.string()
  }),
  z.object({
    type: z.literal("text"),
    text: z.string()
  }),
  z.object({
    type: z.literal("line"),
    text: z.string().optional()
  }),
  z.object({
    type: z.literal("key"),
    key: z.enum(Object.keys(Keys) as [keyof typeof Keys, ...(keyof typeof Keys)[]])
  }),
  z.object({
    type: z.literal("paste"),
    text: z.string(),
    bracketed: z.boolean().optional()
  }),
  z.object({
    type: z.literal("resize"),
    cols: z.number().int().positive(),
    rows: z.number().int().positive()
  })
]);
