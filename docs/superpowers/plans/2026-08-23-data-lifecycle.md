# 数据生命周期管理实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为本地 JSON 记忆存储加入版本化数据迁移、本地快照备份、受保护恢复和按时间/数量执行的保留策略。

**架构：** `migrations.js` 提供纯函数式、前向不可变的数据迁移链；`data-lifecycle.js` 负责快照文件、恢复安全备份和保留清理。`MemoryStorage` 在加载时迁移数据并保留原子写入能力，`MemoryManager` 编排启动备份与生命周期 API，`index.js` 将能力公开到 DSH memory 服务。

**技术栈：** Node.js 20、CommonJS、`fs.promises`、Jest 29、现有文件锁/临时文件写入和数据大小限制。

---

## 文件清单

- 创建：`migrations.js` — 数据版本常量、版本识别、`1.0.0 -> 1.1.0` 迁移链。
- 创建：`data-lifecycle.js` — 本地快照创建、列表、恢复和保留清理。
- 创建：`test/migrations.test.js` — 迁移成功、未知版本、不可变性和非法输入测试。
- 创建：`test/data-lifecycle.test.js` — 快照、恢复、路径安全和保留策略测试。
- 修改：`storage.js` — 当前数据版本、加载迁移、迁移状态暴露、导入前版本化校验。
- 修改：`memory-manager.js` — 生命周期管理器初始化、启动备份、生命周期方法代理。
- 修改：`config.js` — 备份目录、启动备份、保留天数/份数配置及校验。
- 修改：`index.js` — 将生命周期方法和列表能力公开到 `ctx.services.memory`。
- 修改：`package.json` — 将新运行时模块加入发布文件清单。
- 修改：`test/config.test.js` — 新配置默认值、边界和非法值测试。
- 修改：`test/index.test.js` — 插件服务生命周期 API 和启动备份集成测试。
- 修改：`test/storage.test.js` — 旧数据迁移、当前版本落盘和迁移失败保护测试。

### 任务 1：建立迁移链

**文件：**
- 创建：`migrations.js`
- 测试：`test/migrations.test.js`

- [ ] **步骤 1：编写失败的迁移测试**

```js
const { CURRENT_DATA_VERSION, CURRENT_SCHEMA_VERSION, migrateData } = require('../migrations');

test('migrates a 1.0.0 document without mutating the input', () => {
  const source = {
    version: '1.0.0',
    metadata: { createdAt: '2026-01-01T00:00:00.000Z' },
    userPreferences: { defaultModel: 'model-a' }
  };

  const result = migrateData(source);

  expect(result.version).toBe(CURRENT_DATA_VERSION);
  expect(result.metadata.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  expect(result.userPreferences.defaultModel).toBe('model-a');
  expect(source.metadata.schemaVersion).toBeUndefined();
  expect(source.version).toBe('1.0.0');
});

test('rejects unknown future versions', () => {
  expect(() => migrateData({ version: '9.0.0', metadata: {} }))
    .toThrow('Unsupported memory data version');
});

test('rejects malformed versioned data', () => {
  expect(() => migrateData({ metadata: {} })).toThrow('Invalid memory data format');
});
```

- [ ] **步骤 2：运行测试确认迁移功能缺失**

运行：`npx jest test/migrations.test.js --runInBand`

预期：FAIL，报错 `Cannot find module '../migrations'`。

- [ ] **步骤 3：实现最少迁移代码**

在 `migrations.js` 中定义：

```js
const CURRENT_DATA_VERSION = '1.1.0';
const CURRENT_SCHEMA_VERSION = 2;
const MIGRATIONS = new Map([
  ['1.0.0', (data) => ({
    ...cloneData(data),
    version: CURRENT_DATA_VERSION,
    metadata: { ...cloneData(data.metadata), schemaVersion: CURRENT_SCHEMA_VERSION }
  })]
]);

function migrateData(input) {
  assertDocument(input);
  let current = cloneData(input);
  while (current.version !== CURRENT_DATA_VERSION) {
    const migrate = MIGRATIONS.get(current.version);
    if (!migrate) throw new Error(`Unsupported memory data version: ${current.version}`);
    current = migrate(current);
  }
  return current;
}
```

