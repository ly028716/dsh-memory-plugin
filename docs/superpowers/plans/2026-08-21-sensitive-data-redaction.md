# 敏感数据脱敏实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans（当前会话采用内联执行）逐任务实现此计划。步骤使用复选框语法来跟踪进度。

**目标：** 在所有自动采集数据进入 MemoryStorage 前脱敏，避免密钥、令牌、密码、私钥和用户目录信息落盘。

**架构：** 新增无状态的 `privacy.js`，集中处理字符串、对象和项目路径。`MemoryManager` 在工具命令、偏好、会话内容和项目上下文的写入边界调用它；存储层保持通用，不承担业务语义。

**技术栈：** Node.js CommonJS、Jest 现有测试结构、原生正则与递归遍历，不新增依赖。

---

### 任务 1：建立脱敏器行为测试

**文件：**
- 创建：`test/privacy.test.js`

- [x] **步骤 1：编写失败测试**

覆盖以下行为：

```js
const { redactSensitiveData, redactProjectPath } = require('../privacy');

test('redacts CLI secrets and preserves command shape', () => {
  expect(redactSensitiveData('deploy --api-key=abc123 --region cn')).toBe(
    'deploy --api-key=[REDACTED] --region cn'
  );
});

test('redacts environment assignments and bearer tokens', () => {
  const value = redactSensitiveData(
    'OPENAI_API_KEY=sk-test Authorization: Bearer eyJsecret'
  );
  expect(value).toContain('OPENAI_API_KEY=[REDACTED]');
  expect(value).toContain('Authorization: Bearer [REDACTED]');
  expect(value).not.toContain('sk-test');
  expect(value).not.toContain('eyJsecret');
});

test('redacts sensitive object fields recursively', () => {
  expect(redactSensitiveData({ token: 'secret', nested: { password: 'pw' } })).toEqual({
    token: '[REDACTED]',
    nested: { password: '[REDACTED]' }
  });
});

test('redacts URL query values and PEM blocks', () => {
  const value = redactSensitiveData(
    'https://example.test?api_key=url-secret -----BEGIN PRIVATE KEY----- private -----END PRIVATE KEY-----'
  );
  expect(value).not.toContain('url-secret');
  expect(value).not.toContain('private');
  expect(value).toContain('[REDACTED]');
});

test('masks usernames in common absolute user paths', () => {
  expect(redactProjectPath('C:\\Users\\Alice\\repo')).toBe('C:\\Users\\[USER]\\repo');
  expect(redactProjectPath('/home/alice/repo')).toBe('/home/[USER]/repo');
});
```

- [x] **步骤 2：运行测试确认正确失败**

运行：`npx jest test/privacy.test.js --runInBand`

预期：FAIL，模块 `../privacy` 尚不存在。

### 任务 2：实现纯函数脱敏器

**文件：**
- 创建：`privacy.js`
- 修改：`package.json`

- [x] **步骤 1：实现最少代码**

实现 `redactSensitiveData(value)`：

```js
const REDACTED = '[REDACTED]';

function redactSensitiveData(value) {
  // 递归处理敏感字段，并对字符串应用命令/URL/Authorization/PEM 规则。
}
```

使用 `WeakMap` 防止循环对象递归失控；敏感字段名匹配 `key|token|secret|password|authorization|credential|cookie|private`，匹配值直接替换；其他字符串按规则替换。

实现 `redactProjectPath(value)`，将 Windows `Users`/`Documents and Settings` 和 Unix `home`/`Users` 路径中的第一个用户名替换为 `[USER]`。

将 `privacy.js` 加入 npm bundle 的 `files` 列表。

- [x] **步骤 2：运行脱敏器测试确认通过**

运行：`npx jest test/privacy.test.js --runInBand`

预期：全部测试通过。

### 任务 3：接入 MemoryManager 写入边界

**文件：**
- 修改：`memory-manager.js`
- 修改：`test/memory-manager.test.js`

- [x] **步骤 1：先添加失败的集成行为测试**

添加测试：调用 `recordToolCall()`、`recordPreference()`、`recordSessionItem()` 和 `recordProjectContext()` 后，检查 `exportData()` 以及重新加载的 JSON 不含 `SECRET_VALUE`、原始用户目录名和原始密码。

- [x] **步骤 2：运行新增测试确认失败**

运行：`npx jest test/memory-manager.test.js --runInBand`

预期：新增断言失败，当前实现会保存命令、偏好和会话原文。

- [x] **步骤 3：实现最少接入**

在四个写入边界分别调用：

```js
const { redactSensitiveData, redactProjectPath } = require('./privacy');

const safeCommand = redactSensitiveData(args.command);
const safeValue = redactSensitiveData(value);
const safeContent = redactSensitiveData(content);
const safeProject = redactSensitiveData({ ...projectInfo, path: redactProjectPath(projectInfo.path) });
```

保留工具名称和统计行为，不写入工具结果原文。

- [x] **步骤 4：运行 MemoryManager 测试确认通过**

运行：`npx jest test/memory-manager.test.js --runInBand`

预期：原有测试与新增脱敏测试全部通过。

### 任务 4：全量回归与安全检查

**文件：**
- 修改：`README.md`
- 修改：`README.en.md`

- [x] **步骤 1：更新配置文档**

明确 `encryptSensitiveData` 为兼容保留字段，自动脱敏始终启用；示例中不再暗示关闭该字段可以关闭保护。

- [x] **步骤 2：运行项目回归**

运行：

```powershell
npx jest --runInBand
node test-integration.js
node test-install.js
node test-quick.js
node --check privacy.js
git diff --check
```

预期：命令均退出码 0，敏感字符串不存在于测试生成的持久化数据中，工作区仅包含本功能相关变更。

- [x] **步骤 3：检查 bundle 和 Git 状态**

运行：`git status --short --branch; git diff --stat`

预期：`privacy.js` 被 bundle 收录，未出现未预期文件或敏感测试数据。
