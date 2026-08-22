const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  resolveDshPaths,
  scanSharedNodeModules,
  repairConflicts
} = require('../profile-doctor');

function createDshHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-doctor-test-'));
}

afterEach(() => {
  for (const entry of fs.readdirSync(os.tmpdir())) {
    if (!entry.startsWith('dsh-doctor-test-')) continue;
    fs.rmSync(path.join(os.tmpdir(), entry), { recursive: true, force: true });
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
