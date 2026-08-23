# 发布后 npm / GitHub artifact 安装验证设计

## 目标

在版本 tag 的 GitHub Release 流程中，验证用户实际拿到的两个发布渠道都能安装并加载插件：

1. npm registry 中当前精确版本的包。
2. 当前 GitHub Release 附带的 `.tgz` artifact。

验证必须发生在发布动作完成之后，避免只验证源码或本地 `npm pack` 产物。

## 范围

### 包含

- Release workflow 使用 `npm publish` 发布构建出的精确 `.tgz`。
- 发布后从 npm registry 安装 `${packageName}@${version}`。
- 发布后下载当前 GitHub Release 的 `.tgz` 并安装。
- 两种安装都在独立临时目录中执行，避免复用仓库依赖或本地文件。
- 对安装结果执行统一 smoke test：
  - 根入口可加载，并导出 `name === 'memory'` 与 `apply` 函数；
  - `package.json` 中声明的 DSH bundle patch 文件存在；
  - profile doctor CLI 存在且 `doctor --help` 可运行；
  - `viewer.html`、`premium-viewer.html` 和 `open-viewer.cmd` 存在；
  - 安装版本与期望版本一致。
- npm 发布后短暂不可见时进行有限次数重试。
- 用 Jest 契约测试约束脚本、package script 和 release workflow 配置。
- 文档记录本地验证命令、GitHub Actions 所需的 `NPM_TOKEN` 和 `GH_TOKEN` 作用。

### 不包含

- 不验证 DSH CLI 对远端服务的完整安装流程；现有 `test:dsh-e2e` 继续负责源码级 DSH clean-profile 验证。
- 不验证生产环境中的 viewer HTTP 服务；现有真实浏览器 E2E 继续负责 viewer 行为。
- 不自动创建或修改 npm token、GitHub secret 或仓库保护规则。
- 不重复发布已存在的 npm 版本；tag 仍然要求对应版本只发布一次。

## 方案与数据流

Release workflow 按以下顺序执行：

```text
tag push
  → 源码、单元测试和本地 package artifact 验证
  → npm pack 生成唯一 .tgz
  → 上传 Actions artifact
  → 创建 GitHub Release 并附加 .tgz
  → npm publish 同一个 .tgz
  → 下载当前 GitHub Release .tgz
  → npm 精确版本安装 smoke test
  → GitHub .tgz 安装 smoke test
```

GitHub Release 下载使用 runner 自带的 `gh release download`，并通过 `GH_TOKEN` 访问当前仓库。npm 发布使用 `NPM_TOKEN`，通过 `actions/setup-node` 配置 npm registry 和认证。

## 验证脚本设计

新增 `test-release-install.js`，提供一个可在本地和 CI 使用的命令：

```text
npm run test:release-install -- --version <version> --github-tarball <path>
```

脚本行为：

1. 解析参数并校验版本、artifact 路径和包名。
2. 创建临时 npm consumer 和 GitHub artifact consumer 目录。
3. npm consumer 使用精确版本安装，并在 registry 最终一致性延迟期间有限重试。
4. artifact consumer 使用指定 `.tgz` 安装。
5. 对两个安装目录调用同一个 package smoke test。
6. 无论成功或失败都清理临时目录；失败时输出渠道、命令和 npm 错误摘要。

安装命令统一使用 `--ignore-scripts --omit=peer --no-audit --no-fund`，减少第三方生命周期脚本和无关网络行为，保留真实 npm 安装与 Node 入口验证。

## CI 配置

在 `.github/workflows/release.yml` 中：

- 使用 `npm publish dist/*.tgz --access public --provenance` 发布同一个 pack 产物。
- 发布步骤使用 `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`。
- 使用 `gh release download` 下载 `${{ github.ref_name }}` 的 `.tgz` 到临时目录。
- 传入 tag 去掉 `v` 后的版本号，运行 `npm run test:release-install`。
- 发布后验证失败时 job 失败，保留现有 release/browser 报告 artifact 供诊断。

现有 CI（push / pull_request）不访问 npm registry，不执行发布后安装验证，以避免把未发布版本误判为已发布版本。

## 错误处理与安全

- 缺少 `NPM_TOKEN`、npm 发布失败、Release asset 下载失败或任一安装 smoke test 失败，均立即失败并阻止 Release job 成功。
- npm registry 安装只对安装命令做有限重试，不重试发布操作，避免重复发布。
- token 只通过 GitHub Actions secret 注入环境变量，不写入文件、命令行参数或日志。
- 临时目录使用系统临时目录，脚本退出时递归清理。
- 只安装预期 package name 和当前版本，避免测试误用工作区路径。

## 测试策略

- 先添加失败的 release-contract Jest 测试，覆盖：
  - `test:release-install` package script；
  - 验证脚本的渠道和 smoke test 关键断言；
  - release workflow 的 npm publish、Release 下载和发布后验证步骤；
  - `NPM_TOKEN` / `GH_TOKEN` 的使用位置。
- 再实现脚本和 workflow，运行契约测试至通过。
- 本地不依赖真实 npm 发布：使用当前仓库生成 `.tgz` 作为 artifact 输入，并通过脚本的可配置 registry / retry 参数验证安装逻辑。
- 最终运行 `npm run check`、完整 Jest、`npm run test:package`、`npm run test:integration` 和现有真实浏览器 E2E。
- 真实发布后的 npm 与 GitHub artifact 安装验证由 tag-triggered Release workflow 执行。

## 成功标准

- tag Release workflow 发布 npm 包和 GitHub `.tgz` 后，两个渠道都能被独立临时 consumer 安装。
- 两种安装都通过统一的插件、DSH bundle、CLI 和 viewer smoke test。
- npm 最终一致性短暂延迟不会造成偶发失败，但真实发布错误仍会失败。
- 普通 CI 不需要发布凭据，现有测试和浏览器 E2E 行为保持不变。
