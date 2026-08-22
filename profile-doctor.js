const fs = require('fs');
const os = require('os');
const path = require('path');

const REPAIR_DIR_NAME = '.dsh-memory-plugin-repair';

function assertProfileName(profileName) {
  if (!profileName || profileName === '.' || profileName === '..' || /[\\/]/.test(profileName)) {
    throw new Error(`Invalid DSH profile name: ${profileName || '(missing)'}`);
  }
}

function resolveDshPaths(dshHome, profileName) {
  assertProfileName(profileName);
  const resolvedDshHome = path.resolve(dshHome || path.join(os.homedir(), '.dsh'));
  const profilesDir = path.join(resolvedDshHome, 'profiles');
  return {
    dshHome: resolvedDshHome,
    profileName,
    profileDir: path.join(profilesDir, profileName),
    profilesDir,
    sharedNodeModules: path.join(profilesDir, 'node_modules'),
    repairRoot: path.join(profilesDir, REPAIR_DIR_NAME)
  };
}

function isStrictChild(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function isIgnoredEntry(name) {
  return name.startsWith('.') || name === 'node_modules';
}

function inspectPackageLeaf(sharedNodeModules, absolutePath, relativePath) {
  let stat;
  try {
    stat = fs.lstatSync(absolutePath);
  } catch (error) {
    return {
      error: `Unable to inspect ${relativePath}: ${error.message}`
    };
  }

  if (stat.isSymbolicLink()) return null;

  return {
    absolutePath,
    relativePath,
    type: stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other',
    movable: true,
    root: sharedNodeModules
  };
}

function scanScopedPackage(scopeEntry, sharedNodeModules, conflicts, errors) {
  let children;
  try {
    children = fs.readdirSync(scopeEntry.absolutePath, { withFileTypes: true });
  } catch (error) {
    errors.push(`Unable to inspect scope ${scopeEntry.relativePath}: ${error.message}`);
    return;
  }

  for (const child of children) {
    if (isIgnoredEntry(child.name)) continue;
    const absolutePath = path.join(scopeEntry.absolutePath, child.name);
    const relativePath = `${scopeEntry.relativePath}/${child.name}`;
    const inspected = inspectPackageLeaf(sharedNodeModules, absolutePath, relativePath);
    if (!inspected) continue;
    if (inspected.error) errors.push(inspected.error);
    else conflicts.push(inspected);
  }
}

function scanSharedNodeModules(paths) {
  if (!fs.existsSync(paths.sharedNodeModules)) {
    return {
      initialized: false,
      conflicts: [],
      errors: [],
      notices: [`Shared DSH node_modules directory is not initialized: ${paths.sharedNodeModules}`]
    };
  }

  let entries;
  try {
    entries = fs.readdirSync(paths.sharedNodeModules, { withFileTypes: true });
  } catch (error) {
    return {
      initialized: false,
      conflicts: [],
      errors: [`Unable to read shared DSH node_modules directory: ${error.message}`],
      notices: []
    };
  }

  const conflicts = [];
  const errors = [];
  for (const entry of entries) {
    if (isIgnoredEntry(entry.name)) continue;
    const absolutePath = path.join(paths.sharedNodeModules, entry.name);
    const relativePath = entry.name;
    const inspected = inspectPackageLeaf(paths.sharedNodeModules, absolutePath, relativePath);

    if (entry.name.startsWith('@') && inspected && inspected.type === 'directory') {
      scanScopedPackage(inspected, paths.sharedNodeModules, conflicts, errors);
      continue;
    }

    if (!inspected) continue;
    if (inspected.error) errors.push(inspected.error);
    else conflicts.push(inspected);
  }

  conflicts.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return { initialized: true, conflicts, errors };
}

function makeBackupRoot(paths, now) {
  const timestamp = (now instanceof Date ? now : new Date()).toISOString().replace(/[:.]/g, '-');
  const backupRoot = path.join(paths.repairRoot, `${timestamp}-${process.pid}`);
  if (!isStrictChild(paths.profilesDir, backupRoot) || backupRoot === paths.sharedNodeModules) {
    throw new Error('Unsafe repair backup path');
  }
  return backupRoot;
}

function validateConflictPath(paths, conflict, backupRoot) {
  const source = path.resolve(conflict.absolutePath);
  const expectedSource = path.resolve(paths.sharedNodeModules, conflict.relativePath);
  if (source !== expectedSource || !isStrictChild(paths.sharedNodeModules, source)) {
    throw new Error(`Refusing to repair path outside shared node_modules: ${conflict.relativePath}`);
  }

  const destination = path.resolve(backupRoot, 'node_modules', conflict.relativePath);
  if (!isStrictChild(backupRoot, destination)) {
    throw new Error(`Refusing to create backup outside repair directory: ${conflict.relativePath}`);
  }

  return { source, destination };
}

function repairConflicts(paths, options = {}) {
  const fix = options.fix === true;
  const initial = options.conflicts ? { conflicts: options.conflicts, errors: [] } : scanSharedNodeModules(paths);
  const result = {
    initialized: initial.initialized !== false,
    conflicts: initial.conflicts,
    moved: [],
    failed: [],
    errors: initial.errors || [],
    notices: initial.notices || [],
    remaining: initial.conflicts.slice(),
    backupRoot: null,
    manifestPath: null
  };

  if (!fix || initial.conflicts.length === 0) return result;

  const backupRoot = makeBackupRoot(paths, options.now);
  const validatedConflicts = initial.conflicts.map((conflict) => ({
    conflict,
    paths: validateConflictPath(paths, conflict, backupRoot)
  }));
  const backupPackages = path.join(backupRoot, 'node_modules');
  fs.mkdirSync(backupPackages, { recursive: true });
  result.backupRoot = backupRoot;
  result.manifestPath = path.join(backupRoot, 'manifest.json');

  for (const item of validatedConflicts) {
    const { conflict, paths: safePaths } = item;
    try {
      const { source, destination } = safePaths;
      const sourceStat = fs.lstatSync(source);
      if (sourceStat.isSymbolicLink()) {
        throw new Error('entry became a symbolic link during repair');
      }
      if (fs.existsSync(destination)) {
        throw new Error(`backup target already exists: ${destination}`);
      }

      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.renameSync(source, destination);
      result.moved.push({
        relativePath: conflict.relativePath,
        type: conflict.type,
        source,
        destination
      });
    } catch (error) {
      result.failed.push({ relativePath: conflict.relativePath, error: error.message });
    }
  }

  const finalScan = scanSharedNodeModules(paths);
  result.remaining = finalScan.conflicts;
  result.errors.push(...finalScan.errors);
  result.notices.push(...(finalScan.notices || []));
  fs.writeFileSync(result.manifestPath, `${JSON.stringify({
    version: 1,
    createdAt: new Date().toISOString(),
    profile: paths.profileName,
    moved: result.moved,
    failed: result.failed,
    remaining: result.remaining.map((item) => item.relativePath),
    errors: result.errors
  }, null, 2)}\n`);

  return result;
}

module.exports = {
  resolveDshPaths,
  scanSharedNodeModules,
  repairConflicts
};