使用本地 `cloneData` 和对象校验，禁止迁移函数直接修改调用方对象；支持当前版本原样深拷贝返回。

- [ ] **步骤 4：运行迁移测试确认通过**

运行：`npx jest test/migrations.test.js --runInBand`

预期：3 个测试 PASS。

- [ ] **步骤 5：提交迁移链**

```bash
git add migrations.js test/migrations.test.js
git commit -m "feat: add versioned memory data migrations"
```

### 任务 2：扩展配置和发布清单

**文件：**
- 修改：`config.js`
- 修改：`test/config.test.js`
- 修改：`package.json`

- [ ] **步骤 1：编写失败的配置测试**

```js
test('provides local backup and retention defaults', () => {
  const config = validateConfig();
  expect(config.backupDir).toBeNull();
  expect(config.backupOnInitialize).toBe(true);
  expect(config.backupRetentionDays).toBe(30);
  expect(config.backupRetentionCount).toBe(10);
});

test('rejects invalid backup retention settings', () => {
  expect(() => validateConfig({ backupRetentionDays: 0 })).toThrow('backupRetentionDays must be a positive integer');
  expect(() => validateConfig({ backupRetentionCount: 10001 })).toThrow('backupRetentionCount must not exceed 10000');
  expect(() => validateConfig({ backupOnInitialize: 'yes' })).toThrow('backupOnInitialize must be a boolean value');
});
```

- [ ] **步骤 2：运行配置测试确认失败**

运行：`npx jest test/config.test.js --runInBand`

预期：FAIL，默认配置中不存在备份字段。

- [ ] **步骤 3：实现配置校验并更新发布清单**

在 `DEFAULT_CONFIG` 增加：

```js
backupDir: null,
backupOnInitialize: true,
backupRetentionDays: 30,
backupRetentionCount: 10,
```

校验 `backupDir` 为 `null` 或无 NUL 字节的非空字符串；校验两个保留值为 `1..10000` 的安全整数；将 `backupOnInitialize` 加入布尔配置列表。`package.json.files` 增加 `migrations.js` 和 `data-lifecycle.js`。

- [ ] **步骤 4：运行配置测试确认通过**

运行：`npx jest test/config.test.js --runInBand`

预期：全部配置测试 PASS。

- [ ] **步骤 5：提交配置变更**

```bash
git add config.js test/config.test.js package.json
git commit -m "feat: configure local backup retention"
```

### 任务 3：实现本地快照生命周期模块

**文件：**
- 创建：`data-lifecycle.js`
- 测试：`test/data-lifecycle.test.js`

- [ ] **步骤 1：编写失败的生命周期测试**

```js
test('creates and lists a private backup snapshot', async () => {
  const lifecycle = createLifecycle();
  const result = await lifecycle.backup('manual');
  expect(result.name).toMatch(/^memory-.*-manual\.json$/);
  expect((await lifecycle.listBackups()).map((item) => item.name)).toContain(result.name);
  expect(JSON.parse(await fs.readFile(result.path, 'utf8'))).toEqual(currentData);
});

test('rejects restore paths outside the backup directory', async () => {
  const lifecycle = createLifecycle();
  await expect(lifecycle.restoreBackup('../memory.json')).rejects.toThrow('Invalid backup name');
});

test('creates a safety backup before restoring a valid snapshot', async () => {
  const lifecycle = createLifecycle();
  const backup = await lifecycle.backup('manual');
  const result = await lifecycle.restoreBackup(backup.name);
  expect(result.safetyBackup.name).toContain('-restore-safety.json');
  expect(await storage.get('userPreferences.defaultModel')).toBe('original');
});

test('retains recent snapshots by age and count without deleting unrelated files', async () => {
  const lifecycle = createLifecycle({ backupRetentionDays: 30, backupRetentionCount: 2 });
  await writeSnapshot('memory-old-manual.json', '2025-01-01T00:00:00.000Z');
  await writeSnapshot('memory-recent-1-manual.json', new Date(Date.now() - 1000).toISOString());
  await writeSnapshot('memory-recent-2-manual.json', new Date().toISOString());
  await fs.writeFile(path.join(backupDir, 'keep.txt'), 'keep');
  const result = await lifecycle.applyRetention();
  expect(result.deleted).toEqual(['memory-old-manual.json']);
  await expect(fs.access(path.join(backupDir, 'keep.txt'))).resolves.toBeUndefined();
});
```

