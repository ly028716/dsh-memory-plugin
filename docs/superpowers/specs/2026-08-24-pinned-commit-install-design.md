# Pinned Commit 安装示例设计

## 目标

为社区目录和 CI/审计用户提供可直接复制的 GitHub pinned commit 安装命令，同时保留可复用的占位符模板，避免文档、社区条目和测试使用不同的提交版本。

## 方案

- 以当前已推送的完整 commit SHA `6fce10ecf9cd796d46a7848aec7af07ff1ff0e18` 作为可执行示例。
- 在中文和英文安装文档、社区提交说明以及 `community/registry-entry.json` 中使用相同的 pinned spec。
- 保留 `<40-character-commit-sha>` 模板，并明确要求后续维护者替换为完整 40 位十六进制 SHA。
- 普通用户的 npm 安装方式保持不变；pinned commit 仅用于 CI、审计和可复现验证。

## 校验

社区注册测试将验证 pinned SHA 的长度和字符集、所有安装文档使用同一个 SHA，以及社区目录命令包含该 SHA。实现前先让新增断言失败，再更新文档和条目使其通过。

## 非目标

- 不修改插件运行时、安装器或 DSH CLI 行为。
- 不把 pinned commit 作为 npm 包用户的默认安装方式。
- 不自动跟踪未来提交；新提交发布后需要维护者显式更新示例和验证结果。
