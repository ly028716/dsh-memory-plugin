#!/usr/bin/env node

const os = require('os');
const path = require('path');
const {
  resolveDshPaths,
  scanSharedNodeModules,
  repairConflicts
} = require('../profile-doctor');

const HELP = `Usage:
  dsh-memory-plugin doctor --profile <name> [--dsh-home <path>] [--fix] [--json]

Options:
  --profile <name>    DSH profile name (required)
  --dsh-home <path>   Override DSH_HOME
  --fix               Move physical package entries to a recoverable backup
  --json              Print machine-readable JSON
  --help              Show this help
`;

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === '--help') return { help: true };
  if (args[0] !== 'doctor') throw new Error('Only the doctor subcommand is supported');

  const options = { fix: false, json: false, profile: null, dshHome: null };
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help') return { help: true };
    if (argument === '--fix') {
      options.fix = true;
      continue;
    }
    if (argument === '--json') {
      options.json = true;
      continue;
    }
    if (argument === '--profile' || argument === '--dsh-home') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`);
      if (argument === '--profile') options.profile = value;
      else options.dshHome = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!options.profile) throw new Error('--profile is required');
  options.dshHome = options.dshHome || process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  return options;
}

function serialiseResult(paths, result) {
  return {
    profile: paths.profileName,
    dshHome: paths.dshHome,
    sharedNodeModules: paths.sharedNodeModules,
    initialized: result.initialized,
    conflicts: result.conflicts.map(({ relativePath, type, movable }) => ({ relativePath, type, movable })),
    moved: result.moved.map(({ relativePath, type, destination }) => ({ relativePath, type, destination })),
    failed: result.failed,
    remaining: result.remaining.map(({ relativePath, type, movable }) => ({ relativePath, type, movable })),
    errors: result.errors,
    backupRoot: result.backupRoot,
    manifestPath: result.manifestPath
  };
}

function printResult(paths, result, json) {
  const output = serialiseResult(paths, result);
  if (json) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  console.log(`DSH profile doctor: ${paths.profileName}`);
  console.log(`Shared node_modules: ${paths.sharedNodeModules}`);
  if (!output.initialized) console.log('Profile fallback directory is not initialized.');
  console.log(`Physical conflicts: ${output.conflicts.length}`);
  for (const conflict of output.conflicts) console.log(`- ${conflict.relativePath} (${conflict.type})`);
  if (output.moved.length > 0) console.log(`Moved to backup: ${output.moved.length}`);
  if (output.backupRoot) console.log(`Backup: ${output.backupRoot}`);
  if (output.remaining.length > 0) console.log(`Remaining conflicts: ${output.remaining.length}`);
  for (const error of output.errors) console.log(`Error: ${error}`);
  for (const failure of output.failed) console.log(`Failed: ${failure.relativePath}: ${failure.error}`);
}

function getExitCode(result) {
  if (result.errors.length > 0 || result.failed.length > 0 || result.remaining.length > 0) return 1;
  if (result.conflicts.length > 0 && result.moved.length === 0) return 1;
  return 0;
}

function main(argv = process.argv) {
  let options;
  try {
    options = parseArgs(argv);
    if (options.help) {
      console.log(HELP);
      return 0;
    }

    const paths = resolveDshPaths(options.dshHome, options.profile);
    const result = repairConflicts(paths, { fix: options.fix });
    printResult(paths, result, options.json);
    return getExitCode(result);
  } catch (error) {
    console.error(`dsh-memory-plugin: ${error.message}`);
    return 2;
  }
}

if (require.main === module) process.exitCode = main();

module.exports = { main, parseArgs, serialiseResult };
