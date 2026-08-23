# 发布后 npm / GitHub artifact 安装验证实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在 tag Release 之后从 npm registry 和 GitHub Release `.tgz` 分别安装当前版本，并对两个安装结果运行相同的插件 smoke test。

**架构：** 新增一个 Node 脚本，在独立临时 consumer 目录中安装 npm 精确版本和指定的 GitHub `.tgz`，随后复用统一断言检查入口、DSH bundle、CLI 和 viewer 文件。Release workflow 先创建 Release 和发布 npm 包，再下载 Release asset 调用该脚本；Jest 契约测试锁定这些行为。

**技术栈：** Node.js 20、npm CLI、Jest、GitHub Actions、GitHub CLI。

---

## 文件职责

- 新建：`test-release-install.js` — 两个发布渠道的隔离安装与统一 smoke test。
- 修改：`package.json` — 暴露 `test:release-install` 命令。
- 修改：`test/release-ci.test.js` — 对脚本、package script 和 Release workflow 增加回归契约。
- 修改：`.github/workflows/release.yml` — 发布 npm、下载 GitHub Release asset、调用发布后安装验证。
- 修改：`README.md`、`README.en.md`、`INSTALL.md` — 说明发布后的验证命令与所需 secret。

### 任务 1：先锁定发布后验证契约

**文件：**
- 修改：`test/release-ci.test.js`
- 测试：`test/release-ci.test.js`

- [ ] **步骤 1：编写失败的 Jest 契约测试**

在 `test/release-ci.test.js` 新增测试，要求 package script、验证脚本和 workflow 都存在：

```js
test('should verify installations from published npm and GitHub release artifacts', () => {
  const rootDir = path.join(__dirname, '..');
  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const workflow = fs.readFileSync(path.join(rootDir, '.github', 'workflows', 'release.yml'), 'utf8');
  const script = fs.readFileSync(path.join(rootDir, 'test-release-install.js'), 'utf8');

  expect(packageJson.scripts['test:release-install']).toBe('node test-release-install.js');
  expect(script).toContain('--github-tarball');
  expect(script).toContain('npm_config_registry');
  expect(script).toContain('doctor');
  expect(script).toContain('viewer.html');
  expect(workflow).toContain('npm publish dist/*.tgz --access public --provenance');
  expect(workflow).toContain('NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}');
  expect(workflow).toContain('gh release download');
  expect(workflow).toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
  expect(workflow).toContain('npm run test:release-install');
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm test -- --runInBand test/release-ci.test.js`

预期：FAIL，因为尚未存在 `test:release-install` 和 `test-release-install.js`。

- [ ] **步骤 3：提交红灯测试**

```bash
git add test/release-ci.test.js
git commit -m "test: specify post-release install verification"
```

### 任务 2：实现可复用的发布渠道安装 smoke test

**文件：**
- 新建：`test-release-install.js`
- 修改：`package.json`
- 测试：`test/release-ci.test.js`

- [ ] **步骤 1：实现参数解析和 npm 命令封装**

在 `test-release-install.js` 实现 `parseArguments(argv)`，只接受：

```js
{
  version: '1.0.0',
  githubTarball: '/absolute/path/dsh-memory-plugin-1.0.0.tgz',
  npmTarball: undefined,
  registry: 'https://registry.npmjs.org',
  retries: 5,
  retryDelayMs: 10000
}
```

实现 `runNpm(args, cwd, env)`：沿用 `test-package.js` 的 `npm_execpath` 回退逻辑，使用 `execFileSync`，并注入隔离的 `npm_config_cache`、`npm_config_registry`、`npm_config_update_notifier=false`、`npm_config_fund=false`。

- [ ] **步骤 2：实现两个安装通道**

实现 `installFromNpm` 和 `installFromTarball`。二者都使用：

```js
['install', '--no-save', '--package-lock=false', '--ignore-scripts', '--omit=peer', '--no-audit', '--no-fund', source]
```

`installFromNpm` 的 `source` 必须是 `${packageJson.name}@${version}`，在失败时仅重试安装命令；`--npm-tarball` 存在时将其作为 npm-channel 的本地替代输入，仅用于本地无发布 smoke test。`installFromTarball` 必须验证 `--github-tarball` 是存在的 `.tgz` 文件。

- [ ] **步骤 3：实现统一安装断言**

实现 `verifyInstalledPackage(consumerDir, channel, version)`，并对每个 channel 断言：

```js
const installedRoot = path.join(consumerDir, 'node_modules', packageJson.name);
const plugin = require(installedRoot);
const installedPackage = require(path.join(installedRoot, 'package.json'));

if (installedPackage.version !== version) throw new Error(`${channel} installed an unexpected version`);
if (plugin.name !== 'memory' || typeof plugin.apply !== 'function') {
  throw new Error(`${channel} package does not expose the DSH plugin API`);
}
```

