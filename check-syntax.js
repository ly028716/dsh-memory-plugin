const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function collectJavaScriptFiles(rootDir, targetPath, files) {
  const absolutePath = path.resolve(rootDir, targetPath);
  const rootPrefix = `${path.resolve(rootDir)}${path.sep}`;
  if (!absolutePath.startsWith(rootPrefix)) {
    throw new Error(`Published path is outside the package root: ${targetPath}`);
  }

  const stat = fs.statSync(absolutePath);
  if (stat.isFile()) {
    if (absolutePath.endsWith('.js')) files.add(path.relative(rootDir, absolutePath));
    return;
  }
  if (!stat.isDirectory()) return;

  for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
    collectJavaScriptFiles(rootDir, path.join(targetPath, entry.name), files);
  }
}

function listPublishedJavaScriptFiles(rootDir = __dirname) {
  const packagePath = path.join(rootDir, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const files = new Set();

  for (const targetPath of packageJson.files || []) {
    collectJavaScriptFiles(rootDir, targetPath, files);
  }

  return [...files].sort();
}

function checkPublishedSyntax(rootDir = __dirname) {
  const files = listPublishedJavaScriptFiles(rootDir);
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], {
      cwd: rootDir,
      encoding: 'utf8'
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`Published JavaScript syntax check failed for ${file}: ${result.stderr || result.stdout}`);
    }
  }
  return files;
}

if (require.main === module) {
  const files = checkPublishedSyntax();
  console.log(`Published source syntax check passed for ${files.length} files.`);
}

module.exports = { listPublishedJavaScriptFiles, checkPublishedSyntax };
