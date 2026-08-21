const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// 配置
const config = {
  sourceDirectories: [
    path.join(__dirname, '..', 'data', 'block-library'),
    path.join(__dirname, '..', 'data', 'drawing-library')
  ],
  outputDir: path.join(__dirname, '..', 'data', 'thumbnail-export'),
  zipPath: path.join(__dirname, '..', 'data', 'thumbnails.zip')
};

// 查找所有缩略图文件，保持目录结构
function findThumbnails() {
  const thumbnails = [];
  let totalScanned = 0;

  function searchDirectory(dir) {
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          searchDirectory(fullPath);
        } else if (stat.isFile()) {
          totalScanned++;
          const ext = path.extname(file).toLowerCase();
          if (ext === '.jpg' && (file.endsWith('.dwg.jpg') || file.endsWith('.dxf.jpg'))) {
            thumbnails.push(fullPath);
          }
        }
      }
    } catch (error) {
      console.error(`搜索目录时出错: ${dir}`, error.message);
    }
  }

  config.sourceDirectories.forEach(dir => searchDirectory(dir));

  console.log(`\n扫描完成:`);
  console.log(`- 总文件数: ${totalScanned}`);
  console.log(`- 缩略图文件数: ${thumbnails.length}`);

  return thumbnails;
}

// 复制缩略图到输出目录，保持目录结构
async function copyThumbnails(thumbnails) {
  const dataDir = path.join(__dirname, '..', 'data');

  // 确保输出目录存在
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
  }

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < thumbnails.length; i++) {
    const sourcePath = thumbnails[i];
    const relativePath = path.relative(dataDir, sourcePath);
    const destPath = path.join(config.outputDir, relativePath);
    const destDir = path.dirname(destPath);

    try {
      // 确保目标目录存在
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      // 复制文件
      fs.copyFileSync(sourcePath, destPath);
      successCount++;
    } catch (error) {
      failCount++;
      if (failCount <= 10) {
        console.error(`复制失败: ${sourcePath}`, error.message);
      }
    }

    // 显示进度
    if ((i + 1) % 1000 === 0 || i === thumbnails.length - 1) {
      process.stdout.clearLine();
      process.stdout.cursorTo(0);
      process.stdout.write(`复制进度: ${i + 1}/${thumbnails.length} (${Math.round((i + 1) / thumbnails.length * 100)}%)`);
    }
  }

  console.log('\n');
  console.log(`复制完成: 成功 ${successCount}, 失败 ${failCount}`);

  return { successCount, failCount };
}

// 压缩目录为 zip
async function createZip() {
  console.log('\n开始压缩...');

  // 删除已存在的 zip 文件
  if (fs.existsSync(config.zipPath)) {
    fs.unlinkSync(config.zipPath);
  }

  // 使用 PowerShell 的 Compress-Archive 命令压缩
  const command = `powershell -Command "Compress-Archive -Path '${config.outputDir}\\*' -DestinationPath '${config.zipPath}' -Force"`;

  try {
    await execAsync(command, { encoding: 'utf8', timeout: 600000 });
    const stats = fs.statSync(config.zipPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`\n压缩完成: ${config.zipPath}`);
    console.log(`压缩包大小: ${sizeMB} MB`);
    return true;
  } catch (error) {
    console.error('压缩失败:', error.message);
    return false;
  }
}

// 主函数
async function main() {
  try {
    console.log('开始导出缩略图...\n');
    console.log(`输出目录: ${config.outputDir}`);
    console.log(`压缩包: ${config.zipPath}`);

    // 查找所有缩略图
    const thumbnails = findThumbnails();

    if (thumbnails.length === 0) {
      console.log('\n没有找到缩略图文件！');
      return;
    }

    // 复制缩略图
    console.log('\n开始复制缩略图...');
    const startTime = Date.now();
    const { successCount } = await copyThumbnails(thumbnails);
    const copyTime = ((Date.now() - startTime) / 1000).toFixed(2);

    if (successCount === 0) {
      console.log('\n没有成功复制任何缩略图！');
      return;
    }

    // 压缩
    console.log(`复制耗时: ${copyTime} 秒`);
    await createZip();

    console.log('\n==============================');
    console.log('缩略图导出完成!');
    console.log(`总计: ${successCount} 个缩略图`);
    console.log('==============================');

  } catch (error) {
    console.error('执行过程中出错:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

// 执行主函数
main();
