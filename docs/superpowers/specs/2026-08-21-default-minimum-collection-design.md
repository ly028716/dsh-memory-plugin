# 默认最小采集设计

## 目标

将插件的默认行为改为严格显式开启：首次加载时不自动采集工具调用、用户偏好、项目上下文或会话历史，避免用户未明确同意就产生行为数据。

## 设计

将 `trackToolCalls`、`trackPreferences`、`trackProjectContext` 和 `trackSessionHistory` 的默认值全部设为 `false`。现有 `MemoryManager` 的开关判断和 `index.js` 的事件注册逻辑已经支持按配置关闭，因此不新增运行时分支。

插件仍初始化本地存储文件和基础结构，以保证 Service API 可用；默认不会注册 `tools/result` 监听器，也不会记录当前工作目录。推荐功能保留启用，但无用户数据时返回空推荐结果。用户显式设置任意采集开关为 `true` 后，原有行为保持不变，并继续经过既有脱敏链路。

## 文档与测试

- 默认配置测试验证四项开关均为 `false`。
- 集成测试继续使用显式 `true`，验证 opt-in 模式兼容。
- README 中的默认配置改为 `false`，并明确说明采集能力需要显式开启。
