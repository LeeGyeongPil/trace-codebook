# Changelog

## 0.1.0 - 2026-11-14

First release.

- Open OpenAI and Anthropic message JSONL, OTLP JSON, Langfuse trace JSON and Phoenix span JSONL files in the browser; the format is detected automatically.
- Review traces with keyboard shortcuts (open coding), group failure notes into failure modes on a drag-and-drop board (axial coding), and see counts per mode plus a saturation curve.
- Notes are saved in the browser (IndexedDB) and resume when the same file is reopened.
- Export annotations (JSONL), taxonomy (CSV, Markdown) and labels (CSV); import annotations back.
- English and Korean screens with a saved language menu; CLI `--lang en|ko` and `TRACE_CODEBOOK_LANG`.
- `npx` server bound to `127.0.0.1` with no runtime dependencies; build-time CSP `connect-src 'self'` blocks data egress.
- Bundled synthetic sample traces for practice.

### Known issues

- If the trace file is moved or deleted while the CLI server is running, the next request for it can end the server process.
- With an unknown option placed before `--lang`, the error message is printed in English even when another language was requested.
- When every line of a file is broken JSON, the screen shows only "No records found" without the broken line numbers; the unknown-format error does not list the five supported formats on screen (see the README for the list).
