# Contributing to Sonara

Thanks for helping! Русская версия ниже.

## Setup

```bash
pnpm install
pnpm dev            # web + local API server
pnpm desktop:dev    # desktop window (needs Rust)
pnpm android:debug  # Android APK (needs JDK 21 + Android SDK)
```

## Before opening a pull request

- `pnpm typecheck && pnpm build` pass.
- UI changes: run `pnpm smoke:android` (phone layouts) and attach before/after screenshots.
- Keep the design language: iOS 26 Liquid Glass, SF-style icons from `src/ui/icons` (add glyphs via `scripts/gen-icons.mjs`), **no emoji in the UI**.
- Strings go to `src/ui/i18n.ts` in **both** English and Russian.
- User-facing changes get a line under `## [Unreleased]` in `CHANGELOG.md` **and** `CHANGELOG_ru.md`.
- Commit messages: short imperative summary (`fix: …`, `feat: …`, `perf: …` welcome) — they appear in release notes.

## Scope

Sonara streams from the original services. Contributions that download, rehost or redistribute copyrighted content, or circumvent DRM, will not be accepted.

---

## Как помочь проекту

- Перед PR: `pnpm typecheck && pnpm build`; для изменений интерфейса — `pnpm smoke:android` и скриншоты «до/после».
- Стиль: Liquid Glass iOS 26, SF‑подобные иконки из `src/ui/icons`, **никаких эмодзи в интерфейсе**.
- Тексты — в `src/ui/i18n.ts` на английском **и** русском.
- Заметные изменения — строкой в `## [Unreleased]` в `CHANGELOG.md` **и** `CHANGELOG_ru.md`.
- PR, которые скачивают, перезаливают или распространяют чужой контент или обходят DRM, не принимаются.
