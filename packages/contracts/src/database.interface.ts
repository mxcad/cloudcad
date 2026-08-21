import type { Prisma, PrismaClient } from '@cloudcad/db';

export type IDatabaseService = PrismaClient;
export type ITransactionClient = Prisma.TransactionClient;
