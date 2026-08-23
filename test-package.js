const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = __dirname;
const packageJson = require(path.join(rootDir, 'package.json'));
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-memory-package-'));
const packageDir = path.join(tempDir, 'consumer');
const artifactDir = path.join(tempDir, 'artifact');
const npmCliPath = [
  process.env.npm_execpath,
  path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  path.join(path.dirname(process.execPath), '..', 'node_modules', 'npm', 'bin', 'npm-cli.js')
].find((candidate) => candidate && fs.existsSync(candidate));

function runNpm(args, cwd) {
  const command = npmCliPath ? process.execPath : npmCommand;
  const commandArgs = npmCliPath ? [npmCliPath, ...args] : args;
  try {
    return execFileSync(command, commandArgs, {
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
  } catch (error) {
    const details = [error.message, error.stdout, error.stderr].filter(Boolean).join('\n');
    throw new Error(`npm ${args.join(' ')} failed${details ? `:\n${details}` : ''}`);
  }
}

try {
  fs.mkdirSync(packageDir, { recursive: true });
  fs.mkdirSync(artifactDir, { recursive: true });

  const packOutput = runNpm(['pack', '--json', '--pack-destination', artifactDir], rootDir);
  const packResult = JSON.parse(packOutput);
  if (!Array.isArray(packResult) || !packResult[0] || !packResult[0].filename) {
    throw new Error('npm pack did not return a package artifact');
  }

  const artifactPath = path.join(artifactDir, packResult[0].filename);
  if (!fs.existsSync(artifactPath)) throw new Error('Package artifact was not created');

  runNpm(['init', '--yes'], packageDir);
  runNpm(['install', '--omit=peer', '--ignore-scripts', '--no-audit', '--no-fund', artifactPath], packageDir);

  const installedRoot = path.join(packageDir, 'node_modules', packageJson.name);
  const plugin = require(installedRoot);
  if (plugin.name !== 'memory' || typeof plugin.apply !== 'function') {
    throw new Error('Installed package does not expose the DSH plugin API');
  }

  const installedPackage = require(path.join(installedRoot, 'package.json'));
  const patchPath = path.join(installedRoot, installedPackage.dsh.bundle.patch);
  if (!fs.existsSync(patchPath)) throw new Error('Installed package is missing its DSH bundle patch');

  const doctorPath = path.join(installedRoot, 'bin', 'dsh-memory-plugin.js');
  if (!fs.existsSync(doctorPath) || !fs.existsSync(path.join(installedRoot, 'profile-doctor.js'))) {
    throw new Error('Installed package is missing the profile doctor CLI files');
  }
  const doctorHelp = require('child_process').execFileSync(process.execPath, [doctorPath, 'doctor', '--help'], {
    encoding: 'utf8'
  });
  if (!doctorHelp.includes('dsh-memory-plugin doctor')) {
    throw new Error('Installed profile doctor CLI does not expose its help text');
  }

  for (const viewerFile of ['viewer.html', 'premium-viewer.html', 'open-viewer.cmd']) {
    const viewerPath = path.join(installedRoot, viewerFile);
    if (!fs.existsSync(viewerPath)) {
      throw new Error(`Installed package is missing its web viewer file: ${viewerFile}`);
    }
  }

  const launcher = fs.readFileSync(path.join(installedRoot, 'open-viewer.cmd'), 'utf8');
  if (!launcher.includes('viewer.html')) {
    throw new Error('Web viewer launcher does not open viewer.html');
  }

  console.log(`Package verification passed: ${packageJson.name}@${packageJson.version}`);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
