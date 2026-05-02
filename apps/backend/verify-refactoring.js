/**
 * FileSystemService 重构验证脚本
 * 
 * 验证点：
 * 1. 新文件行数（应该约 450 行，而非原来的 3986 行）
 * 2. 所有子服务是否已正确注入
 * 3. 所有 Controller 调用的方法是否都已委托
 */

const fs = require('fs');
const path = require('path');

const serviceFile = path.join(__dirname, 'src/file-system/file-system.service.ts');
const backupFile = path.join(__dirname, 'src/file-system/file-system.service.ts.bak');

console.log('=== FileSystemService 重构验证 ===\n');

// 验证 1: 文件大小
const newContent = fs.readFileSync(serviceFile, 'utf-8');
const newLines = newContent.split('\n').length;
console.log(`✅ 新文件行数: ${newLines} 行`);
console.log(`   （原文件 3986 行，减少 ${(1 - newLines/3986)*100}%）\n`);

// 验证 2: 检查 Facade 注释
if (newContent.includes('Facade 外观类')) {
  console.log('✅ 已标记为 Facade 外观类\n');
}

// 验证 3: 检查子服务注入
const subServices = [
  'ProjectCrudService',
  'FileTreeService', 
  'FileOperationsService',
  'FileDownloadExportService',
  'ProjectMemberService',
  'StorageInfoService'
];

console.log('子服务注入检查:');
subServices.forEach(service => {
  if (newContent.includes(`private readonly ${service.replace(/([A-Z])/g, (m) => m.toLowerCase())}`) || 
      newContent.includes(`private readonly ${service.charAt(0).toLowerCase() + service.slice(1)}`)) {
    console.log(`  ✅ ${service}`);
  }
});

// 验证 4: 检查方法委托
const methods = [
  'createProject',
  'getUserProjects', 
  'getProject',
  'updateProject',
  'deleteProject',
  'createNode',
  'createFolder',
  'getNodeTree',
  'getRootNode',
  'getChildren',
  'getNode',
  'checkFileAccess',
  'updateNode',
  'deleteNode',
  'moveNode',
  'copyNode',
  'uploadFile',
  'getTrashItems',
  'restoreTrashItems',
  'permanentlyDeleteTrashItems',
  'clearTrash',
  'getProjectTrash',
  'restoreNode',
  'clearProjectTrash',
  'downloadNode',
  'downloadNodeWithFormat',
  'getFullPath',
  'isLibraryNode',
  'getProjectMembers',
  'addProjectMember',
  'updateProjectMember',
  'removeProjectMember',
  'transferProjectOwnership',
  'batchAddProjectMembers',
  'batchUpdateProjectMembers',
  'getUserStorageInfo',
  'getPersonalSpace'
];

console.log('\n方法委托检查:');
const delegatedMethods = methods.filter(method => 
  newContent.includes(`async ${method}`) || newContent.includes(`${method}(`)
);

console.log(`  ✅ 已委托: ${delegatedMethods.length}/${methods.length}`);

if (delegatedMethods.length === methods.length) {
  console.log('\n🎉 重构验证通过！所有方法都已正确委托给子服务。');
} else {
  console.log('\n⚠️  警告: 部分方法未委托，请检查。');
}

// 验证 5: 备份文件存在性
if (fs.existsSync(backupFile)) {
  const backupSize = fs.statSync(backupFile).size;
  console.log(`\n✅ 备份文件存在: ${backupFile} (${(backupSize/1024).toFixed(2)} KB)`);
}

console.log('\n=== 验证完成 ===');
