# DSH 0.2 Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the plugin and its clean-profile E2E compatible with DeepSeek Harness `0.2.0-rc.2`.

**Architecture:** Keep the plugin's Cordis integration unchanged because the required DSH interfaces remain present. Extend only the compatibility metadata and the E2E command adapter so a `.js` CLI entry runs through Node.js on Windows.

**Tech Stack:** Node.js, Jest, npm, DeepSeek Harness CLI.

**Spec:** `docs/superpowers/specs/2026-09-29-dsh-0-2-compatibility-design.md`

## Global Constraints

- Support DSH CLI versions `>=0.1.1-rc.2 <0.3.0`.
- Treat DSH `0.3.0` and later as unsupported until separately verified.
- Preserve PATH and `.cmd` CLI invocation.
- For `DSH_BIN` ending in `.js`, invoke the CLI via the current Node.js executable.
- Do not change the memory data schema or public `ctx.memory` API.

## Review Focus

- A `.js` path with spaces must receive every DSH argument without shell quoting loss.
- Existing `dsh.cmd` invocation must still use `cmd.exe /d /c` on Windows.
- A `0.2.0-rc.2` version must pass the range gate; `0.3.0` must fail it.
- The explicit `DSH_PACKAGE_ROOT` must remain matched against the reported CLI version.
- The source CLI E2E must leave no temporary profile or package artifact after completion.

---

### Task 1: Extend metadata and CLI invocation tests

**Files:**
- Modify: `test/release-ci.test.js`
- Modify: `test/dsh-integration.test.js`
- Modify: `package.json`
- Modify: `test-dsh-e2e.js`

**Interfaces:**
- Consumes: `DSH_BIN`, `DSH_PACKAGE_ROOT`, `packageJson.dsh.compatibility.cli`.
- Produces: `commandInvocation(command, args)` that maps a `.js` CLI to `{ command: process.execPath, args: [command, ...args] }`.

- [ ] **Step 1: Write failing metadata and invocation tests**

Assert the compatibility range is `>=0.1.1-rc.2 <0.3.0`, a `.js` CLI receives `--version` through `process.execPath`, and `0.2.0-rc.2` passes while `0.3.0` fails range validation.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm test -- --runInBand test/release-ci.test.js test/dsh-integration.test.js`

Expected: FAIL because the old metadata range rejects `0.2.0-rc.2` and `.js` is not wrapped.

- [ ] **Step 3: Implement the metadata and invocation adapter**

Set the exact range in `package.json`. In `test-dsh-e2e.js`, make `commandInvocation` detect an absolute `.js` command and prepend it to `process.execPath`; retain the existing `.cmd` branch.

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `npm test -- --runInBand test/release-ci.test.js test/dsh-integration.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json test-dsh-e2e.js test/release-ci.test.js test/dsh-integration.test.js
git commit -m "feat: support DSH 0.2 CLI"
```

### Task 2: Verify source CLI integration and update guidance

**Files:**
- Modify: `README.md`
- Modify: `README.en.md`
- Modify: `INSTALL.md`
- Test: `test/release-ci.test.js`

**Interfaces:**
- Consumes: Task 1 `DSH_BIN` `.js` command adapter and `DSH_PACKAGE_ROOT`.
- Produces: documented PowerShell command for the `0.2.0-rc.2` source CLI.

- [ ] **Step 1: Write failing documentation assertions**

Assert Chinese and English README plus INSTALL document the `0.2.0-rc.2` compatibility range and the source CLI environment variables.

- [ ] **Step 2: Run the documentation test to verify it fails**

Run: `npm test -- --runInBand test/release-ci.test.js`

Expected: FAIL because the current documents only mention the older DSH range.

- [ ] **Step 3: Update compatibility documentation**

Document the supported range, current source version, `DSH_BIN`, `DSH_PACKAGE_ROOT`, and `npm run test:dsh-e2e`. State that the command performs an isolated profile check.

- [ ] **Step 4: Run the documentation test to verify it passes**

Run: `npm test -- --runInBand test/release-ci.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md README.en.md INSTALL.md test/release-ci.test.js
git commit -m "docs: document DSH 0.2 validation"
```

### Task 3: Run full compatibility verification

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: Tasks 1 and 2 plus the local source CLI at `E:\IDEWorkplaces\GitHub\deepseek-harness\apps\cli\lib\bin.js`.
- Produces: fresh evidence for unit, package, and real DSH compatibility.

- [ ] **Step 1: Run full local regression and package verification**

Run: `npm test -- --runInBand; npm run check; npm run test:package`

Expected: all suites pass, syntax check passes, and temporary package installation succeeds.

- [ ] **Step 2: Run real DSH source E2E**

Run in PowerShell:

```powershell
$env:DSH_BIN = 'E:\IDEWorkplaces\GitHub\deepseek-harness\apps\cli\lib\bin.js'
$env:DSH_PACKAGE_ROOT = 'E:\IDEWorkplaces\GitHub\deepseek-harness\apps\cli'
npm run test:dsh-e2e
```

Expected: clean-profile E2E reports the installed plugin, profile doctor, prompt/tool probe, and DSH `0.2.0-rc.2`.

- [ ] **Step 3: Commit verification-only follow-ups when required**

If Task 3 reveals a DSH contract difference, add a failing regression test first, implement the smallest adapter, rerun this task, then commit with a DSH compatibility message.
