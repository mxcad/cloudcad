const fs = require('fs');

const content = fs.readFileSync('src/mxcad/services/filesystem-node.service.ts', 'utf8');

// Normalize line endings to \n for comparison, but keep original for writing
const normalizedContent = content.replace(/\r\n/g, '\n');

let newContent = normalizedContent;

// Replace 1: checkProjectPermission
newContent = newContent.replace(
  `      // 检查项目成员权限
      const membership = await this.prisma.projectMember.findFirst({
        where: {
          userId,
          nodeId: projectId,
        },
      });

      return !!membership;`,
  `      // 检查节点访问权限
      const access = await this.prisma.fileAccess.findUnique({
        where: {
          userId_nodeId: { userId, nodeId: projectId },
        },
      });

      return !!access;`
);

// Replace 2: userProject query
newContent = newContent.replace(
  `        const userProject = await this.prisma.projectMember.findFirst({
          where: {
            userId: user.id,
            user: {
              status: 'ACTIVE'
            }
          },
          include: {
            node: {
              select: {
                id: true,
                name: true,
                isRoot: true,
              },
            },
            user: {
              select: {
                id: true,
                username: true,
                role: true,
                status: true,
              },
            },
          },
          orderBy: {
            id: 'asc'
          }
        });

        if (userProject && userProject.node.isRoot) {
          projectId = userProject.nodeId;
          parentId = projectId; // 上传到项目根目录
          this.logger.log(\`✅ 使用用户默认项目: projectId=\${projectId} (\${userProject.node.name})\`);`,
  `        const userAccess = await this.prisma.fileAccess.findFirst({
          where: {
            userId: user.id,
            node: { isRoot: true },
          },
          include: {
            node: { select: { id: true, name: true, isRoot: true } },
          },
          orderBy: { createdAt: 'asc' }
        });

        if (userAccess && userAccess.node.isRoot) {
          projectId = userAccess.nodeId;
          parentId = projectId; // 上传到项目根目录
          this.logger.log('✅ 使用用户默认项目: projectId=' + projectId + ' (' + userAccess.node.name + ')');`
);

// Replace 3: projectMember.create
newContent = newContent.replace(
  `          // 添加用户为项目所有者
          await this.prisma.projectMember.create({
            data: {
              userId: user.id,
              nodeId: defaultProject.id,
              role: 'OWNER',
            },
          });`,
  `          // 添加用户为项目所有者
          await this.prisma.fileAccess.create({
            data: {
              userId: user.id,
              nodeId: defaultProject.id,
              role: 'OWNER',
            },
          });`
);

// Convert back to Windows line endings
const finalContent = newContent.replace(/\n/g, '\r\n');

fs.writeFileSync('src/mxcad/services/filesystem-node.service.ts', finalContent);
console.log('Done');