# DSH profile doctor 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为 DSH 用户提供显式、可恢复的 profile doctor，隔离共享 `node_modules` 中阻塞 DSH 启动的普通目录，并完成 npm 主安装路径与真实 E2E 验证。

**架构：** 将扫描、路径安全和备份移动逻辑放在无外部依赖的 `profile-doctor.js`，将参数解析和退出码放在 `bin/dsh-memory-plugin.js`。doctor 只操作 `<DSH_HOME>/profiles/node_modules` 的包叶节点，备份到同级受保护目录，不执行 shell、pnpm 或 npm。

**技术栈：** Node.js CommonJS、Node 内置 `fs/path/os`、Jest、现有 DSH E2E 脚本和 npm pack 流程。

---

## 文件清单

- 创建：`profile-doctor.js`，实现路径解析、包叶节点扫描、dry-run、备份移动和结果格式化。
- 创建：`bin/dsh-memory-plugin.js`，实现 `doctor` CLI 入口。
- 创建：`test/profile-doctor.test.js`，覆盖真实临时目录上的扫描、路径安全和修复行为。
- 修改：`package.json`，增加 `bin` 映射并把 doctor 文件加入 npm tarball。
- 修改：`test-package.js`，验证 packed tarball 中的 CLI 可以执行。
- 修改：`test-dsh-e2e.js`，在真实 profile 安装后执行 doctor，并区分 DSH 超时和启动失败。
- 修改：`README.md`、`README.en.md`、`INSTALL.md`、`MANUAL-INSTALL.md`，统一 npm 主安装命令和 doctor 前置步骤。
- 修改：`.github/workflows/ci.yml`、`.github/workflows/release.yml`（若存在对应 job），把 doctor/pack/E2E 纳入验证。
- 修改：本计划文件，仅记录执行进度。

## 任务 1：建立 doctor 行为的失败测试

**文件：** 创建 `test/profile-doctor.test.js`。

- [x] **步骤 1：编写失败测试**

测试必须使用真实临时目录，不 mock `fs`。先写以下行为：

```js
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  resolveDshPaths,
  scanSharedNodeModules,
  repairConflicts
} = require('../profile-doctor');

test('scans physical package leaves but ignores junctions', () => {
  const dshHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-doctor-test-'));
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

  fs.rmSync(dshHome, { recursive: true, force: true });
});

test('dry-run leaves physical directories untouched', () => {
  const dshHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-doctor-test-'));
  const paths = resolveDshPaths(dshHome, 'clean');
  const source = path.join(paths.sharedNodeModules, 'physical-package');
  fs.mkdirSync(source, { recursive: true });

  const result = repairConflicts(paths, { fix: false, now: new Date('2026-08-22T01:02:03.000Z') });

  expect(result.moved).toHaveLength(0);
  expect(fs.existsSync(source)).toBe(true);
  fs.rmSync(dshHome, { recursive: true, force: true });
});

test('fix moves conflicts to a timestamped backup and leaves a manifest', () => {
  const dshHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-doctor-test-'));
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

  fs.rmSync(dshHome, { recursive: true, force: true });
});

test('rejects a repair path outside the shared node_modules root', () => {
  const dshHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-doctor-test-'));
  const paths = resolveDshPaths(dshHome, 'clean');
  expect(() => repairConflicts(paths, {
    fix: true,
    conflicts: [{ absolutePath: path.join(dshHome, 'outside'), relativePath: '../outside', type: 'directory' }]
  })).toThrow(/outside|安全/);
  fs.rmSync(dshHome, { recursive: true, force: true });
});
```

- [x] **步骤 2：运行测试验证失败**

运行：

```text
npm test -- --runInBand test/profile-doctor.test.js
```

预期：测试因 `Cannot find module '../profile-doctor'` 失败，而不是测试语法错误。

- [x] **步骤 3：提交测试红灯**

```text
git add test/profile-doctor.test.js
git commit -m "test(doctor): 增加 profile 冲突行为测试（任务 1）"
```

## 任务 2：实现扫描、路径安全和可恢复修复

**文件：** 创建 `profile-doctor.js`。

- [x] **步骤 1：实现最小 API**

实现以下导出并使任务 1 测试通过：

```js
module.exports = {
  resolveDshPaths,
  scanSharedNodeModules,
  repairConflicts
};
```

`resolveDshPaths(dshHome, profileName)` 返回规范化的 `dshHome`、`profileDir`、`profilesDir`、`sharedNodeModules` 和 `backupRoot`。`scanSharedNodeModules(paths)` 使用 `lstatSync`：junction/symbolic link 跳过，普通目录和普通文件记录冲突；普通包扫描一层，scoped 包扫描 `@scope/<package>` 一层；点文件和 pnpm 元数据不作为包叶节点。`repairConflicts(paths, { fix, now, conflicts })` 在未传入 `conflicts` 时先扫描。dry-run 不写文件；fix 模式为每次运行创建新的 UTC 备份目录，按原相对路径移动冲突项，写入 `manifest.json`，随后二次扫描并返回 `remaining`。

`repairConflicts` 必须在移动前验证每个源路径位于 shared root 内、目标位于 backup root 内；拒绝根目录、scope 根目录和路径穿越；不覆盖已有目标；任何移动失败都保留原文件并写入错误结果。

- [x] **步骤 2：运行单元测试验证通过**

运行：

```text
npm test -- --runInBand test/profile-doctor.test.js
```

预期：4 个测试全部通过。

