import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const dbUrl = `postgresql://${process.env.DB_USERNAME || 'postgres'}:${encodeURIComponent(process.env.DB_PASSWORD || 'password')}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_DATABASE || 'cloucad'}`;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: dbUrl }),
});

async function main() {
  const users = await prisma.$queryRaw`
    SELECT id, email, username, "roleId", status
    FROM users
    WHERE email IN ('admin@cloucad.com', 'test@cloucad.com')
  `;

  console.table(users);

  // 同时查看角色信息
  const roles = await prisma.$queryRaw`SELECT id, name FROM roles`;
  console.log('\n角色列表:');
  console.table(roles);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
