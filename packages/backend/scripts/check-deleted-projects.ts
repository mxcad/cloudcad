import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDeletedProjects() {
  try {
    // 查询所有项目（isRoot=true）
    const allProjects = await prisma.fileSystemNode.findMany({
      where: { isRoot: true },
      select: {
        id: true,
        name: true,
        ownerId: true,
        deletedAt: true,
        projectStatus: true,
      },
    });

    console.log(`\n总项目数: ${allProjects.length}`);

    // 查询已删除的项目
    const deletedProjects = await prisma.fileSystemNode.findMany({
      where: {
        isRoot: true,
        deletedAt: { not: null },
      },
      select: {
        id: true,
        name: true,
        ownerId: true,
        deletedAt: true,
        projectStatus: true,
      },
    });

    console.log(`已删除项目数: ${deletedProjects.length}`);

    if (deletedProjects.length > 0) {
      console.log('\n已删除项目列表:');
      deletedProjects.forEach((project) => {
        console.log(`- ID: ${project.id}`);
        console.log(`  名称: ${project.name}`);
        console.log(`  所有者: ${project.ownerId}`);
        console.log(`  删除时间: ${project.deletedAt}`);
        console.log(`  状态: ${project.projectStatus}`);
        console.log('');
      });
    } else {
      console.log('\n没有找到已删除的项目');
    }

    // 检查某个用户的项目（假设有用户）
    const users = await prisma.user.findMany({ take: 1 });
    if (users.length > 0) {
      const userId = users[0].id;
      console.log(`\n检查用户 ${userId} 的已删除项目:`);

      const userDeletedProjects = await prisma.fileSystemNode.findMany({
        where: {
          isRoot: true,
          deletedAt: { not: null },
          OR: [
            { ownerId: userId },
            {
              projectMembers: {
                some: { userId },
              },
            },
          ],
        },
        select: {
          id: true,
          name: true,
          ownerId: true,
          deletedAt: true,
        },
      });

      console.log(
        `用户 ${userId} 的已删除项目数: ${userDeletedProjects.length}`
      );

      if (userDeletedProjects.length > 0) {
        console.log('用户已删除项目列表:');
        userDeletedProjects.forEach((project) => {
          console.log(`- ${project.name} (${project.id})`);
        });
      }
    }
  } catch (error) {
    console.error('检查失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDeletedProjects();
