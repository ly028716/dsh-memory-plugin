# P2 推荐、校验与脱敏加固设计

## 目标

修复四个不影响现有存储格式的 P2 问题：推荐接口忽略上下文、模式阈值配置未生效、嵌套存储路径错误不明确，以及敏感字段规则误伤普通字段。

## 设计边界

### 推荐上下文与阈值

`getRecommendations(context)` 保持现有返回结构。`context` 为空时维持通用推荐；有上下文时，对命令和项目进行大小写不敏感的文本匹配，优先返回匹配项，无匹配时回退到通用项。

命令推荐只包含 `count >= patternRecognitionThreshold` 的模式。偏好 Agent 和模型不受该阈值影响，避免改变现有偏好语义。

### 存储路径错误

`MemoryStorage.set()` 在写入最终字段前检查所有中间节点。中间节点为 `null`、数组或基本类型时，抛出统一的 `Cannot set nested storage path: <path>` 错误，不让原生 `TypeError` 泄漏给调用方。

### 脱敏字段匹配

将对象键脱敏从宽泛子串匹配改为分词后的完整 token 匹配。支持 `auth`、`authToken`、`authorization`、`apiKey`、`clientSecret`、`AWS_SECRET_ACCESS_KEY` 等敏感字段，但不误伤 `author`、`oauthProvider` 等普通字段。

## 测试策略

- 推荐测试上下文过滤、无匹配回退和阈值过滤。
- 存储测试已有 `null` 中间节点时返回稳定错误。
- 隐私测试验证敏感字段仍脱敏，普通 `author` 和 `oauthProvider` 保持原值。
- 完成后运行全量 Jest、DSH 集成、安装、快速测试和语法检查。
