import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().default(8787),
  DATABASE_PATH: z.string().default(".data/algoworkspace.sqlite"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  NODE_ENV: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function env(): Env {
  return EnvSchema.parse({
    PORT: process.env.PORT,
    DATABASE_PATH: process.env.DATABASE_PATH,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
    NODE_ENV: process.env.NODE_ENV,
  });
}