测试夹具使用临时目录、真实 `MemoryStorage` 和临时备份目录；通过 `fs.utimes` 控制快照时间，不 mock 文件系统。

- [ ] **步骤 2：运行测试确认生命周期模块缺失**

运行：`npx jest test/data-lifecycle.test.js --runInBand`

预期：FAIL，报错 `Cannot find module '../data-lifecycle'`。

- [ ] **步骤 3：实现备份、列表、恢复和清理**

实现 `DataLifecycleManager`：

```js
class DataLifecycleManager {
  constructor(storage, options) {}
  async backup(reason = 'manual') {}
  async listBackups() {}
  async restoreBackup(name) {}
  async applyRetention() {}
}
```

实现约束：

- `backupDir` 为空时使用 `path.resolve(`${storage.storagePath}.backups`)`。
- 只识别 `^memory-[A-Za-z0-9_-]+\.json$` 的模块快照名，并用 `path.resolve` 校验最终路径位于备份目录内。
- 快照内容来自 `storage.exportData()`，通过临时文件、`handle.sync()`、`rename` 和 `setPrivateFileMode` 写入。
- 恢复先读取快照并执行 `assertDataWithinLimits`、`migrateData`，再创建当前数据的 `restore-safety` 快照，最后调用 `storage.importData(migrated)`；任何前置失败不得调用导入。
- `listBackups` 返回按 `createdAt` 从新到旧排序的 `{name, path, size, createdAt, reason}`，原因从安全文件名解析。
- `applyRetention` 只处理合法快照，按最新时间排序；仅删除同时满足“早于保留截止时间”和“超出保留数量”的快照。

- [ ] **步骤 4：运行生命周期测试确认通过**

运行：`npx jest test/data-lifecycle.test.js --runInBand`

预期：全部生命周期测试 PASS，且备份目录中不残留临时文件。

- [ ] **步骤 5：提交生命周期模块**

```bash
git add data-lifecycle.js test/data-lifecycle.test.js
git commit -m "feat: add local memory backup restore and retention"
```

### 任务 4：接入存储迁移和管理器编排

**文件：**
- 修改：`storage.js`
- 修改：`memory-manager.js`
- 修改：`test/storage.test.js`

- [ ] **步骤 1：编写失败的存储/管理器测试**

```js
test('loads legacy data and persists the migrated version', async () => {
  await fs.writeFile(testFile, JSON.stringify({
    version: '1.0.0',
    metadata: { createdAt: '2026-01-01T00:00:00.000Z' },
    userPreferences: { defaultModel: 'legacy-model' }
  }));
  await storage.initialize();
  expect(storage.get('version')).toBe('1.1.0');
  expect(storage.get('metadata.schemaVersion')).toBe(2);
  expect(JSON.parse(await fs.readFile(testFile, 'utf8')).version).toBe('1.1.0');
});

test('does not replace the source when migration rejects the document', async () => {
  const original = JSON.stringify({ version: '9.0.0', metadata: {} });
  await fs.writeFile(testFile, original);
  await expect(storage.initialize()).rejects.toThrow('Unsupported memory data version');
  expect(await fs.readFile(testFile, 'utf8')).toBe(original);
});
```

- [ ] **步骤 2：运行测试确认存储尚未迁移**

运行：`npx jest test/storage.test.js --runInBand`

预期：新增测试 FAIL，旧版本仍保持 `1.0.0` 或加载时抛出错误。

- [ ] **步骤 3：接入迁移并保持原子落盘**

在 `storage.load` 中先调用 `migrateData(parsed)`，再做脱敏和默认字段合并；迁移结果变化时标记整个文档 dirty，并沿用现有 `save()` 临时文件 + rename 流程。对未知版本在解析和保存前抛错，因此原文件不变。

