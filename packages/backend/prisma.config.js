import 'dotenv/config';
import { defineConfig } from 'prisma/config';
export default defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: {
        path: 'prisma/migrations',
        seed: 'node prisma/seed.js',
    },
    datasource: {
        url: process.env.DATABASE_URL ||
            'postgresql://postgres:password@localhost:5432/cloudcad',
    },
});
//# sourceMappingURL=prisma.config.js.map