再断言 `installedPackage.dsh.bundle.patch` 指向的文件、`bin/dsh-memory-plugin.js`、`profile-doctor.js`、`viewer.html`、`premium-viewer.html`、`open-viewer.cmd` 存在；执行 `node bin/dsh-memory-plugin.js doctor --help`，并要求输出包含 `dsh-memory-plugin doctor`。

- [ ] **步骤 4：串联执行与清理**

主程序创建 `fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-memory-release-install-'))`，为 npm 与 GitHub artifact 创建独立 consumer 目录，依序安装并验证。`finally` 中使用 `fs.rmSync(tempDir, { recursive: true, force: true })`。成功时打印两个 channel 与 `${packageJson.name}@${version}`；失败时保留 channel 名称、原始 npm stdout/stderr 摘要。

- [ ] **步骤 5：注册 package script 并运行契约测试**

在 `package.json` 的 `scripts` 中加入：

```json
"test:release-install": "node test-release-install.js"
```

运行：`npm test -- --runInBand test/release-ci.test.js`

预期：PASS。

- [ ] **步骤 6：执行本地双 tarball smoke test**

运行：

```powershell
New-Item -ItemType Directory -Force dist | Out-Null
npm pack --pack-destination dist
$artifact = (Get-ChildItem dist -Filter '*.tgz' | Select-Object -First 1).FullName
npm run test:release-install -- --version 1.0.0 --npm-tarball $artifact --github-tarball $artifact
```

预期：npm-channel 与 github-artifact-channel 都 PASS，且不会访问 registry。

- [ ] **步骤 7：提交实现**

```bash
git add test-release-install.js package.json test/release-ci.test.js
git commit -m "test: verify published release installations"
```

### 任务 3：在 tag Release 中发布并验证真实渠道

**文件：**
- 修改：`.github/workflows/release.yml`
- 测试：`test/release-ci.test.js`

- [ ] **步骤 1：配置 npm registry 与 provenance 发布**

在现有 `Setup Node.js` step 添加：

```yaml
registry-url: https://registry.npmjs.org
```

在 `Create GitHub release` 后添加：

```yaml
      - name: Publish package to npm
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: npm publish dist/*.tgz --access public --provenance
```

- [ ] **步骤 2：下载 Release asset 并运行安装验证**

在 publish step 后添加：

```yaml
      - name: Download GitHub Release artifact
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          mkdir -p "$RUNNER_TEMP/release-artifact"
          gh release download "$GITHUB_REF_NAME" --repo "$GITHUB_REPOSITORY" --pattern "*.tgz" --dir "$RUNNER_TEMP/release-artifact"

      - name: Verify published npm and GitHub artifact installations
        run: |
          release_version="${GITHUB_REF_NAME#v}"
          github_tarball="$(find "$RUNNER_TEMP/release-artifact" -maxdepth 1 -name '*.tgz' -print -quit)"
          test -n "$github_tarball"
          npm run test:release-install -- --version "$release_version" --github-tarball "$github_tarball"
```

- [ ] **步骤 3：运行契约测试验证通过**

运行：`npm test -- --runInBand test/release-ci.test.js`

预期：PASS，workflow 包含发布凭据、Release 下载和发布后验证。

- [ ] **步骤 4：提交 workflow**

```bash
git add .github/workflows/release.yml test/release-ci.test.js
git commit -m "ci: verify npm and release artifact installs"
```

### 任务 4：记录维护者操作与全面验证

**文件：**
- 修改：`README.md`
- 修改：`README.en.md`
- 修改：`INSTALL.md`

- [ ] **步骤 1：补充中英文维护者说明**

在三个文档的测试/发布章节加入：

```text
Release tags require an NPM_TOKEN repository secret. After publishing, the Release workflow installs the exact npm version and the GitHub Release .tgz in isolated temporary consumers, then verifies the plugin entry, DSH bundle patch, doctor CLI, and viewer files.
```

同时提供无需网络的本地命令：先 `npm pack --pack-destination dist`，再向 `test:release-install` 同时传入 `--npm-tarball` 与 `--github-tarball`。

- [ ] **步骤 2：运行静态检查和完整 Jest**

运行：

```bash
npm run check
npm test -- --runInBand
```

预期：所有语法检查通过，全部 Jest suite 通过。

- [ ] **步骤 3：运行发布相关和集成检查**

运行：

```bash
npm run test:package
npm run test:integration
git diff --check
```

预期：每个命令 exit 0，diff 无空白错误。

- [ ] **步骤 4：运行真实浏览器 E2E**

运行：`npm run test:browser-e2e -- --workers=1`

预期：3 个 viewer Chromium E2E 测试通过。

- [ ] **步骤 5：提交文档与最终结果**

```bash
git add README.md README.en.md INSTALL.md
git commit -m "docs: explain release install verification"
```

完成后报告所有命令的实际输出、未执行真实发布验证的原因（该验证仅在 tag Release 发生），并等待用户选择如何合并分支。
