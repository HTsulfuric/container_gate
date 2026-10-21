# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Open-source community files: `LICENSE` (MPL-2.0), `CONTRIBUTING.md`,
  `CODE_OF_CONDUCT.md`, `SECURITY.md`, GitHub issue/PR templates, and `.gitignore`.

## [1.1.1] - 2026-10-21

### Fixed
- The container cards no longer wait on `storage.local` and `contextualIdentities`
  from the interstitial page. The background now keeps the containers, the
  picker order, the whitelist and the rules warm in memory and answers the
  picker in a single round trip (`CG_PRELOAD`), so the cards show up right away
  even when the browser is busy with other add-ons. If the background does not
  answer within 150 ms the previous code path is used, so it is never slower.
- An intercepted navigation no longer awaits `tabs.get`, the whitelist and the
  rules one after another: the three reads now run in parallel and are served
  from the background cache, which also shortens the wait before the picker
  appears.

## [1.1.0] - 2026-08-16

### Changed
- Renamed to Gatekey (add-on id `container-gate@htsulfuric.dev`).

### Added
- Keyboard picker: `1`–`9` choose a container, `0` opens without a container,
  `Esc` cancels.
- Fixed, user-defined container order (popup → Order tab, stored in `cg_order`)
  so the number keys stay stable when containers are created or deleted.

## [1.0.0] - 2026-06-24

### Added
- Interception of externally opened URLs (from Slack, email, terminals, etc.).
- Container selection modal showing all available Firefox containers.
- Whitelist of domains that open directly without prompting.
- Per-domain rules that remember the chosen container automatically.
- Option to open a URL without any container.
- Toolbar popup to manage rules and the whitelist.
- Glass-style UI for the container selection screen.
- Localization for English, Spanish (es_MX), Portuguese, Russian, and Slovak.

[Unreleased]: https://github.com/HTsulfuric/container_gate/compare/v1.1.1...HEAD
[1.1.1]: https://github.com/HTsulfuric/container_gate/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/HTsulfuric/container_gate/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/AxelTinoco/ContainerGate/releases/tag/v1.0.0
