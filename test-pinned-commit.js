const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { execFileSync } = require('child_process');

const rootDir = __dirname;
const packageJson = require(path.join(rootDir, 'package.json'));
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-memory-pinned-commit-'));
const consumerDir = path.join(tempDir, 'consumer');
const npmCliPath = [
  process.env.npm_execpath,
  path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  path.join(path.dirname(process.execPath), '..', 'node_modules', 'npm', 'bin', 'npm-cli.js')
].find((candidate) => candidate && fs.existsSync(candidate));

function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      npm_config_cache: path.join(tempDir, 'npm-cache'),
      npm_config_update_notifier: 'false',
      npm_config_fund: 'false'
    }
  });
}

function runNpm(args, cwd) {
  if (npmCliPath) {
    return run(process.execPath, [npmCliPath, ...args], cwd);
  }
  return run(npmCommand, args, cwd);
}

function getPinnedCommit() {
  const commit = process.env.DSH_PINNED_COMMIT || run('git', ['rev-parse', 'HEAD'], rootDir).trim();
  if (!/^[0-9a-f]{40}$/i.test(commit)) {
    throw new Error(`DSH_PINNED_COMMIT must be a full 40-character commit SHA: ${commit}`);
  }
  if (!process.env.DSH_PINNED_REPOSITORY) {
    run('git', ['cat-file', '-e', `${commit}^{commit}`], rootDir);
  }
  return commit;
}

function getRepositorySpec(commit) {
  const repository = process.env.DSH_PINNED_REPOSITORY || `git+${pathToFileURL(rootDir).href}`;
  if (repository.includes('#')) {
    throw new Error('DSH_PINNED_REPOSITORY must not contain a commit fragment');
  }
  return `${repository}#${commit}`;
}

try {
  fs.mkdirSync(consumerDir, { recursive: true });

  const commit = getPinnedCommit();
  const repositorySpec = getRepositorySpec(commit);

  runNpm(['init', '--yes'], consumerDir);
  runNpm([
    'install',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--package-lock=false',
    repositorySpec
  ], consumerDir);

  const consumerPackage = JSON.parse(fs.readFileSync(path.join(consumerDir, 'package.json'), 'utf8'));
  const installedSpec = consumerPackage.dependencies && consumerPackage.dependencies[packageJson.name];
  if (!installedSpec || !installedSpec.endsWith(`#${commit}`)) {
    throw new Error(`Installed dependency is not pinned to ${commit}: ${installedSpec || 'missing'}`);
  }

  const installedRoot = path.join(consumerDir, 'node_modules', packageJson.name);
  const plugin = require(installedRoot);
  if (plugin.name !== 'memory' || typeof plugin.apply !== 'function') {
    throw new Error('Pinned commit package does not expose the DSH plugin API');
  }

  const installedPackage = require(path.join(installedRoot, 'package.json'));
  const patchPath = path.join(installedRoot, installedPackage.dsh.bundle.patch);
  if (!fs.existsSync(patchPath)) {
    throw new Error('Pinned commit package is missing its DSH bundle patch');
  }

  console.log(`Pinned commit installation passed: ${packageJson.name}#${commit}`);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
