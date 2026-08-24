# 推荐效果指标设置卡设计

## 目标

扩展 DSH Web Memory 设置卡，使用户可以查看当前进程内完整的推荐效果指标，同时保持现有指标 API、设置绑定和隐私边界不变。

## 展示范围

设置卡只读展示 `getRecommendationMetrics()` 已提供的字段：

- 请求数：`requests`
- 可用请求数：`availableRequests`
- 上下文请求数：`contextualRequests`
- 上下文命中数：`contextMatches`
- 回退请求数：`fallbackRequests`
- 建议数：`suggestions`
- 上下文命中率：`contextMatchRate`
- 回退率：`fallbackRate`

比率使用现有的百分比格式化逻辑；`null` 或无指标时显示安全的暂无数据/空状态。设置卡不展示 `patternRecognitionThreshold`，因为它是计算配置而非效果结果。

## 数据流与边界

`settingsScope` binding status.recommendations → `readRecommendationMetrics()` → 设置卡 `recommendations` props → 只读指标文本。指标仍只在进程内聚合，不写入记忆文件、设置 schema 或外部服务。缺少宿主指标、字段类型错误或读取异常时保持当前空状态，不影响六个设置开关。

## 测试

- `client.test.js` 验证完整指标字段被保留并渲染为可读文本。
- 测试覆盖 `null` 比率和可选指标空状态，确保无运行时异常。
- 完成后运行全量 Jest、语法检查、包验证和 `git diff --check`。

## 非目标

- 不新增点击率、采纳率或用户行为埋点。
- 不修改推荐算法、指标计算公式、设置字段或记忆文件格式。
- 不引入新的依赖或外部遥测服务。
