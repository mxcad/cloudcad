import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkProject() {
  const projectId = 'cmkew6xub000azoufp62frj8h';

  console.log('查询项目:', projectId);

  // 查询项目（不考虑软删除）
  const projectWithoutFilter = await prisma.fileSystemNode.findUnique({
    where: { id: projectId, isRoot: true },
  });

  console.log('项目（不考虑软删除）:', projectWithoutFilter);

  // 查询项目（考虑软删除）
  const projectWithFilter = await prisma.fileSystemNode.findFirst({
    where: {
      id: projectId,
      isRoot: true,
      deletedAt: null,
    },
  });

  console.log('项目（考虑软删除）:', projectWithFilter);

  // 查询所有项目
  const allProjects = await prisma.fileSystemNode.findMany({
    where: { isRoot: true },
    select: {
      id: true,
      name: true,
      deletedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  console.log('\n最近创建的10个项目:');
  allProjects.forEach((p) => {
    console.log(`- ${p.id}: ${p.name} (${p.deletedAt ? '已删除' : '正常'})`);
  });

  await prisma.$disconnect();
}

checkProject().catch(console.error);
