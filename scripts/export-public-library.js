const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const BACKEND_NM = path.join(ROOT, 'packages', 'backend', 'node_modules');
const DATA_DIR = path.join(ROOT, 'data');
const FILES_DATA_DIR = path.join(DATA_DIR, 'files');
const DOTENV_PATH = path.join(ROOT, 'packages', 'backend', '.env');
const PROGRESS_PATH = path.join(__dirname, 'export-library-progress.json');

function loadFromPnpm(moduleName) {
  const storeDir = path.join(ROOT, 'node_modules', '.pnpm');
  const match = fs.readdirSync(storeDir).find(e => e.startsWith(moduleName + '@'));
  if (!match) throw new Error(`[${moduleName}] not found. Run: pnpm add -D ${moduleName}`);
  return require(path.join(storeDir, match, 'node_modules', moduleName));
}

if (!fs.existsSync(DOTENV_PATH)) {
  console.error('ERROR: .env not found at', DOTENV_PATH);
  process.exit(1);
}
if (!fs.existsSync(FILES_DATA_DIR)) {
  console.error('ERROR: files data directory not found at', FILES_DATA_DIR);
  process.exit(1);
}

const { Pool } = loadFromPnpm('pg');
const archiver = require(path.join(BACKEND_NM, 'archiver'));

function parseEnv(filePath) {
  const text = fs.readFileSync(filePath, 'utf-8');
  const env = {};
  for (const line of text.split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i === -1) continue;
    let k = s.slice(0, i).trim(), v = s.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[k] = v;
  }
  return env;
}

function fmtDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h${m % 60}m${s % 60}s` : m > 0 ? `${m}m${s % 60}s` : `${s}s`;
}

const env = parseEnv(DOTENV_PATH);
const DATABASE_URL = env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not found in .env');
  process.exit(1);
}
const pool = new Pool({ connectionString: DATABASE_URL });

function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf-8'));
  } catch {
    return {
      drawing: { processedIds: [], completed: false },
      block: { processedIds: [], completed: false },
    };
  }
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2), 'utf-8');
}

async function getTableColumns(table) {
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
    [table]
  );
  return rows.map(r => r.column_name);
}

function pickCol(cols, ...candidates) {
  return candidates.find(c => cols.includes(c)) || candidates[0];
}

async function loadSubtree(rootId, hasNodeType) {
  const cols = await getTableColumns('file_system_nodes');

  const parentId = pickCol(cols, 'parentId', 'parentid', 'parent_id');
  const deletedAt = pickCol(cols, 'deletedAt', 'deletedat', 'deleted_at');

  const q = n => `"${n}"`;

  let sql;
  if (hasNodeType) {
    const nodeType = pickCol(cols, 'nodeType', 'nodetype', 'node_type');
    sql = `
      WITH RECURSIVE subtree AS (
        SELECT id, name, ${q(nodeType)} AS "nodeType", ${q(parentId)} AS "parentId", path, extension, 0::integer AS depth
        FROM file_system_nodes
        WHERE id = $1 AND ${q(deletedAt)} IS NULL
        UNION ALL
        SELECT fn.id, fn.name, fn.${q(nodeType)}, fn.${q(parentId)}, fn.path, fn.extension, s.depth + 1
        FROM file_system_nodes fn
        INNER JOIN subtree s ON fn.${q(parentId)} = s.id
        WHERE fn.${q(deletedAt)} IS NULL
      )
      SELECT * FROM subtree ORDER BY depth, id
    `;
  } else {
    sql = `
      WITH RECURSIVE subtree AS (
        SELECT id, name,
          CASE WHEN "isFolder" = true THEN 'FOLDER' ELSE 'FILE' END AS "nodeType",
          ${q(parentId)} AS "parentId", path, extension, 0::integer AS depth
        FROM file_system_nodes
        WHERE id = $1 AND ${q(deletedAt)} IS NULL
        UNION ALL
        SELECT fn.id, fn.name,
          CASE WHEN fn."isFolder" = true THEN 'FOLDER' ELSE 'FILE' END,
          fn.${q(parentId)}, fn.path, fn.extension, s.depth + 1
        FROM file_system_nodes fn
        INNER JOIN subtree s ON fn.${q(parentId)} = s.id
        WHERE fn.${q(deletedAt)} IS NULL
      )
      SELECT * FROM subtree ORDER BY depth, id
    `;
  }
  const { rows } = await pool.query(sql, [rootId]);
  return rows;
}

function getEntryPath(node, nodeMap) {
  const chain = [];
  let cur = node.parentId ? nodeMap[node.parentId] : null;
  while (cur && nodeMap[cur.id]) {
    chain.unshift(cur);
    cur = cur.parentId ? nodeMap[cur.parentId] : null;
  }

  const parent = chain[chain.length - 1];
  const isOther = parent && parent.name === '其他';

  if (isOther) {
    const base = chain.slice(0, -1).map(n => n.name).join('/');
    const m = node.name.match(/^(.+?)_(.+)$/);
    if (m) {
      return `${base}/${m[1]}/${m[2]}`;
    }
    return `${base}/其他/${node.name}`;
  }

  const dir = chain.map(n => n.name).join('/');
  return `${dir}/${node.name}`;
}

async function exportLibrary(libType, rootNode, zipName, progress, hasNodeType) {
  const lib = progress[libType];
  if (lib.completed) {
    console.log(`  [SKIP] ${zipName} already completed`);
    return;
  }

  console.log(`\n===== Exporting ${zipName} [${rootNode.name}] =====`);
  console.log(`  Skipping ${lib.processedIds.length} already processed nodes`);

  const allNodes = await loadSubtree(rootNode.id, hasNodeType);

  const nodeMap = {};
  for (const n of allNodes) {
    nodeMap[n.id] = n;
  }

  const fileNodes = allNodes.filter(
    n => n.nodeType === 'FILE'
      && n.extension
      && ['.dwg', '.dxf'].includes(n.extension.toLowerCase())
      && !lib.processedIds.includes(n.id)
  );

  const total = fileNodes.length;
  if (total === 0) {
    console.log('  No files to process (all done)');
    lib.completed = true;
    saveProgress(progress);
    return;
  }

  const outputPath = path.join(DATA_DIR, zipName);
  if (fs.existsSync(outputPath)) {
    console.log(`  Removing existing zip and resetting progress for complete rebuild`);
    fs.unlinkSync(outputPath);
    lib.processedIds = [];
  }

  const output = fs.createWriteStream(outputPath);
  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.pipe(output);

  const THUMBNAIL_NAMES = ['thumbnail.webp', 'thumbnail.jpg', 'thumbnail.png'];

  let processed = 0, failed = 0, skipped = 0, thumbnailsAdded = 0;
  const startTime = Date.now();

  for (const node of fileNodes) {
    if (!node.path) { skipped++; lib.processedIds.push(node.id); continue; }

    const physicalPath = path.join(FILES_DATA_DIR, node.path);
    if (!fs.existsSync(physicalPath)) {
      console.error(`  [SKIP] File not found: ${node.name} (${physicalPath})`);
      skipped++;
      lib.processedIds.push(node.id);
      continue;
    }

    const entryPath = getEntryPath(node, nodeMap);

    try {
      archive.file(physicalPath, { name: entryPath });
      processed++;
    } catch (err) {
      console.error(`  [FAIL] ${node.name}: ${err.message}`);
      failed++;
      continue;
    }

    const nodeDir = path.dirname(physicalPath);
    for (const thumbName of THUMBNAIL_NAMES) {
      const thumbPath = path.join(nodeDir, thumbName);
      if (fs.existsSync(thumbPath)) {
        archive.file(thumbPath, { name: entryPath + '.jpg' });
        thumbnailsAdded++;
        break;
      }
    }

    lib.processedIds.push(node.id);

    const done = processed + skipped + failed;
    if (done % 50 === 0) {
      saveProgress(progress);
    }

    if (done % 100 === 0 || done === total) {
      const pct = Math.round(done / total * 100);
      const elapsed = fmtDuration(Date.now() - startTime);
      process.stdout.write(`\r  [${pct}%] ${done}/${total} (drawings:${processed} thumbnails:${thumbnailsAdded} skip:${skipped} fail:${failed}) ${elapsed}   `);
    }
  }

  process.stdout.write('\n');
  console.log('  Finalizing ZIP...');
  await new Promise((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.finalize();
  });

  lib.completed = true;
  saveProgress(progress);

  const fileSize = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2);
  const totalTime = fmtDuration(Date.now() - startTime);
  console.log(`  [DONE] ${zipName} (${processed} drawings, ${thumbnailsAdded} thumbnails, ${fileSize} MB, ${totalTime})`);
}

async function main() {
  console.log('===== Public Library Export Tool =====');
  console.log(`  DB: ${DATABASE_URL.replace(/\/\/.*@/, '//***@')}`);
  console.log(`  Files: ${FILES_DATA_DIR}`);
  console.log(`  Output: ${DATA_DIR}`);
  console.log(`  Progress: ${PROGRESS_PATH}\n`);

  const cols = await getTableColumns('file_system_nodes');

  const hasNodeType = cols.includes('nodeType');
  console.log(`  Schema: ${hasNodeType ? 'new (nodeType column)' : 'old (isFolder/isRoot/libraryKey)'}`);

  const deletedAt = pickCol(cols, 'deletedAt', 'deletedat', 'deleted_at');
  const createdAt = pickCol(cols, 'createdAt', 'createdat', 'created_at');
  const q = n => `"${n}"`;

  let roots;
  if (hasNodeType) {
    const nodeType = pickCol(cols, 'nodeType', 'nodetype', 'node_type');
    const result = await pool.query(
      `SELECT id, name, ${q(nodeType)} AS "nodeType" FROM file_system_nodes
       WHERE ${q(nodeType)} IN ('LIBRARY_DRAWING', 'LIBRARY_BLOCK') AND ${q(deletedAt)} IS NULL
       ORDER BY ${q(nodeType)}, ${q(createdAt)}`
    );
    roots = result.rows;
  } else {
    const result = await pool.query(
      `SELECT id, name,
        CASE "libraryKey"
          WHEN 'drawing' THEN 'LIBRARY_DRAWING'::text
          WHEN 'block' THEN 'LIBRARY_BLOCK'::text
        END AS "nodeType"
       FROM file_system_nodes
       WHERE "libraryKey" IN ('drawing', 'block') AND "isRoot" = true AND ${q(deletedAt)} IS NULL
       ORDER BY "libraryKey", ${q(createdAt)}`
    );
    roots = result.rows;
  }

  const drawingRoot = roots.find(r => r.nodeType === 'LIBRARY_DRAWING');
  const blockRoot = roots.find(r => r.nodeType === 'LIBRARY_BLOCK');

  if (!drawingRoot) console.log('WARN: LIBRARY_DRAWING root not found');
  if (!blockRoot) console.log('WARN: LIBRARY_BLOCK root not found');
  if (!drawingRoot && !blockRoot) {
    console.error('ERROR: No library roots found');
    await pool.end();
    process.exit(1);
  }

  const progress = loadProgress();

  process.on('SIGINT', async () => {
    saveProgress(progress);
    console.log('\nProgress saved, re-run to resume');
    await pool.end();
    process.exit(1);
  });

  try {
    if (drawingRoot) {
      await exportLibrary('drawing', drawingRoot, 'drawing-library-export.zip', progress, hasNodeType);
    }
    if (blockRoot) {
      await exportLibrary('block', blockRoot, 'block-library-export.zip', progress, hasNodeType);
    }
    console.log('\n===== All done =====');
  } catch (err) {
    console.error('\nERROR:', err.message);
    console.error(err.stack);
    saveProgress(progress);
    console.log('Progress saved, re-run to resume');
  } finally {
    await pool.end();
  }
}

main();