在 `MemoryManager` 构造时创建 `DataLifecycleManager`。初始化时：

1. 若主文件存在且 `backupOnInitialize` 为真，先创建 `startup` 快照。
2. 调用 `storage.initialize` 完成迁移和现有采集初始化。
3. 初始化成功后调用 `applyRetention`；启动备份失败或迁移失败时终止初始化，不覆盖主文件。
4. 增加 `backup`, `listBackups`, `restoreBackup`, `applyRetention` 四个代理方法，并确保恢复后 manager 状态继续引用同一 storage 实例。

- [ ] **步骤 4：运行存储测试确认通过**

运行：`npx jest test/storage.test.js --runInBand`

预期：全部存储测试 PASS，现有默认集合和原子写入测试不回归。

- [ ] **步骤 5：提交存储接入**

```bash
git add storage.js memory-manager.js test/storage.test.js
git commit -m "feat: migrate memory data during storage initialization"
```

### 任务 5：公开插件服务并补集成测试

**文件：**
- 修改：`index.js`
- 修改：`test/index.test.js`

- [ ] **步骤 1：编写失败的插件 API 测试**

```js
test('exposes backup lifecycle operations through the memory service', async () => {
  plugin.apply(context, { storagePath: testFile, backupOnInitialize: false });
  await context.services.memory.ready;

  const backup = await context.services.memory.backup();
  expect(backup.name).toMatch(/-manual\.json$/);
  expect(await context.services.memory.listBackups()).toHaveLength(1);
  expect(await context.services.memory.applyRetention()).toEqual({
    deleted: [],
    remaining: expect.any(Array)
  });
});
```

- [ ] **步骤 2：运行集成测试确认 API 缺失**

运行：`npx jest test/index.test.js --runInBand`

预期：FAIL，`context.services.memory.backup` 未定义。

- [ ] **步骤 3：公开生命周期 API**

在 `ctx.provide('memory', ...)` 中加入：

```js
backup: (reason) => memoryManager.backup(reason),
listBackups: () => memoryManager.listBackups(),
restoreBackup: (name) => memoryManager.restoreBackup(name),
applyRetention: () => memoryManager.applyRetention(),
```

保持现有 `importData`, `storage`, `ready` 和默认采集行为不变。

- [ ] **步骤 4：运行插件测试确认通过**

运行：`npx jest test/index.test.js --runInBand`

预期：全部插件测试 PASS。

- [ ] **步骤 5：提交插件 API**

```bash
git add index.js test/index.test.js
git commit -m "feat: expose memory data lifecycle APIs"
```

### 任务 6：全量验证、文档与发布检查

**文件：**
- 修改：`README.md`
- 修改：`README.en.md`
- 修改：`USAGE.md`

- [ ] **步骤 1：补充用户文档**

在中英文使用文档中说明配置示例：

```js
{
  storagePath: '.dsh-memory.json',
  backupOnInitialize: true,
  backupRetentionDays: 30,
  backupRetentionCount: 10
}
```

并说明 `ctx.services.memory.backup()`, `listBackups()`, `restoreBackup(name)` 和 `applyRetention()` 的返回值与恢复前 safety backup 行为。

- [ ] **步骤 2：运行语法和全量单元测试**

运行：`npm run check; npm test -- --runInBand`

预期：语法检查通过，Jest 全部 PASS，无未处理 promise 或临时文件残留。

- [ ] **步骤 3：运行现有集成/打包检查**

运行：`npm run test:package; npm run test:integration`

预期：发布文件包含 `migrations.js` 和 `data-lifecycle.js`，现有安装和集成检查 PASS。

- [ ] **步骤 4：检查差异和工作区**

运行：`git diff --check; git status --short; git log --oneline -8`

预期：无空白错误；只包含本功能相关文件；所有预期提交存在。

- [ ] **步骤 5：提交文档与最终验证**

```bash
git add README.md README.en.md USAGE.md
git commit -m "docs: document memory data lifecycle operations"
```

最后重新运行 `npm test -- --runInBand`，确认文档提交没有引入回归。
