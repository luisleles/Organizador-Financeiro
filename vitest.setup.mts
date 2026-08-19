import { TEST_DATABASE_URL } from "./vitest.database";

// Precisa valer antes de qualquer import do PrismaClient, que lê a URL na construção.
process.env.DATABASE_URL = TEST_DATABASE_URL;
