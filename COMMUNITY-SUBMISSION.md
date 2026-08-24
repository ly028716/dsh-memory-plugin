# 社区插件目录提交材料 / Community Directory Submission

## 条目

- 稳定 ID：`ly028716/dsh-memory-plugin`
- 分类：`memory`
- 检索标签：`dsh-category-memory`
- 仓库：[ly028716/dsh-memory-plugin](https://github.com/ly028716/dsh-memory-plugin)
- 机器可读条目：[community/registry-entry.json](community/registry-entry.json)

`dsh-category-memory` 是现有插件的社区分类和检索标识，不是第二个 npm 包。

## 安装信息

普通用户：

```bash
dsh plugin --profile web add @ly028716/dsh-memory-plugin
```

CI、审计和复现环境：

```bash
dsh plugin --profile web add github:ly028716/dsh-memory-plugin#<40-character-commit-sha>
```

`<40-character-commit-sha>` 必须替换成完整 40 位 SHA；短 SHA、浮动分支或未固定的 GitHub spec 不属于 pinned commit 安装。

## 提交前验证

```bash
npm test -- --runInBand
npm run check
npm run test:pinned-commit
npm run test:package
git diff --check
```

目录审核应以仓库中的 `package.json`、`cordis.patch.yml`、安装测试和 pinned commit 测试为证据。提交方不应把动态 star、未经验证的兼容性或 `verified` 状态写成事实。

## 安全与范围声明

目录收录不构成官方认证、安全审计或兼容性保证。插件默认关闭自动采集，数据保存在用户本地；使用者仍应在安装前审查源代码、权限、依赖和安装行为。

## 提交流程

1. 在目标社区目录创建或更新条目。
2. 将 `community/registry-entry.json` 作为字段来源。
3. 提供一个已推送的完整 commit SHA，替换文档和条目中的 `<40-character-commit-sha>`。
4. 附上上述验证命令的结果，等待社区目录审核。
