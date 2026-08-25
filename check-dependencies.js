const fs = require('fs');
const path = require('path');

const MANIFEST_SECTIONS = ['dependencies', 'optionalDependencies', 'devDependencies', 'peerDependencies'];

function assertDependencyLock(packageJson, packageLock) {
  const root = packageLock?.packages?.[''];
  if (!root) throw new Error('package-lock.json is missing its root package entry');

  for (const section of MANIFEST_SECTIONS) {
    const expected = packageJson?.[section] || {};
    const actual = root[section] || {};
    for (const [name, range] of Object.entries(expected)) {
      if (actual[name] !== range) {
        throw new Error(`package-lock.json is stale for ${section} dependency ${name}`);
      }
    }
    for (const name of Object.keys(actual)) {
      if (!Object.prototype.hasOwnProperty.call(expected, name)) {
        throw new Error(`package-lock.json contains an undeclared ${section} dependency ${name}`);
      }
    }
  }

  for (const name of Object.keys(packageJson?.dependencies || {})) {
    const packagePath = `node_modules/${name}`;
    if (!packageLock.packages[packagePath]) {
      throw new Error(`package-lock.json does not resolve direct dependency ${name}`);
    }
  }

  return true;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

if (require.main === module) {
  const rootDir = __dirname;
  assertDependencyLock(
    loadJson(path.join(rootDir, 'package.json')),
    loadJson(path.join(rootDir, 'package-lock.json'))
  );
  console.log('Dependency lock check passed.');
}

module.exports = { assertDependencyLock };
