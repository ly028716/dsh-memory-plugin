# 真实浏览器 E2E 设计

## 目标

为本地 `viewer.html` 增加真实 Chromium 浏览器端到端测试，验证用户实际打开查看器、加载主数据、查看渲染结果、清理查看器缓存并重新从源文件加载的完整流程。

## 范围与约束

- 本次只覆盖本地 Web 查看器，不覆盖需要外部 DSH Web client 的设置卡或 Agent UI。
- 使用 Playwright Test runner 和 Chromium；不把浏览器 E2E 混入 Jest/jsdom 测试。
- 通过本地 HTTP server 提供页面和固定测试数据，不使用 `file://`，避免浏览器对 fetch/localStorage 的差异。
- 测试数据固定、无秘密、每次运行隔离；测试不读写仓库中的 `.dsh-memory.json`。
- 本地没有浏览器二进制时测试明确失败并提示 `npx playwright install chromium`，不静默跳过。

## 文件与职责

- `playwright.config.js`：Chromium 项目、测试目录、超时、trace、截图、HTML/JUnit 报告和本地 webServer。
- `test/browser-server.js`：只暴露 `viewer.html` 和固定 `.dsh-memory.json` 的 HTTP server，支持 Playwright `webServer` 健康检查。
- `test/fixtures/browser-memory.json`：包含偏好、会话、项目和工具统计的最小稳定测试数据。
- `test/e2e/viewer.spec.js`：真实浏览器流程测试和页面对象辅助方法。
- `package.json`：加入 `@playwright/test` 开发依赖和 `test:browser-e2e` 脚本。
- `.gitignore`：忽略 Playwright 报告、测试结果、截图、trace 和视频产物。
- `.github/workflows/ci.yml`、`.github/workflows/release.yml`：安装 Chromium 并运行浏览器 E2E。
- `README.md`、`README.en.md`、`USAGE.md`：记录安装浏览器和运行命令。

## 测试服务器

`test/browser-server.js` 使用 Node 内置 `http`，监听 `PLAYWRIGHT_PORT` 或默认端口。允许的路由只有：

- `/` 和 `/viewer.html`：返回仓库根目录的 `viewer.html`。
- `/.dsh-memory.json`：返回 fixture JSON，并设置 `application/json`。
- 其他路径返回 404。

服务器启动后输出 `BROWSER_E2E_SERVER_READY`，收到 SIGINT/SIGTERM 时关闭监听。Playwright 的 `webServer` 等待 `http://127.0.0.1:<port>/viewer.html` 可访问，并在测试结束时回收子进程。

## Playwright 配置与产物

- `testDir` 为 `test/e2e`，只运行浏览器 spec。
- 使用 Chromium Desktop 配置；CI 使用单 worker，避免端口和产物竞争。
- 本地失败保留截图和 trace，CI 保留失败时的 screenshot/video/trace，并生成 HTML/JUnit 报告到 `playwright-report/` 与 `test-results/`。
- `forbidOnly` 在 CI 开启；CI 失败时上传报告作为 artifact。
- 不设置 `reuseExistingServer` 为 true，避免误测用户本地的旧服务。

## 测试场景

### 场景 1：从主文件加载并渲染

1. 清理当前浏览器 context 的 localStorage。
2. 打开 `/viewer.html`。
3. 等待 loading 消失、内容区域可见。
4. 断言版本、会话数、项目数和主题数统计卡片分别显示 fixture 值。
5. 断言用户偏好、项目名称、工具统计和最近主题真实出现在页面中。
6. 断言 localStorage 已缓存 `memory-plugin-data`，证明页面走过真实 fetch → cache 流程。

### 场景 2：清理查看器缓存不删除源数据

1. 先完成场景 1，确认页面已有数据。
2. 监听原生 `dialog`，接受缓存清理确认。
3. 点击“清除查看器缓存”，断言成功提示出现、`memory-plugin-data` 被移除、内容区域隐藏。
4. 刷新页面，断言页面再次显示相同 fixture 数据，并重新写入 localStorage。
5. 断言 `/.dsh-memory.json` 仍返回 200 且内容不变，证明清理的是查看器缓存而非源文件。

### 场景 3：导出动作产生浏览器下载

1. 打开并等待数据加载。
2. 监听 download 事件并点击“导出数据”。
3. 接受导出完成提示。
4. 断言下载文件名匹配 `memory-backup-YYYY-MM-DD.json`，内容能解析为 fixture 数据。

## 稳定性与错误处理

- 所有等待使用 locator 可见性、页面响应或 download 事件，不使用固定 sleep。
- 每个测试创建新的 browser context，确保 localStorage、dialog 和下载状态隔离。
- 服务器无法启动、fixture 无法读取、浏览器缺失或页面加载超时均让测试失败并输出诊断信息。
- 测试只断言用户可观察行为，不依赖页面内部 `currentData` 等实现变量。

## 验收标准

- 本地执行 `npx playwright install chromium` 后，`npm run test:browser-e2e` 在真实 Chromium 中通过。
- CI 在 Node 20 和 Node 22 矩阵中安装 Chromium 并运行该命令，失败产物可下载。
- 现有 Jest、DSH integration、package 和 clean-profile E2E 继续通过。
- 不修改业务查看器行为；如真实浏览器发现问题，只做满足场景所需的最小修复并增加回归断言。
