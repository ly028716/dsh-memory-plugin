# dsh-memory-plugin

> Intelligent memory system for DSH - Track user preferences, tool usage, and project context to provide personalized recommendations

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)](package.json)
[![DSH Plugin](https://img.shields.io/badge/DSH-plugin-purple.svg)](https://github.com/deepseek-ai/deepseek-harness)

<div align="center">

[简体中文](README.md) | **English**

</div>

---

## 🌟 Overview

dsh-memory-plugin is an intelligent memory system plugin designed for DeepSeek Harness (DSH). It automatically learns user habits, remembers preferences, tracks project context, and provides personalized smart recommendations based on this data, significantly improving development efficiency and work experience.

Community category: `dsh-category-memory`. See [COMMUNITY-SUBMISSION.md](COMMUNITY-SUBMISSION.md) for the directory submission material; community listing is not an official endorsement.

## ✨ Key Features

- **🎯 Smart Recommendation Engine** - Automatically recommends the best models, Agents, and tool configurations based on historical data
- **📊 Tool Usage Tracking** - Automatically records usage frequency of common tools (read, write, edit, glob, grep, etc.)
- **👤 Preference Memory** - Remembers preferred Agents, LLMs, language settings, and coding styles
- **📁 Project Context** - Tracks active projects, access history, and project tags
- **💬 Session History** - Records discussion topics, completed tasks, and work patterns
- **💾 Persistent Storage** - Local JSON storage with auto-save, import, and export support
- **🔒 Privacy Protection** - Fully local storage, no cloud sync, complete user control over data
- **🎨 Web Viewer** - Beautiful visualization interface for intuitive memory data display

## 🚀 Quick Start

### One-Click Install (Recommended)

**For Windows users:**

```bash
# Option 1: Double-click
install.bat

# Option 2: PowerShell
.\install.ps1
```

The script will automatically:
- 🔍 Find DSH configuration directory
- 📦 Copy or create symbolic link
- ✅ Verify installation result

### Manual Installation

#### Option 1: As a Local Plugin

```bash
# Clone the repository
git clone https://github.com/ly028716/dsh-memory-plugin.git

# Add to DSH profile directory
cd ~/.dsh/profiles
dsh plugin --profile <name> add /path/to/dsh-memory-plugin
```

#### Option 2: Install from npm (Recommended)

```bash
dsh plugin --profile <name> add @ly028716/dsh-memory-plugin
cd <DSH_HOME>/profiles/<name>
pnpm exec dsh-memory-plugin doctor --profile <name> --fix
```

Run `doctor` from the profile directory through `pnpm exec`; it performs a read-only check by default.
On Windows, if DSH reports that a managed package
is not a junction, run it explicitly with `--fix`. It moves physical directories into a timestamped
backup and never deletes them. GitHub pinned-commit installation is reserved for CI and reproducible
verification; npm is the normal user installation path.

#### DSH CLI compatibility

This plugin supports DSH CLI `>=0.1.1-rc.2 <0.2.0`. The real install test uses an npm packed tarball;
GitHub source installation tests must use a full 40-character commit SHA.

Use the same DSH command for the published package and reproducible pinned-commit installs:

```bash
# npm release (recommended)
dsh plugin --profile <name> add @ly028716/dsh-memory-plugin

# GitHub pinned commit (CI/audit; replace with the full 40-character SHA)
dsh plugin --profile <name> add "git+https://github.com/ly028716/dsh-memory-plugin.git#<commit-sha>"

# Community registry spec (replace the placeholder with a full 40-character SHA)
dsh plugin --profile web add github:ly028716/dsh-memory-plugin#<40-character-commit-sha>

# Current pinned commit (CI/audit)
dsh plugin --profile web add github:ly028716/dsh-memory-plugin#6fce10ecf9cd796d46a7848aec7af07ff1ff0e18
```

#### Release maintainers: post-release installation verification

This section is for maintainers only and does not change the normal npm installation path for users.
Before creating a tag Release, configure the `NPM_TOKEN` repository secret. The release pipeline first
checks that the tag and package version match, produces a tarball, publishes to npm, and creates or reuses
a draft GitHub Release. It then runs isolated installation smoke tests from npm and from the exact Release
asset; the Release becomes public only after both checks pass.

The smoke test checks the plugin entry point, DSH bundle patch, doctor CLI, and viewer assets. `GH_TOKEN`
is supplied by GitHub Actions and is used only to create, download, and publish the GitHub Release; no manual configuration is required.

To simulate both installation channels locally without network access, use the same tarball for each:

```bash
npm pack --pack-destination dist
npm run test:release-install -- --version <package-version> --npm-tarball dist/<package-tarball>.tgz --github-tarball dist/<package-tarball>.tgz
```

#### Option 3: Direct Code Integration

```javascript
const memoryPlugin = require('./dsh-memory-plugin');

// Create DSH context
const ctx = {
  _services: {},
  effect(fn) { /* ... */ },
  provide(name, service) {
    this._services[name] = service;
  }
};

// Apply plugin
memoryPlugin.apply(ctx, {
  storagePath: '.dsh-memory.json',
  trackToolCalls: true,
  enableRecommendations: true
});
```

Initialization is asynchronous. Await `ctx.memory.ready` before the first read that needs persisted data; write APIs wait for initialization automatically:

```javascript
await ctx.memory.ready;
const stats = ctx.memory.getStats();
```

### Basic Usage

The plugin does not collect data automatically by default. Startup also does not create a memory file or increment the session count. The four `track*` toggles control automatic collection only; explicit `ctx.memory` API calls still write and persist data:

```javascript
// Get smart recommendations
const recs = ctx.memory.getRecommendations('coding');

// Set preferences
await ctx.memory.setPreference('defaultModel', 'qwen3.7-plus');
await ctx.memory.setPreference('preferredAgents', ['coding-assistant']);

// Record sessions
await ctx.memory.recordTopic('implement authentication');
await ctx.memory.addProject({
  path: '/projects/my-app',
  name: 'my-app',
  tags: ['react', 'typescript']
});

// View statistics
const stats = ctx.memory.getStats();
console.log(stats);
```

### Default Collection Semantics

- `trackToolCalls`, `trackPreferences`, `trackProjectContext`, and `trackSessionHistory` default to `false` and control their respective automatic collection paths.
- With the default configuration, startup keeps an empty memory in RAM, does not create `.dsh-memory.json`, and does not record `metadata.totalSessions`.
- `setPreference()`, `recordTopic()`, `recordTask()`, `addProject()`, `storage.set()`, and `importData()` are explicit operations and persist data even when automatic collection is disabled.
- Enabling any automatic collection toggle makes startup load or create the storage file and record one session in the metadata.

### Data migration, backup, and restore

Memory files are migrated forward to the current data version during loading. When a storage file already exists, startup creates a raw pre-migration snapshot in `.dsh-memory.json.backups/` by default. Backups remain local and use atomic writes with private file permissions.

```javascript
// Create and list snapshots, then restore a selected snapshot
const snapshot = await ctx.memory.backup();
const backups = await ctx.memory.listBackups();
await ctx.memory.restoreBackup(snapshot.name);

// Remove snapshots outside the retention policy
await ctx.memory.applyRetention();
```

Restore creates a `restore-safety` snapshot first, then validates JSON, size limits, and the data version. The defaults retain snapshots from the last 30 days and at least the 10 most recent snapshots; a snapshot is deleted only when it is both older than the time limit and outside the count limit.

### DSH Agent prompt/tool integration

In a compatible DSH profile, the plugin connects memory to the Agent:

- The `prompt context` is a read-only, bounded, redacted `Memory context (user-controlled local memory):` block. It reads the latest explicit memory during every prompt assembly, so the Agent can use it when choosing model, tool, or workflow recommendations. Memory remains user-controlled data, not system instructions.
- The Agent tool is named `memory` and supports `search` (keyword/category lookup), `remember` (explicitly write a `preference`, `topic`, `task`, or `project`), and `forget` (clear all memory). `remember` persists even while automatic collection is disabled.
- `forget` is allowed only when `allowClearMemory: true` and rejects filter arguments; use search/export before asking the user to clear data selectively. Automatic collection remains off by default, and registering the Agent tool does not enable any `track*` toggle.

### DSH Web settings card

Open `Settings > Plugins > Memory` in DSH to change six live settings: `trackToolCalls`, `trackPreferences`, `trackProjectContext`, `trackSessionHistory`, `enableRecommendations`, and `allowClearMemory`. Web settings dependencies are optional: with the DSH Web client the card is shown; with CLI/Host only, the prompt, tool, and `ctx.memory` API remain available.

The card labels each automatic collection toggle as enabled or paused and shows the overall collection state plus the number of enabled collectors. When the host provides current-session recommendation metrics, it displays these eight fields as read-only metrics:

| Field | Meaning |
| --- | --- |
| `requests` | Number of recommendation API requests. |
| `availableRequests` | Requests for which recommendations were enabled and an available result was returned. |
| `contextualRequests` | Requests with non-empty context. |
| `contextMatches` | Requests matching at least one context-related command or project. |
| `fallbackRequests` | Contextual requests with no context match that used generic fallback candidates. |
| `suggestions` | Cumulative number of returned suggestion groups, not the total number of recommendation items inside their `items` arrays. |
| `contextMatchRate` | A 0–1 context-match ratio returned by the API: `contextMatches / contextualRequests` (for example, `0.667`); the settings card rounds it to `67%`. |
| `fallbackRate` | A 0–1 fallback ratio returned by the API: `fallbackRequests / contextualRequests` (for example, `0.667`); the settings card rounds it to `67%`. |

The first six fields are counts; the last two are 0–1 ratio values returned by the API, not percentage-valued API fields. Both ratios use `contextualRequests` as the denominator. The settings card rounds a ratio to a whole percentage (for example, `0.667` becomes `67%`). When there are no contextual requests and therefore no denominator, the API returns `null` and the settings card shows `暂无数据` (no data). These fields are local, in-process runtime statistics only: they add no persistence, network reporting, or collection of user content.

`patternRecognitionThreshold` is a recommendation-calculation setting, not one of the eight effectiveness metrics shown in the settings card.

```javascript
const metrics = ctx.memory.getRecommendationMetrics();
console.log({
  requests: metrics.requests,
  availableRequests: metrics.availableRequests,
  contextualRequests: metrics.contextualRequests,
  contextMatches: metrics.contextMatches,
  fallbackRequests: metrics.fallbackRequests,
  suggestions: metrics.suggestions,
  contextMatchRate: metrics.contextMatchRate,
  fallbackRate: metrics.fallbackRate
});
```

The metrics describe recommendation coverage, contextual matching, and fallback behavior, not user click-through or acceptance. The recommendation metrics and settings card do not record project paths, raw content, or cross-session user profiles, and do not upload telemetry. This does not change the existing project-context behavior of `trackProjectContext` or explicit `addProject()` calls.

## ⚙️ Configuration Options

```javascript
{
  // Storage file path (relative to workspace)
  storagePath: '.dsh-memory.json',

  // Local backup directory; null uses <storagePath>.backups
  backupDir: null,
  backupOnInitialize: true,
  backupRetentionDays: 30,
  backupRetentionCount: 10,
  
  // Maximum number of history items
  maxHistoryItems: 100,
  
  // Auto-save interval (milliseconds)
  autoSaveInterval: 5000,
  
  // Automatic collection toggles (disabled by default; explicitly set to true to opt in)
  trackToolCalls: false,       // Track tool calls
  trackPreferences: false,     // Track user preferences
  trackProjectContext: false,  // Track project context
  trackSessionHistory: false,  // Track session history
  
  // Privacy settings
  encryptSensitiveData: false, // Legacy compatibility field; redaction is always enabled
  allowClearMemory: true,      // Allow clearing memory
  
  // Smart features
  enableRecommendations: true,           // Enable recommendations
  patternRecognitionThreshold: 3         // Pattern recognition threshold
}
```

## 🎨 Web Viewer

The plugin provides a beautiful web interface to visualize memory data:

```bash
# Double-click to run
open-viewer.cmd

# Or open in browser
viewer.html

# For the extended dashboard layout
premium-viewer.html
```

Viewer features:
- 📊 Data overview cards
- 🛠️ Tool usage statistics charts
- 📁 Project management list
- 💬 Session history timeline
- 🎯 Smart recommendation display

## 📊 Data Structure

Memory data is stored in JSON format:

```json
{
  "version": "1.0.0",
  "userPreferences": {
    "defaultModel": "qwen3.7-plus",
    "language": "en-US",
    "preferredAgents": ["coding-assistant", "reviewer"]
  },
  "inputHabits": {
    "preferredTools": ["read", "write", "glob"],
    "commonCommands": [
      {"command": "npm run dev", "count": 45}
    ]
  },
  "projectContext": {
    "activeProjects": [
      {
        "path": "/projects/my-app",
        "name": "my-app",
        "tags": ["react", "typescript"],
        "lastAccessed": "2026-08-20T10:30:00Z"
      }
    ]
  },
  "sessionHistory": {
    "recentTopics": [
      {"content": "plugin development", "timestamp": "2026-08-20T10:00:00Z"}
    ],
    "toolUsageStats": {
      "read": 156,
      "write": 89,
      "edit": 67
    }
  },
  "metadata": {
    "createdAt": "2026-08-20T00:00:00Z",
    "totalSessions": 25,
    "lastSessionDate": "2026-08-20T10:30:00Z"
  }
}
```

## 🔒 Privacy & Security

- ✅ **Fully Transparent** - All data stored in local JSON files
- ✅ **User Control** - Can disable any tracking feature
- ✅ **Data Ownership** - Data belongs entirely to the user, can be exported or deleted anytime
- ✅ **No Cloud Sync** - All data stored locally only
- ✅ **Clearable** - Use `ctx.memory.clearMemory()` to clear plugin memory; the viewer button only clears browser cache

## 🛠️ Project Structure

```
dsh-memory-plugin/
├── index.js              # Main entry point
├── config.js             # Configuration validation module
├── storage.js            # Data storage engine
├── migrations.js         # Versioned data migrations
├── data-lifecycle.js     # Backup, restore, and retention
├── memory-manager.js     # Core memory management
├── package.json          # NPM package configuration
├── viewer.html           # Default web viewer
├── premium-viewer.html   # Professional web viewer
├── demo-viewer.html      # Demo viewer
├── open-viewer.cmd       # One-click launch script
├── quick-start.js        # Quick sample data generator
├── test/                 # Test files
│   ├── config.test.js
│   ├── storage.test.js
│   └── memory-manager.test.js
├── README.md             # Chinese documentation
├── README.en.md          # English documentation
├── LICENSE               # MIT License
└── CONTRIBUTING.md       # Contribution guidelines
```

## 🧪 Testing

```bash
# Run tests
npm test

# Install Chromium (first run or after a browser version update)
npx playwright install chromium

# Run the real Chromium browser E2E
npm run test:browser-e2e

# On failure, inspect screenshots, traces, and reports in playwright-report/ and test-results/

# Run the real DSH clean-profile E2E (skips only when dsh is unavailable; incompatible or unavailable host probe fails)
npm run test:dsh-e2e

# Windows: explicitly select a locally installed DSH for the host probe
$env:DSH_BIN="$env:APPDATA\npm\dsh.cmd"
$env:DSH_PACKAGE_ROOT="$env:APPDATA\npm\node_modules\@deepseek-ai\dsh"
$env:DSH_E2E_REQUIRED="1"
npm run test:dsh-e2e

# Supported DSH CLI: >=0.1.1-rc.2 <0.2.0 (verified: 0.1.1-rc.2)

# Run quick demo
node quick-start.js

# Open web viewer
./open-viewer.cmd
```

## 💡 Use Cases

### Use Case 1: Personalized Assistant

```javascript
// Auto-configure based on user preferences
const model = ctx.memory.getPreference('defaultModel');
const agents = ctx.memory.getPreference('preferredAgents');
// Automatically use user's preferred configuration
```

### Use Case 2: Smart Recommendations

```javascript
// Get recommendations while coding
const recs = ctx.memory.getRecommendations('coding');
// Returns: recommended Agents, models, projects, etc.
```

### Use Case 3: Project Switching

```javascript
// Automatically identify and record projects
await ctx.memory.addProject({
  path: process.cwd(),
  name: 'current-project',
  tags: ['typescript', 'api']
});
```

## 🤝 Contributing

Contributions, issues, and suggestions are welcome!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) - Powerful AI development assistant framework

---

<div align="center">

**Made with ❤️ by ly028716**

[⭐ Star this repo](https://github.com/ly028716/dsh-memory-plugin) | [🐛 Report Bug](https://github.com/ly028716/dsh-memory-plugin/issues) | [💡 Request Feature](https://github.com/ly028716/dsh-memory-plugin/issues)

</div>