- [x] **步骤 3：提交核心实现**

```text
git add profile-doctor.js test/profile-doctor.test.js
git commit -m "feat(doctor): 增加 DSH profile 冲突安全修复（任务 2）"
```

## 任务 3：增加 CLI 入口和 npm 包元数据

**文件：** 创建 `bin/dsh-memory-plugin.js`；修改 `package.json`、`test-package.js`。

- [x] **步骤 1：编写 CLI 合同测试**

在 `test/profile-doctor.test.js` 增加真实子进程测试：

```js
const { spawnSync } = require('child_process');

test('CLI defaults to read-only and --fix returns a clean result', () => {
  const dshHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-doctor-cli-'));
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

  fs.rmSync(dshHome, { recursive: true, force: true });
});
```

- [x] **步骤 2：运行 CLI 测试验证失败**

运行：

```text
npm test -- --runInBand test/profile-doctor.test.js
```

预期：CLI 测试因入口文件不存在或 bin 未定义而失败。

- [x] **步骤 3：实现 CLI 和 package.json 元数据**

`bin/dsh-memory-plugin.js` 只接受 `doctor` 子命令，支持 `--profile`、`--dsh-home`、`--fix`、`--json`、`--help`；缺少 profile、未知参数或非 doctor 子命令返回 2。默认扫描发现冲突返回 1，fix 后无剩余冲突返回 0。

`package.json` 增加：

```json
{
  "bin": {
    "dsh-memory-plugin": "bin/dsh-memory-plugin.js"
  }
}
```

并把 `profile-doctor.js`、`bin` 加入 `files`。不添加 postinstall/prepare 脚本。

- [x] **步骤 4：更新打包测试并运行**

在 `test-package.js` 检查 packed 安装目录存在 `bin/dsh-memory-plugin.js` 和 `profile-doctor.js`，用 `process.execPath` 执行 `doctor --help` 并断言退出码为 0。

运行：

```text
npm test -- --runInBand test/profile-doctor.test.js
node test-package.js
```

预期：CLI 单元测试与 tarball 验证全部通过。

- [x] **步骤 5：提交 CLI 与打包变更**

```text
git add bin/dsh-memory-plugin.js package.json profile-doctor.js test/profile-doctor.test.js test-package.js
git commit -m "feat(doctor): 暴露 profile doctor CLI 并纳入 npm 包（任务 3）"
```

## 任务 4：接入真实 DSH E2E 与安装文档

**文件：** 修改 `test-dsh-e2e.js`、`README.md`、`README.en.md`、`INSTALL.md`、`MANUAL-INSTALL.md`。

- [x] **步骤 1：增加真实 E2E 的 doctor 阶段**

在 DSH 插件安装成功后，使用 packed npm 包默认路径或 `DSH_E2E_PACKAGE` 指定路径，确认 profile 包存在；向共享 fallback 创建一个明确的普通目录；调用已安装 package 的 bin 或本地 bin 执行 `doctor --fix`；验证备份 manifest、源路径移除和二次扫描结果。启动探测必须保留独立的超时状态，若 DSH 不退出则以“启动仍运行”记录，不把 timeout 当作配置 dump 成功。

- [x] **步骤 2：运行真实 E2E 验证**

运行：

```text
npm run test:dsh-e2e
```

预期：未安装 DSH 时按现有规则跳过；已安装 DSH 时至少完成安装、doctor、配置探测，并在超时路径清理子进程和临时目录。

- [x] **步骤 3：统一文档安装命令**

README 和安装文档都使用：

```text
dsh plugin --profile <name> add @ly028716/dsh-memory-plugin
dsh-memory-plugin doctor --profile <name> --fix
```

GitHub pinned commit 示例必须使用完整 40 位 SHA，并标注为 CI/复现用途。说明 doctor 默认只读、`--fix` 只移动到备份目录，兼容范围为 `>=0.1.1-rc.2 <0.2.0`。

- [x] **步骤 4：提交 E2E 与文档**

```text
git add test-dsh-e2e.js README.md README.en.md INSTALL.md MANUAL-INSTALL.md
git commit -m "docs(e2e): 接入 profile doctor 和 npm 主安装路径（任务 4）"
```

## 任务 5：CI、完整验证和收尾

**文件：** 修改 `.github/workflows/ci.yml`、`.github/workflows/release.yml`，并同步本计划勾选状态。

- [x] **步骤 1：把 doctor 测试接入 CI**

CI 必须运行 Jest、`node test-package.js`、`npm run test:pinned-commit`、`npm run test:dsh-e2e` 和 npm pack 内容检查。release workflow 在 npm 发布前执行同一 pack/doctor 验证；不引入自动发布凭据或未经确认的 registry 写入。

- [x] **步骤 2：运行完整验证**

运行：

```text
npm test -- --runInBand
npm run check
npm run test:integration
npm run test:install
npm run test:package
npm run test:pinned-commit
npm run test:quick
npm run test:dsh-e2e
git diff --check
git status --short --branch
```

预期：所有可执行测试通过；若 DSH 启动本身超时，E2E 必须输出明确的超时状态并完成清理，不能静默成功。

- [x] **步骤 3：更新计划勾选并提交 CI/验证变更**

```text
git add .github/workflows/ci.yml .github/workflows/release.yml docs/superpowers/plans/2026-08-22-dsh-profile-doctor.md
git commit -m "test(ci): 完成 DSH profile doctor 验证（任务 5）"
```
