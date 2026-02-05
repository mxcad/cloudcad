import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkExternalReference() {
  const nodeId = 'cml92vbqy0005xkufgnc96hdi';

  console.log('查询节点:', nodeId);

  // 查询节点
  const node = await prisma.fileSystemNode.findUnique({
    where: { id: nodeId },
    select: {
      id: true,
      name: true,
      fileHash: true,
      hasMissingExternalReferences: true,
      missingExternalReferencesCount: true,
      externalReferencesJson: true,
      path: true,
    },
  });

  console.log('节点信息:', JSON.stringify(node, null, 2));

  await prisma.$disconnect();
}

checkExternalReference().catch(console.error);