const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const rootDir = __dirname;
const packageJson = require(path.join(rootDir, 'package.json'));
const packageName = packageJson.name;
const compatibilityRange = packageJson.dsh && packageJson.dsh.compatibility && packageJson.dsh.compatibility.cli;
const required = process.env.DSH_E2E_REQUIRED === '1';
const bootWaitMs = Number(process.env.DSH_E2E_BOOT_MS || 3000);
const commandTimeoutMs = Number(process.env.DSH_E2E_COMMAND_MS || 120000);
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmCliPath = [
  process.env.npm_execpath,
  path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  path.join(path.dirname(process.execPath), '..', 'node_modules', 'npm', 'bin', 'npm-cli.js')
].find((candidate) => candidate && fs.existsSync(candidate));

function formatOutput(result) {
  return [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
}

function parseVersion(value) {
  const match = String(value).match(/v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/);
  if (!match) return null;

  const [core, prerelease = ''] = match[1].split('-', 2);
  const [major, minor, patch] = core.split('.').map(Number);
  return { major, minor, patch, prerelease };
}

function formatVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}${version.prerelease ? `-${version.prerelease}` : ''}`;
}

function compareVersions(left, right) {
  for (const field of ['major', 'minor', 'patch']) {
    if (left[field] !== right[field]) return left[field] > right[field] ? 1 : -1;
  }

  if (left.prerelease === right.prerelease) return 0;
  if (!left.prerelease) return 1;
  if (!right.prerelease) return -1;

  const leftParts = left.prerelease.split('.');
  const rightParts = right.prerelease.split('.');
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];
    if (leftPart === rightPart) continue;
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;

    const leftIsNumber = /^\d+$/.test(leftPart);
    const rightIsNumber = /^\d+$/.test(rightPart);
    if (leftIsNumber && rightIsNumber) return Number(leftPart) > Number(rightPart) ? 1 : -1;
    if (leftIsNumber !== rightIsNumber) return leftIsNumber ? -1 : 1;
    return leftPart > rightPart ? 1 : -1;
  }

  return 0;
}

function assertDshCompatibility(versionText) {
  const version = parseVersion(versionText);
  const range = /^>=([^\s]+)\s+<([^\s]+)$/.exec(compatibilityRange || '');
  if (!version || !range) {
    throw new Error(`Unable to evaluate DSH compatibility: version=${versionText}, range=${compatibilityRange}`);
  }

  const minimum = parseVersion(range[1]);
  const maximum = parseVersion(range[2]);
  if (!minimum || !maximum || compareVersions(version, minimum) < 0 || compareVersions(version, maximum) >= 0) {
    throw new Error(`DSH CLI ${versionText} is outside the supported range ${compatibilityRange}`);
  }
}

function commandInvocation(command, args) {
  if (process.platform === 'win32' && command.toLowerCase().endsWith('.cmd')) {
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/c', command, ...args]
    };
  }

  return { command, args };
}

function terminatePidTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(pid, 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
}

function runDsh(command, args, env) {
  const invocation = commandInvocation(command, args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: rootDir,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 10 * 1024 * 1024,
    timeout: commandTimeoutMs
  });
  if (result.error && result.error.code === 'ETIMEDOUT') terminatePidTree(result.pid);
  return result;
}

function runDshAsync(command, args, env, timeoutMs) {
  return new Promise((resolve) => {
    const invocation = commandInvocation(command, args);
    const child = spawn(invocation.command, invocation.args, {
      cwd: rootDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...result, stdout, stderr, pid: child.pid });
    };

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => finish({ error, status: null }));
    child.on('exit', (status, signal) => finish({ status, signal, error: null }));
    timer = setTimeout(() => {
      terminatePidTree(child.pid);
      const error = new Error(`DSH command timed out after ${timeoutMs}ms`);
      error.code = 'ETIMEDOUT';
      finish({ error, status: null, timedOut: true });
    }, timeoutMs);
  });
}

function runNpm(args, cwd, env) {
  const command = npmCliPath ? process.execPath : npmCommand;
  const commandArgs = npmCliPath ? [npmCliPath, ...args] : args;
  const invocation = commandInvocation(command, commandArgs);
  return spawnSync(invocation.command, invocation.args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 10 * 1024 * 1024,
    timeout: commandTimeoutMs
  });
}

function createPackageArtifact(tempRoot) {
  const artifactDir = path.join(tempRoot, 'artifact');
  fs.mkdirSync(artifactDir, { recursive: true });
  const result = runNpm(['pack', '--json', '--pack-destination', artifactDir], rootDir, {
    ...process.env,
    npm_config_cache: path.join(tempRoot, 'npm-cache'),
    npm_config_update_notifier: 'false',
    npm_config_fund: 'false'
  });
  assertSuccess('npm package artifact creation', result);
  const packed = JSON.parse(formatOutput(result));
  if (!Array.isArray(packed) || !packed[0] || !packed[0].filename) {
    throw new Error('npm pack did not return a package artifact');
  }
  return path.join(artifactDir, packed[0].filename);
}

function commandAvailable(command) {
  if (path.isAbsolute(command) || command.includes(path.sep)) {
    return fs.existsSync(command);
  }

  const lookupCommand = process.platform === 'win32' ? 'where.exe' : 'which';
  const lookup = spawnSync(lookupCommand, [command], { stdio: 'ignore' });
  return lookup.status === 0;
}

function findDshCommand(env) {
  const candidates = process.env.DSH_BIN
    ? [process.env.DSH_BIN]
    : process.platform === 'win32'
      ? ['dsh.cmd', 'dsh']
      : ['dsh'];

  for (const candidate of candidates) {
    if (commandAvailable(candidate)) {
      const result = runDsh(candidate, ['--version'], env);
      if (!result.error || result.error.code !== 'ENOENT') {
        return { command: candidate, version: parseVersion(formatOutput(result)) };
      }
    }
  }

  return null;
}

function assertSuccess(step, result) {
  if (result.error) {
    throw new Error(`${step} failed: ${result.error.code || result.error.message}`);
  }
  if (result.status === 0) return;

  const details = formatOutput(result);
  throw new Error(`${step} failed with exit code ${result.status}${details ? `:\n${details}` : ''}`);
}

function terminateProcess(child) {
  if (child.exitCode !== null) return;

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

function bootAndStop(command, args, env) {
  return new Promise((resolve, reject) => {
    const invocation = commandInvocation(command, args);
    const child = spawn(invocation.command, invocation.args, {
      cwd: rootDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    let settled = false;

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };

    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.on('error', (error) => finish(() => reject(error)));
    child.on('exit', (code) => {
      finish(() => {
        if (code !== null && code !== 0) {
          reject(new Error(`DSH profile boot failed with exit code ${code}:\n${output.trim()}`));
          return;
        }
        resolve({ code, output });
      });
    });

    const timer = setTimeout(() => {
      if (child.exitCode !== null) return;
      terminateProcess(child);
      finish(() => resolve({ code: child.exitCode, output, timedOut: true }));
    }, bootWaitMs);
  });
}

function findInstalledPackage(profileDir) {
  const packagePath = path.join(profileDir, 'node_modules', ...packageName.split('/'));
  if (!fs.existsSync(packagePath)) {
    throw new Error(`Installed package directory was not found: ${packagePath}`);
  }
  return packagePath;
}

function runDoctor(profileDir, dshHome, profileName) {
  const installedRoot = findInstalledPackage(profileDir);
  const doctorPath = path.join(installedRoot, 'bin', 'dsh-memory-plugin.js');
  if (!fs.existsSync(doctorPath)) throw new Error('Installed package is missing its doctor CLI');

  const fixture = path.join(dshHome, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-memory-plugin-doctor-fixture');
  fs.mkdirSync(fixture, { recursive: true });
  fs.writeFileSync(path.join(fixture, 'marker.txt'), 'doctor-fixture');

  const result = spawnSync(process.execPath, [
    doctorPath,
    'doctor',
    '--profile',
    profileName,
    '--dsh-home',
    dshHome,
    '--fix',
    '--json'
  ], {
    cwd: rootDir,
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: commandTimeoutMs
  });
  assertSuccess('DSH profile doctor', result);
  const output = JSON.parse(formatOutput(result));
  if (output.remaining.length !== 0 || fs.existsSync(fixture)) {
    throw new Error('DSH profile doctor did not remove the simulated physical fallback entry');
  }
  if (!output.manifestPath || !fs.existsSync(output.manifestPath)) {
    throw new Error('DSH profile doctor did not create a repair manifest');
  }
  return output;
}

async function runE2E() {
  const probeEnv = { ...process.env };
  const dsh = findDshCommand(probeEnv);

  if (!dsh) {
    const message = 'DSH CLI was not found; install @deepseek-ai/dsh or set DSH_BIN to run this E2E.';
    if (required) throw new Error(message);
    console.log(`DSH clean-profile E2E skipped: ${message}`);
    return;
  }

  if (!dsh.version) {
    throw new Error('Unable to determine the installed DSH CLI version');
  }
  assertDshCompatibility(formatVersion(dsh.version));

  const e2eRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-memory-e2e-'));
  const dshHome = path.join(e2eRoot, 'dsh-home');
  fs.mkdirSync(dshHome, { recursive: true });
  const profileName = process.env.DSH_E2E_PROFILE || `clean-${process.pid}-${Date.now()}`;
  const env = { ...process.env, DSH_HOME: dshHome };
  const profileDir = path.join(dshHome, 'profiles', profileName);
  const packageSpec = process.env.DSH_E2E_PACKAGE || createPackageArtifact(e2eRoot);

  let operationError = null;
  try {
    const install = runDsh(
      dsh.command,
      ['plugin', '--profile', profileName, 'add', packageSpec],
      env
    );
    assertSuccess('DSH plugin installation', install);

    const profilePackagePath = path.join(profileDir, 'package.json');
    if (!fs.existsSync(profilePackagePath)) {
      throw new Error('DSH did not create a complete clean profile');
    }

    const profilePackage = JSON.parse(fs.readFileSync(profilePackagePath, 'utf8'));
    const bundles = profilePackage.dsh && profilePackage.dsh.profile && profilePackage.dsh.profile.bundles;
    if (!Array.isArray(bundles) || !bundles.includes(packageName)) {
      throw new Error(`Clean profile bundle manifest does not include ${packageName}`);
    }

    const installed = [profilePackage.dependencies, profilePackage.devDependencies]
      .filter(Boolean)
      .some((dependencies) => Object.prototype.hasOwnProperty.call(dependencies, packageName));
    if (!installed) {
      throw new Error(`Clean profile does not declare ${packageName}`);
    }

    const doctor = runDoctor(profileDir, dshHome, profileName);
    console.log(`DSH profile doctor passed: moved ${doctor.moved.length} physical fallback entries`);

    const dump = await runDshAsync(dsh.command, ['--profile', profileName, '--dump-config'], env, commandTimeoutMs);
    assertSuccess('DSH config dump', dump);
    const dumpOutput = formatOutput(dump);
    if (!dumpOutput.includes(packageName) && !dumpOutput.includes('dsh-memory-plugin')) {
      throw new Error('DSH config dump does not contain the memory plugin bundle');
    }

    const hostProbe = await runHostProbe({
      installedRoot: installed,
      dshVersion: formatVersion(dsh.version)
    });
    if (!hostProbe.promptText.includes('Memory context (user-controlled local memory):')) {
      throw new Error('DSH host prompt probe did not expose the memory context');
    }
    if (!hostProbe.promptText.includes('preferred model:')) {
      throw new Error('DSH host prompt probe did not include the written preference');
    }
    if (hostProbe.promptText.includes('sk-')) {
      throw new Error('DSH host prompt probe exposed an unredacted secret');
    }
    if (!hostProbe.toolNames.includes('memory')) {
      throw new Error('DSH host tool probe did not expose the memory tool');
    }
    if (!hostProbe.toolActions.includes('search') || !hostProbe.toolActions.includes('remember') || !hostProbe.toolActions.includes('forget')) {
      throw new Error('DSH host tool probe did not expose search/remember/forget actions');
    }
    console.log(`DSH host prompt/tool probe passed: memory context + memory tool visible (DSH ${hostProbe.dshVersion})`);

    const boot = await bootAndStop(dsh.command, ['--profile', profileName], env);
    if (boot.timedOut) {
      console.log(`DSH profile boot probe remained running for ${bootWaitMs}ms; process tree was terminated after startup observation`);
    }
    console.log(`DSH clean-profile E2E passed: ${packageName} (${profileName}, DSH ${formatVersion(dsh.version)})`);
  } catch (error) {
    operationError = error;
  } finally {
    try {
      fs.rmSync(e2eRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (cleanupError) {
      if (!operationError) operationError = cleanupError;
      else console.error(`DSH E2E cleanup warning: ${cleanupError.message}`);
    }
  }
  if (operationError) throw operationError;
}

runE2E().catch((error) => {
  console.error(`DSH clean-profile E2E failed: ${error.message}`);
  process.exitCode = 1;
});
