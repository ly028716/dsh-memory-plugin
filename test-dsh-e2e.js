const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const rootDir = __dirname;
const packageJson = require(path.join(rootDir, 'package.json'));
const packageName = packageJson.name;
const required = process.env.DSH_E2E_REQUIRED === '1';
const packageSpec = process.env.DSH_E2E_PACKAGE || '.';
const bootWaitMs = Number(process.env.DSH_E2E_BOOT_MS || 3000);

function formatOutput(result) {
  return [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
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

function runDsh(command, args, env) {
  const invocation = commandInvocation(command, args);
  return spawnSync(invocation.command, invocation.args, {
    cwd: rootDir,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 10 * 1024 * 1024
  });
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
      if (!result.error || result.error.code !== 'ENOENT') return candidate;
    }
  }

  return null;
}

function assertSuccess(step, result) {
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
      finish(() => resolve({ code: child.exitCode, output }));
    }, bootWaitMs);
  });
}

async function runE2E() {
  const probeEnv = { ...process.env };
  const dshCommand = findDshCommand(probeEnv);

  if (!dshCommand) {
    const message = 'DSH CLI was not found; install @deepseek-ai/dsh or set DSH_BIN to run this E2E.';
    if (required) throw new Error(message);
    console.log(`DSH clean-profile E2E skipped: ${message}`);
    return;
  }

  const dshHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-memory-e2e-'));
  const profileName = process.env.DSH_E2E_PROFILE || `clean-${process.pid}-${Date.now()}`;
  const env = { ...process.env, DSH_HOME: dshHome };
  const profileDir = path.join(dshHome, 'profiles', profileName);

  try {
    const install = runDsh(
      dshCommand,
      ['plugin', '--profile', profileName, 'add', packageSpec],
      env
    );
    assertSuccess('DSH plugin installation', install);

    const profilePackagePath = path.join(profileDir, 'package.json');
    const profileManifestPath = path.join(profileDir, 'dsh.profile');
    if (!fs.existsSync(profilePackagePath) || !fs.existsSync(profileManifestPath)) {
      throw new Error('DSH did not create a complete clean profile');
    }

    const profilePackage = JSON.parse(fs.readFileSync(profilePackagePath, 'utf8'));
    const installed = [profilePackage.dependencies, profilePackage.devDependencies]
      .filter(Boolean)
      .some((dependencies) => Object.prototype.hasOwnProperty.call(dependencies, packageName));
    if (!installed) {
      throw new Error(`Clean profile does not declare ${packageName}`);
    }

    const dump = runDsh(dshCommand, ['--profile', profileName, '--dump-config'], env);
    assertSuccess('DSH config dump', dump);
    const dumpOutput = formatOutput(dump);
    if (!dumpOutput.includes(packageName) && !dumpOutput.includes('dsh-memory-plugin')) {
      throw new Error('DSH config dump does not contain the memory plugin bundle');
    }

    await bootAndStop(dshCommand, ['--profile', profileName], env);
    console.log(`DSH clean-profile E2E passed: ${packageName} (${profileName})`);
  } finally {
    fs.rmSync(dshHome, { recursive: true, force: true });
  }
}

runE2E().catch((error) => {
  console.error(`DSH clean-profile E2E failed: ${error.message}`);
  process.exitCode = 1;
});
