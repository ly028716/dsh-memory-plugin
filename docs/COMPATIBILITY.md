# Compatibility Matrix

This matrix records combinations covered by the repository CI. The package
metadata supports DSH CLI `>=0.1.1-rc.2 <0.3.0`; DSH `0.3.0` and later require
a separate compatibility review.

| DSH CLI | Node.js | Operating system | Verification |
| --- | --- | --- | --- |
| 0.1.1-rc.2 | Node.js 20 | Ubuntu | Unit, package, browser, and clean-profile E2E |
| 0.2.0-rc.2 | Node.js 22 | Ubuntu | Unit, package, browser, and clean-profile E2E |
| 0.2.0-rc.2 | Node.js 20 | Windows | Unit, package, browser, and clean-profile E2E |

The full-host check uses the published DSH 0.2.0-rc.2 package. It creates an
isolated profile, installs the packed plugin, runs `doctor`, checks host prompt
and tool registration, observes startup, and confirms process-tree cleanup.

For a local Harness source checkout, set `DSH_BIN` to `apps/cli/lib/bin.js` and
`DSH_PACKAGE_ROOT` to `apps/cli`. The source checkout must have its workspace
dependencies and build outputs available before its host boot can be treated as
an equivalent full-host result.
