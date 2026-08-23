# 社区治理文档与 GitHub 模板设计

## 目标

为 `@ly028716/dsh-memory-plugin` 补齐公开协作所需的安全策略、版本变更记录和 GitHub 协作模板。文档以中文为主，在标题或关键字段保留简短英文提示，便于国际贡献者理解。

本次不修改运行代码、npm 发布流程或 Release 行为。

## 文件与职责

| 文件 | 职责 |
|------|------|
| `SECURITY.md` | 声明当前受支持版本、私密漏洞报告渠道、响应流程和报告内容边界。 |
| `CHANGELOG.md` | 使用 Keep a Changelog 结构记录用户可见变更；包含 `Unreleased` 与 `1.0.0` 初始版本。 |
| `.github/ISSUE_TEMPLATE/bug_report.md` | 收集可复现的缺陷信息、环境、日志与安全影响说明。 |
| `.github/ISSUE_TEMPLATE/feature_request.md` | 收集问题背景、预期方案、替代方案和兼容性影响。 |
| `.github/pull_request_template.md` | 约束 Pull Request 的摘要、验证、文档、破坏性变更与安全检查。 |

## 安全策略

- 仅列出当前主线 `1.0.x` 为受支持版本；历史版本不再接收安全修复。
- 漏洞不得通过公开 Issue 披露。报告者应通过 GitHub 仓库维护者的私密联系渠道提交，并包含影响范围、复现步骤与建议修复方向。
- 维护者目标是在 7 个自然日内确认收悉；修复和披露时间视影响范围协商确定。
- 文档不承诺固定漏洞赏金或 SLA，也不要求报告者提供敏感数据。

## 变更日志规则

- 顶部保留 `Unreleased`，只记录已合并、面向用户的变更。
- 使用 `Added`、`Changed`、`Fixed`、`Security` 分类；避免把内部格式化或测试重排写入用户变更日志。
- `1.0.0` 初始条目概括插件能力、数据生命周期能力和发布验证保障，不伪造发布日期。

## Issue 与 Pull Request 流程

- 两份 Markdown Issue 模板均使用 GitHub front matter，自动预填标题前缀、标签和内容骨架。
- Bug 模板要求提供版本、运行环境、复现步骤、预期与实际结果；明确不得粘贴 Token、私钥或真实个人数据。
- 功能请求模板要求说明待解决的问题、期望行为、替代方案以及对隐私、兼容性或迁移的影响。
- PR 模板要求贡献者确认测试命令、文档更新、破坏性变更、数据迁移与安全影响；不强制与本次无关的项目检查。

## 验证

- 使用 Jest 增加面向文档的契约测试：验证 5 个文件存在，且包含安全报告、版本支持、`Unreleased`、必需的 Issue/PR 字段与防泄密提示。
- 运行 `npm test -- --runInBand`、`npm run check` 和 `git diff --check`。

## 范围边界

- 不引入 GitHub 表单 YAML、自动分流机器人、Code of Conduct 或贡献者许可协议。
- 不修改 `package.json` 的发布配置，不新增外部服务或密钥。
