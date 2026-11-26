# Changelog

## 0.1.3 - 2026-11-26

- Fixed: if the trace file is moved or deleted while the CLI server is running, the request for it now returns 404 and the server keeps running (read errors are handled too).

## 0.1.2 - 2026-11-16

- Docs: the README now presents `npx trace-codebook` as the default way to run the app and no longer says the package is unpublished.

## 0.1.1 - 2026-11-14

- Fixed: pending autosave is flushed when the screen closes, concurrent saves share one IndexedDB connection, and the connection closes only after in-flight saves finish.

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

- An unknown-option error is always printed in English, regardless of `--lang` or `LANG`.
- When every line of a file is broken JSON, the screen shows only "No records found" without the broken line numbers; the unknown-format error does not list the five supported formats on screen (see the README for the list).
