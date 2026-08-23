const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = __dirname;
const packageJson = require(path.join(rootDir, 'package.json'));
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmCliPath = [
  process.env.npm_execpath,
  path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  path.join(path.dirname(process.execPath), '..', 'node_modules', 'npm', 'bin', 'npm-cli.js')
].find((candidate) => candidate && fs.existsSync(candidate));
const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function usage() {
  return [
    'Usage: node test-release-install.js --version <semver> --github-tarball <path.tgz>',
    '       [--npm-tarball <path.tgz>] [--registry <URL>] [--retries <integer>]',
    '       [--retry-delay-ms <integer>]'
  ].join('\n');
}

function parseArguments(argv) {
  const values = {};
  const knownOptions = new Set([
    '--version',
    '--github-tarball',
    '--npm-tarball',
    '--registry',
    '--retries',
    '--retry-delay-ms'
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (!knownOptions.has(option)) throw new Error(`Unknown argument: ${option}\n${usage()}`);
    if (Object.prototype.hasOwnProperty.call(values, option)) {
      throw new Error(`Argument provided more than once: ${option}\n${usage()}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${option}\n${usage()}`);
    values[option] = value;
    index += 1;
  }

  if (!values['--version']) throw new Error(`Missing required argument: --version\n${usage()}`);
  if (!semverPattern.test(values['--version'])) {
    throw new Error(`Invalid --version semver: ${values['--version']}`);
  }
  if (!values['--github-tarball']) {
    throw new Error(`Missing required argument: --github-tarball\n${usage()}`);
  }

  const parseInteger = (option, fallback) => {
    const value = values[option] ?? String(fallback);
    if (!/^\d+$/.test(value)) throw new Error(`${option} must be a non-negative integer`);
    return Number(value);
  };

  const registry = values['--registry'] || 'https://registry.npmjs.org';
  try {
    const parsed = new URL(registry);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported protocol');
  } catch (_) {
    throw new Error(`Invalid --registry URL: ${registry}`);
  }

  return {
    version: values['--version'],
    githubTarball: values['--github-tarball'],
    npmTarball: values['--npm-tarball'],
    registry,
    retries: parseInteger('--retries', 5),
    retryDelayMs: parseInteger('--retry-delay-ms', 10000)
  };
}

function resolveTarball(tarballPath, channel) {
  const resolvedPath = path.resolve(process.cwd(), tarballPath);
  if (!resolvedPath.toLowerCase().endsWith('.tgz')) {
    throw new Error(`${channel} tarball must end with .tgz: ${tarballPath}`);
  }
  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
    throw new Error(`${channel} tarball does not exist: ${resolvedPath}`);
  }
  return resolvedPath;
}

function summarizeNpmError(error) {
  return [error.message, error.stdout, error.stderr]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean)
    .join('\n');
}

function sanitizeVerificationEnvironment() {
  const sensitiveName = /(TOKEN|SECRET|PASSWORD|CREDENTIAL|_KEY$)/i;
  return Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !sensitiveName.test(name))
  );
}

function runNpm(tempDir, registry, args, cwd) {
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
        npm_config_registry: registry,
        npm_config_update_notifier: 'false',
        npm_config_fund: 'false'
      }
    });
  } catch (error) {
    throw new Error(`npm ${args.join(' ')} failed:\n${summarizeNpmError(error)}`);
  }
}

function installSource(tempDir, registry, consumerDir, source, offline = false) {
  const args = [
    'install',
    '--no-save',
    '--package-lock=false',
    '--ignore-scripts',
    '--omit=peer',
    '--no-audit',
    '--no-fund'
  ];
  if (offline) args.push('--offline');
  args.push(source);
  runNpm(tempDir, registry, args, consumerDir);
}

function installFromNpm(tempDir, options, consumerDir) {
  const source = options.npmTarball
    ? resolveTarball(options.npmTarball, 'npm channel')
    : `${packageJson.name}@${options.version}`;
  let lastError;

  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    try {
      installSource(tempDir, options.registry, consumerDir, source, Boolean(options.npmTarball));
      return;
    } catch (error) {
      lastError = error;
      if (attempt === options.retries) break;
      if (options.retryDelayMs > 0) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, options.retryDelayMs);
      }
    }
  }

  throw new Error(`npm channel installation failed after ${options.retries + 1} attempt(s):\n${lastError.message}`);
}

