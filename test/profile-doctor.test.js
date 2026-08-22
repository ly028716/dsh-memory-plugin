const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  resolveDshPaths,
  scanSharedNodeModules,
  repairConflicts
} = require('../profile-doctor');
const createdDshHomes = [];

function createDshHome() {
  const dshHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-doctor-test-'));
  createdDshHomes.push(dshHome);
  return dshHome;
}

afterEach(() => {
  for (const dshHome of createdDshHomes.splice(0)) {
    fs.rmSync(dshHome, { recursive: true, force: true });
  }
});

test('scans physical package leaves but ignores junctions', () => {
  const dshHome = createDshHome();
  const shared = path.join(dshHome, 'profiles', 'node_modules');
  fs.mkdirSync(path.join(shared, '@deepseek-ai'), { recursive: true });
  fs.mkdirSync(path.join(shared, 'physical-package'), { recursive: true });
  fs.mkdirSync(path.join(shared, '@deepseek-ai', 'physical-scoped'), { recursive: true });
  fs.symlinkSync(__dirname, path.join(shared, 'linked-package'), 'junction');

  const result = scanSharedNodeModules(resolveDshPaths(dshHome, 'clean'));
  expect(result.conflicts.map((item) => item.relativePath).sort()).toEqual([
    '@deepseek-ai/physical-scoped',
    'physical-package'
  ]);
});

test('dry-run leaves physical directories untouched', () => {
  const dshHome = createDshHome();
  const paths = resolveDshPaths(dshHome, 'clean');
  const source = path.join(paths.sharedNodeModules, 'physical-package');
  fs.mkdirSync(source, { recursive: true });

  const result = repairConflicts(paths, { fix: false, now: new Date('2026-08-22T01:02:03.000Z') });

  expect(result.moved).toHaveLength(0);
  expect(fs.existsSync(source)).toBe(true);
});

test('fix moves conflicts to a timestamped backup and leaves a manifest', () => {
  const dshHome = createDshHome();
  const paths = resolveDshPaths(dshHome, 'clean');
  const source = path.join(paths.sharedNodeModules, 'physical-package');
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'marker.txt'), 'preserved');

  const result = repairConflicts(paths, { fix: true, now: new Date('2026-08-22T01:02:03.000Z') });

  expect(result.remaining).toHaveLength(0);
  expect(fs.existsSync(source)).toBe(false);
  expect(fs.readFileSync(path.join(result.backupRoot, 'node_modules', 'physical-package', 'marker.txt'), 'utf8'))
    .toBe('preserved');
  expect(JSON.parse(fs.readFileSync(result.manifestPath, 'utf8')).moved).toHaveLength(1);
});

test('rejects a repair path outside the shared node_modules root', () => {
  const dshHome = createDshHome();
  const paths = resolveDshPaths(dshHome, 'clean');
  expect(() => repairConflicts(paths, {
    fix: true,
    conflicts: [{ absolutePath: path.join(dshHome, 'outside'), relativePath: '../outside', type: 'directory' }]
  })).toThrow(/outside|安全/);
});

test('treats an uninitialized shared fallback as a clean no-op', () => {
  const dshHome = createDshHome();
  const cli = path.join(__dirname, '..', 'bin', 'dsh-memory-plugin.js');
  const result = spawnSync(process.execPath, [cli, 'doctor', '--profile', 'clean', '--dsh-home', dshHome, '--fix', '--json'], {
    encoding: 'utf8'
  });

  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ initialized: false, conflicts: [], remaining: [] });
});

test('CLI defaults to read-only and --fix returns a clean result', () => {
  const dshHome = createDshHome();
  const shared = path.join(dshHome, 'profiles', 'node_modules', 'physical-package');
  fs.mkdirSync(shared, { recursive: true });
  const cli = path.join(__dirname, '..', 'bin', 'dsh-memory-plugin.js');

  const dryRun = spawnSync(process.execPath, [cli, 'doctor', '--profile', 'clean', '--dsh-home', dshHome, '--json'], {
    encoding: 'utf8'
  });
  expect(dryRun.status).toBe(1);
  expect(JSON.parse(dryRun.stdout).conflicts).toHaveLength(1);
  expect(fs.existsSync(shared)).toBe(true);

  const fix = spawnSync(process.execPath, [cli, 'doctor', '--profile', 'clean', '--dsh-home', dshHome, '--fix', '--json'], {
    encoding: 'utf8'
  });
  expect(fix.status).toBe(0);
  expect(JSON.parse(fix.stdout).remaining).toHaveLength(0);
  expect(fs.existsSync(shared)).toBe(false);
});
