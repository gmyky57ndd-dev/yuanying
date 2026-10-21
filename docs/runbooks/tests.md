# Test Suite

## Run

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

CI: `.github/workflows/tests.yml` runs `npm test`, lint, and typecheck on every
push to `main` and every PR.

## Coverage

- `lib/drive-parsers.test.ts` — CSV quoted fields, date/numeric filters, JSON,
  MIME inference, ZIP path traversal (ES-035/ES-038).
- `lib/github.test.ts` — issue create + read-back, mismatch failure, issue
  comments (ES-038/ES-044).
- `lib/api.test.ts` — data-stream text, 504 timeout mapping, push_to_dev
  failure data part (ES-043/ES-044/ES-046).
- `lib/write-markdown.test.ts` — allowlist/path guard and Git commit write path
  (ES-047).
- `lib/schedule-time.test.ts` — HH:MM validation, timezone conversion, next-day
  rollover (ES-047).
- `lib/prompt-regression.test.ts` — ES-039 daily-summary rules, SW API bypass,
  chat timeout/reset/tool lifecycle, manifest limits.
- `lib/timezone.test.ts` — existing product-day boundaries.

## Not covered by unit tests

- Real GitHub writes (mocked).
- Real PWA install/standalone behavior and phone keyboard switching.
- Live `agent_jobs` processing (integration-tested manually; see P2-27).
- Actual 21:30 notification on the phone (collector v1.0.28).
