import { PrismaClient } from "@prisma/client";

// In development, Next.js hot-reloads modules. Without this guard every reload
// would open a brand-new database connection pool until Postgres runs out.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
