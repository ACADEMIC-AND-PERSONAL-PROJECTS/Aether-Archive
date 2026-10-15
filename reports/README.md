# Reports

Generated artefacts — verification runs, QA passes, security reviews, performance measurements.

- Written by the `qa-verifier` subagent and by verification steps in skills; **not maintained by hand**.
- Naming: `verify-<branch>-<YYYYMMDD>.md`, `security-<YYYYMMDD>.md`, `performance-<YYYYMMDD>.md`.
- Each report states: what was run, the exact commands, the raw result (tail), and the residual risk.
- Reports are evidence, not documentation: a report that contradicts the docs means the docs are wrong —
  fix them in the same PR.