function installFromTarball(tempDir, options, consumerDir) {
  const tarball = resolveTarball(options.githubTarball, 'GitHub channel');
  try {
    installSource(tempDir, options.registry, consumerDir, tarball, true);
  } catch (error) {
    throw new Error(`GitHub channel installation failed:\n${error.message}`);
  }
}

function verifyInstalledPackage(channel, consumerDir, version) {
  const installedRoot = path.join(consumerDir, 'node_modules', packageJson.name);
  const fail = (message) => {
    throw new Error(`${channel} channel verification failed: ${message}`);
  };

  if (!fs.existsSync(installedRoot)) fail(`installed package is missing: ${installedRoot}`);

  const verificationEnv = sanitizeVerificationEnvironment();
  try {
    const entrySmokeScript = [
      'const installedRoot = process.argv[1];',
      'const plugin = require(installedRoot);',
      "if (plugin.name !== 'memory' || typeof plugin.apply !== 'function') {",
      "  throw new Error('package does not expose the DSH plugin API');",
      '}'
    ].join('\n');
    execFileSync(process.execPath, ['-e', entrySmokeScript, installedRoot], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: verificationEnv
    });
  } catch (error) {
    fail(`package could not be loaded: ${error.message}`);
  }

  let installedPackage;
  try {
    installedPackage = JSON.parse(fs.readFileSync(path.join(installedRoot, 'package.json'), 'utf8'));
  } catch (error) {
    fail(`package.json could not be loaded: ${error.message}`);
  }
  if (installedPackage.version !== version) {
    fail(`expected version ${version}, received ${installedPackage.version}`);
  }
  if (!installedPackage.dsh || !installedPackage.dsh.bundle || !installedPackage.dsh.bundle.patch) {
    fail('package is missing dsh.bundle.patch metadata');
  }

  const patchPath = path.join(installedRoot, installedPackage.dsh.bundle.patch);
  if (!fs.existsSync(patchPath)) fail(`bundle patch is missing: ${installedPackage.dsh.bundle.patch}`);

  for (const file of ['dsh-memory-plugin.js', 'profile-doctor.js']) {
    const filePath = file === 'dsh-memory-plugin.js'
      ? path.join(installedRoot, 'bin', file)
      : path.join(installedRoot, file);
    if (!fs.existsSync(filePath)) fail(`required CLI file is missing: ${file}`);
  }

  try {
    const doctorHelp = execFileSync(
      process.execPath,
      [path.join(installedRoot, 'bin', 'dsh-memory-plugin.js'), 'doctor', '--help'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: verificationEnv
      }
    );
    if (!doctorHelp.includes('dsh-memory-plugin doctor')) {
      fail('doctor --help does not expose its expected help text');
    }
  } catch (error) {
    fail(`doctor --help failed: ${summarizeNpmError(error)}`);
  }

  for (const viewerFile of ['viewer.html', 'premium-viewer.html', 'open-viewer.cmd']) {
    if (!fs.existsSync(path.join(installedRoot, viewerFile))) {
      fail(`web viewer file is missing: ${viewerFile}`);
    }
  }
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-memory-release-install-'));
  const npmConsumerDir = path.join(tempDir, 'npm-consumer');
  const githubConsumerDir = path.join(tempDir, 'github-consumer');

  try {
    fs.mkdirSync(npmConsumerDir, { recursive: true });
    fs.mkdirSync(githubConsumerDir, { recursive: true });

    installFromNpm(tempDir, options, npmConsumerDir);
    verifyInstalledPackage('npm', npmConsumerDir, options.version);
    console.log(`npm channel passed: ${packageJson.name}@${options.version}`);

    installFromTarball(tempDir, options, githubConsumerDir);
    verifyInstalledPackage('GitHub', githubConsumerDir, options.version);
    console.log(`GitHub channel passed: ${packageJson.name}@${options.version}`);
    console.log(`Release installation verification passed: ${packageJson.name}@${options.version}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(`Release installation verification failed: ${error.message}`);
  process.exitCode = 1;
}
