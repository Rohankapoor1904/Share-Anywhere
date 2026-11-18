# LocalShare Agent Directives & Guidelines

## Core Principles
1. **Anti-Fake Contract (§3)**:
   - No placeholder code (`TODO`, `FIXME`, `throw new Error('not implemented')`).
   - No mock/fake data or simulated progress (`setInterval`, `setTimeout` mocks).
   - No stubbed native modules (every Kotlin module must perform real OS work).
   - No mocks in integration tests (real sockets, real files, real crypto).
   - No swallowed errors (`catch (e) {}` is strictly forbidden).
   - Every claim must be backed by verifiable proof (command output, test result, mutation check).
2. **Language Rules**:
   - Write `.js` / `.jsx` only — no `.ts` / `.tsx`.
   - `tsconfig.json` exists solely for `checkJs` type checking (`npm run type-check`).
   - Kotlin for all Android native modules.
3. **Documentation Lockstep**:
   - Maintain `docs/audit/change_log.md` with granular line-level details on every edit.
   - Sync `BRAIN.md` and `docs/` in the same turn.

