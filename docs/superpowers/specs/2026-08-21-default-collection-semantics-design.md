# 默认采集语义设计

## 目标

让“默认不自动采集”成为真实、可验证的隐私语义，同时保留用户显式调用记忆 API 的能力。

## 约定

- `trackToolCalls`、`trackPreferences`、`trackProjectContext`、`trackSessionHistory` 只控制自动采集。
- 四个开关全部为 `false` 时，插件启动只初始化内存中的默认数据，不创建或写入持久化文件，也不增加 `metadata.totalSessions`。
- 用户显式调用 `setPreference`、`recordTopic`、`recordTask`、`addProject`、`storage.set` 或 `importData` 时，允许初始化并持久化数据，即使对应自动采集开关仍为 `false`。
- 自动工具事件仍只在 `trackToolCalls: true` 时注册和记录。
- 只要至少一个自动采集开关为 `true`，启动就加载/创建持久化文件，并记录一次会话元数据。

## 数据流

插件启动 -> 判断是否启用自动采集 -> 非自动模式使用内存默认值 / 自动模式持久化初始化 -> 暴露 `memory` 服务。

显式 API -> 等待初始化 -> 必要时创建持久化存储 -> 脱敏、校验并保存。

## 验收标准

1. 默认配置启动后，目标文件不存在，`totalSessions` 不发生持久化变化。
2. 默认配置下显式设置偏好、记录主题和添加项目后，数据可读且重载后仍存在。
3. 开启任一自动采集开关后，启动行为保持现有会话计数和持久化语义。
4. 工具事件默认不注册，开启 `trackToolCalls` 后仍能注册并记录。
5. 中英文文档明确区分自动采集开关与显式 API。
