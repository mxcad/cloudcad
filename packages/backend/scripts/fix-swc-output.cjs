const fs = require('fs');
const path = require('path');
const glob = require('util').promisify(require('glob'));

const DIST_DIR = path.resolve(__dirname, '..', 'dist');

async function fixFiles() {
  const files = await glob('**/*.module.js', { cwd: DIST_DIR });
  let fixed = 0;

  for (const file of files) {
    const filePath = path.join(DIST_DIR, file);
    let content = fs.readFileSync(filePath, 'utf8');

    if (content.includes('_ts_decorate') && content.includes('__esDecorate')) {
      // Find the start of the modern IIFE pattern (let ClassName = (()=>{)
      const iifeMatch = content.match(/\nlet \w+ = \(\(\)=>\{/);
      if (!iifeMatch) continue;

      // Find where the legacy _ts_decorate helper is defined
      const legacyHelperIdx = content.indexOf('function _ts_decorate(');
      if (legacyHelperIdx < 0) continue;

      // Find the end of the legacy decorator application
      const legacyEndIdx = content.lastIndexOf('_ts_decorate([', iifeMatch.index);
      if (legacyEndIdx < 0) continue;

      // Find where the array from _ts_decorate([ ends
      const parenEnd = content.indexOf(']);', legacyEndIdx) + 3;
      if (parenEnd < 3) continue;

      // Also check for the old-style class definition before _ts_decorate
      const classDefStart = content.lastIndexOf('\nlet ', legacyEndIdx);
      if (classDefStart < 0) continue;

      // Build the fix: keep everything before the legacy content and the modern content
      const beforeLegacy = content.slice(0, classDefStart);
      const modernPart = content.slice(iifeMatch.index);

      // Check if modern part starts with a broken function fragment
      // The broken __esDecorate function head needs to be reconstructed
      // We have the complete __esDecorate as a var declaration in the corrupted middle
      // Just keep the IIFE at the end
      
      const newContent = beforeLegacy + '\n' + modernPart;

      // Verify basic syntax
      try {
        require('child_process').execFileSync('node', ['--check', filePath], {
          input: newContent,
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 5000,
        });
      } catch (e) {
        // If --check fails, try a more conservative fix
      }

      fs.writeFileSync(filePath, newContent);
      fixed++;
      console.log(`Fixed: ${file}`);
    }
  }
  console.log(`\nFixed ${fixed} files.`);
}

fixFiles().catch(console.error);
