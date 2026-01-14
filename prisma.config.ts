import { defineConfig } from "prisma/config";
import { env } from "process";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrate: {
    datasourceUrl: env.DATABASE_URL,
    ...(process.env.SHADOW_DATABASE_URL
      ? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL }
      : {}),
  },
});
