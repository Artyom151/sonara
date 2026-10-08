# Changelog

All notable changes to Sonara. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).
Russian version: [CHANGELOG_ru.md](CHANGELOG_ru.md).

## [Unreleased]

## [1.1.0] - 2026-10-09

### Added
- **Deezer** as a third source: search, global chart, albums and playlists. Full tracks play through the matching YouTube recording, no account or key needed.
- **Artist pages**: popular tracks, albums and singles, similar artists. Open them from the track menu or by tapping the artist name in the player; tracks with several artists ("x & y", "x, y", "feat.") ask which one first.
- **Dynamic Island player** (Settings): the now-playing pill at the top on phones, and in the title bar on desktop where it replaces the bottom bar. It hides while the full-screen player is open.
- **Sync between devices** on one account: likes, playlists, saved playlists, history, "don't recommend", preferences, plus a "Continue here" card for what is playing on another device. Needs `supabase/migrations/0003_sonara_sync.sql`; the local account syncs between windows of one device.
- Playlist cover photos (choose or remove a photo from the playlist menu).
- Repeat modes (off / queue / track) in the track menu as a nested dropdown.
- BetterLyrics as a second synced-lyrics source.
- `release.sh`: one command to check, version, tag and push a release.

### Changed
- Full YouTube playback without keys: streams carry a PO token minted by BotGuard on the youtube.com origin (hidden window on desktop, invisible WebView on Android, jsdom on the server), so tracks no longer stop after about a minute.
- Dropdown menus open to the side that has room and keep the glass blur while they animate.
- Liquid Glass: tint and rim light stay on while scrolling on phones, the shader stays on in Maximum and Balanced, and Battery saver keeps the shader on the bars; desktop WebKit gets real blur; the desktop player bar floats over the content.
- The long-title marquee loops seamlessly.

### Fixed
- Seeking in the full-screen player with mouse and touch.
- Blur missing on Linux (WebKitGTK ignored `var()` in `-webkit-backdrop-filter`).
- A stretched ghost of another element's rim inside glass panels (shader maps were rendered concurrently).
- The mobile and desktop media proxies refusing ranged reads of YouTube audio.

## [1.0.0] - 2026-10-07

### Added
- Streaming from SoundCloud (client id obtained automatically) and YouTube in one library and one search.
- **Wave** — an endless, live playlist: start it from a query, a mood, a genre or a track; it learns from skips, likes and full listens.
- Personal **Picks for you** built from your liked tracks.
- Synced lyrics (LRCLIB), timed comments inside the player, "Liked by" from Sonara listeners.
- Accounts: Supabase cloud sign-in or a fully offline local account; username, display name, preset or custom avatar; likes sync across devices.
- Playlists: create, edit, reorder, save SoundCloud / YouTube playlists.
- iOS 26-style Liquid Glass interface, driven by a WebGL2 port of a custom glass shader; animated plasma Wave orb.
- Android: Material You (Dynamic Color) theming, themed icon, background playback with media notification and lock-screen controls.
- Desktop: frameless window, icon rail, glass player bar, Discord Rich Presence, low-memory mode while minimised (Windows).
- Builds for Android, iOS, Windows, macOS, Linux (glibc) and Linux (musl / Alpine).
