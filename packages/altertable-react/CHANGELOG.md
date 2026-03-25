# Changelog

## [1.0.7] - 2026-01-12

- Depends on `@altertable/altertable-js` 1.0.7: `identify()` warnings instead of throws for invalid input ([#115](https://github.com/altertable-ai/altertable-js/pull/115), [#116](https://github.com/altertable-ai/altertable-js/pull/116))

## [1.0.6] - 2026-01-08

- Depends on `@altertable/altertable-js` 1.0.6 (version alignment).

## [1.0.5] - 2026-01-08

- Depends on `@altertable/altertable-js` 1.0.5: pre-`init()` command queuing ([#112](https://github.com/altertable-ai/altertable-js/pull/112), [#113](https://github.com/altertable-ai/altertable-js/pull/113))

## [1.0.4] - 2025-12-31

- Depends on `@altertable/altertable-js` 1.0.4: `anonymousId` naming (formerly `visitorId`) ([#110](https://github.com/altertable-ai/altertable-js/pull/110))  

## [1.0.3] - 2025-12-16

- Depends on `@altertable/altertable-js` 1.0.3 (version alignment).

## [1.0.2] - 2025-12-16

- Depends on `@altertable/altertable-js` 1.0.2: idempotent `identify()`, production invariant messages ([#99](https://github.com/altertable-ai/altertable-js/pull/99)–[#101](https://github.com/altertable-ai/altertable-js/pull/101), [#104](https://github.com/altertable-ai/altertable-js/pull/104))

## [1.0.1] - 2025-12-09

- Depends on `@altertable/altertable-js` 1.0.1: correct `isIdentified` after `init()` ([#94](https://github.com/altertable-ai/altertable-js/pull/94), [#95](https://github.com/altertable-ai/altertable-js/pull/95), [#96](https://github.com/altertable-ai/altertable-js/pull/96))

## [1.0.0] - 2025-12-01

- Expose `alias` on the React client API ([#91](https://github.com/altertable-ai/altertable-js/pull/91))
- Depends on `@altertable/altertable-js` 1.0.0: identity rework, default consent, environment error handling, JSDoc ([#84](https://github.com/altertable-ai/altertable-js/pull/84)–[#92](https://github.com/altertable-ai/altertable-js/pull/92))
- README table formatting fix ([#90](https://github.com/altertable-ai/altertable-js/pull/90))

## [0.5.7] - 2025-08-18

- Update funnel tracker hook API ([#81](https://github.com/altertable-ai/altertable-js/pull/81))

## [0.5.6] - 2025-07-29

- Depends on `@altertable/altertable-js` 0.5.6 (automatic URL on `track()` in core) ([#79](https://github.com/altertable-ai/altertable-js/pull/79), [#80](https://github.com/altertable-ai/altertable-js/pull/80))

## [0.5.5] - 2025-07-15

- Add `page()` on `useAltertable()` for manual page tracking ([#75](https://github.com/altertable-ai/altertable-js/pull/75))
- Depends on `@altertable/altertable-js` 0.5.5 (Requester, debug identify logging, config/context cleanup) ([#73](https://github.com/altertable-ai/altertable-js/pull/73), [#74](https://github.com/altertable-ai/altertable-js/pull/74), [#76](https://github.com/altertable-ai/altertable-js/pull/76))

## [0.5.4] - 2025-07-11

- Package `exports` map for ESM/CJS resolution ([#67](https://github.com/altertable-ai/altertable-js/pull/67), [#68](https://github.com/altertable-ai/altertable-js/pull/68))

## [0.5.3] - 2025-07-07

- Monorepo documentation updates (no React API changes in source for this tag) ([#64](https://github.com/altertable-ai/altertable-js/pull/64), [#66](https://github.com/altertable-ai/altertable-js/pull/66))

## [0.5.2] - 2025-07-04

- Add `reset()` on the React client ([#61](https://github.com/altertable-ai/altertable-js/pull/61))
- Depends on `@altertable/altertable-js` 0.5.2 (invariant behavior) ([#62](https://github.com/altertable-ai/altertable-js/pull/62), [#63](https://github.com/altertable-ai/altertable-js/pull/63))

## [0.5.1] - 2025-07-04

- Align with core event naming (Object Action framework) via dependency bump ([#59](https://github.com/altertable-ai/altertable-js/pull/59), [#60](https://github.com/altertable-ai/altertable-js/pull/60))
- README updates ([#57](https://github.com/altertable-ai/altertable-js/pull/57))

## [0.5.0] - 2025-07-03

- Identify/session APIs on the React client; consent and `configure()` exposed through hooks ([#49](https://github.com/altertable-ai/altertable-js/pull/49), [#54](https://github.com/altertable-ai/altertable-js/pull/54), [#56](https://github.com/altertable-ai/altertable-js/pull/56))
- Exclude the core library from the React bundle (consume published `@altertable/altertable-js`) ([#40](https://github.com/altertable-ai/altertable-js/pull/40))
- Example React app in the monorepo ([#47](https://github.com/altertable-ai/altertable-js/pull/47))
- Logger, dev setup, metadata, ESLint, and optional event properties aligned with core ([#33](https://github.com/altertable-ai/altertable-js/pull/33)–[#44](https://github.com/altertable-ai/altertable-js/pull/44))

## [0.4.0] - 2025-06-27

- **Breaking:** Replace ad hoc integration with `AltertableProvider` and `useAltertable()` ([#30](https://github.com/altertable-ai/altertable-js/pull/30))

## [0.3.0] - 2025-06-26

- Initial published React package under the current name ([#26](https://github.com/altertable-ai/altertable-js/pull/26), [#28](https://github.com/altertable-ai/altertable-js/pull/28))

[1.0.7]: https://github.com/altertable-ai/altertable-js/compare/v1.0.6...v1.0.7
[1.0.6]: https://github.com/altertable-ai/altertable-js/compare/v1.0.5...v1.0.6
[1.0.5]: https://github.com/altertable-ai/altertable-js/compare/v1.0.3...v1.0.5
[1.0.4]: https://github.com/altertable-ai/altertable-js/commit/dbe32b9
[1.0.3]: https://github.com/altertable-ai/altertable-js/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/altertable-ai/altertable-js/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/altertable-ai/altertable-js/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/altertable-ai/altertable-js/compare/v0.5.7...v1.0.0
[0.5.7]: https://github.com/altertable-ai/altertable-js/compare/v0.5.6...v0.5.7
[0.5.6]: https://github.com/altertable-ai/altertable-js/compare/v0.5.5...v0.5.6
[0.5.5]: https://github.com/altertable-ai/altertable-js/compare/v0.5.4...v0.5.5
[0.5.4]: https://github.com/altertable-ai/altertable-js/compare/v0.5.3...v0.5.4
[0.5.3]: https://github.com/altertable-ai/altertable-js/compare/v0.5.2...v0.5.3
[0.5.2]: https://github.com/altertable-ai/altertable-js/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/altertable-ai/altertable-js/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/altertable-ai/altertable-js/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/altertable-ai/altertable-js/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/altertable-ai/altertable-js/commits/v0.3.0
