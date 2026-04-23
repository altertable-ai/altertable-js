# Changelog

## [1.1.0](https://github.com/altertable-ai/altertable-js/compare/altertable-js-v1.0.7...altertable-js-v1.1.0) (2026-04-23)


### Features

* batch events, add HTTP retries and unload flush ([#125](https://github.com/altertable-ai/altertable-js/issues/125)) ([d27d446](https://github.com/altertable-ai/altertable-js/commit/d27d44651ddcf508c88d27487751878117f5de5d)), closes [#124](https://github.com/altertable-ai/altertable-js/issues/124)
* introduce alias API and rework identity flow ([#89](https://github.com/altertable-ai/altertable-js/issues/89)) ([bbb6a31](https://github.com/altertable-ai/altertable-js/commit/bbb6a3146a9efbfe4f3d8b6401efe6a577aa6d77))


### Bug Fixes

* isIdentified flag on init ([#94](https://github.com/altertable-ai/altertable-js/issues/94)) ([575ae4b](https://github.com/altertable-ai/altertable-js/commit/575ae4bd06b1a18a033f84c5f30f1c9680c41f34))

## [1.0.7] - 2026-01-12

- `identify()` logs warnings instead of throwing when called with invalid arguments ([#115](https://github.com/altertable-ai/altertable-js/pull/115))

## [1.0.6] - 2026-01-08

- Release packaging only for this package (version bump).

## [1.0.5] - 2026-01-08

- Queue commands (`track`, `page`, `identify`, etc.) if they run before `init()` finishes, then flush after initialization ([#112](https://github.com/altertable-ai/altertable-js/pull/112))

## [1.0.4] - 2025-12-31

- Rename the anonymous identity field from `visitorId` to `anonymousId` in public types and payloads ([#110](https://github.com/altertable-ai/altertable-js/pull/110))  

## [1.0.3] - 2025-12-16

- Release packaging only for this package (version bump).

## [1.0.2] - 2025-12-16

- `identify()` is idempotent when called again with the same user ID ([#99](https://github.com/altertable-ai/altertable-js/pull/99), [#100](https://github.com/altertable-ai/altertable-js/pull/100))
- Invariant messages from the SDK are shown in production builds, not only in development ([#101](https://github.com/altertable-ai/altertable-js/pull/101))

## [1.0.1] - 2025-12-09

- Fix `isIdentified` being wrong immediately after `init()` ([#94](https://github.com/altertable-ai/altertable-js/pull/94))
- Treat “identified” as derived state from stored identity instead of a separate persisted flag ([#95](https://github.com/altertable-ai/altertable-js/pull/95))

## [1.0.0] - 2025-12-01

- **Breaking:** Rework identity flow and add `alias()` to link a new user ID to the current identity ([#89](https://github.com/altertable-ai/altertable-js/pull/89))
- Grant tracking consent by default (`consentGranted: true`) ([#86](https://github.com/altertable-ai/altertable-js/pull/86))
- Handle the API error when the configured environment does not exist ([#84](https://github.com/altertable-ai/altertable-js/pull/84))
- Add JSDoc to public APIs ([#87](https://github.com/altertable-ai/altertable-js/pull/87))

## [0.5.7] - 2025-08-18

- Release packaging only for this package (version bump).

## [0.5.6] - 2025-07-29

- Attach the current page URL to `track()` payloads when it is not passed explicitly ([#79](https://github.com/altertable-ai/altertable-js/pull/79))

## [0.5.5] - 2025-07-15

- Centralize HTTP sending in a `Requester` abstraction ([#73](https://github.com/altertable-ai/altertable-js/pull/73))
- Log identify-related lifecycle details when debug logging is enabled ([#74](https://github.com/altertable-ai/altertable-js/pull/74))
- Improve default configuration shape and internal context naming ([#69](https://github.com/altertable-ai/altertable-js/pull/69), [#70](https://github.com/altertable-ai/altertable-js/pull/70))

## [0.5.4] - 2025-07-11

- Add a package `exports` map for clearer ESM/CJS resolution ([#67](https://github.com/altertable-ai/altertable-js/pull/67))

## [0.5.3] - 2025-07-07

- Fix implicit auto-capture when recording page views ([#65](https://github.com/altertable-ai/altertable-js/pull/65))

## [0.5.2] - 2025-07-04

- Surface invariant failures (for example missing API key) even when `init()` has not been called yet ([#62](https://github.com/altertable-ai/altertable-js/pull/62))

## [0.5.1] - 2025-07-04

- Align event naming with the Object Action framework ([#59](https://github.com/altertable-ai/altertable-js/pull/59))
- Generate storage keys per environment so data does not collide across environments ([#58](https://github.com/altertable-ai/altertable-js/pull/58))

## [0.5.0] - 2025-07-03

- Add user identification and session handling (anonymous ID, session ID, persistence) ([#49](https://github.com/altertable-ai/altertable-js/pull/49))
- Add tracking consent controls ([#54](https://github.com/altertable-ai/altertable-js/pull/54))
- Support migrating persisted data when storage keys change ([#52](https://github.com/altertable-ai/altertable-js/pull/52))
- Add `configure()` for runtime settings ([#42](https://github.com/altertable-ai/altertable-js/pull/42))
- Add debug logging helpers ([#41](https://github.com/altertable-ai/altertable-js/pull/41))
- Add a persistence layer for client state ([#45](https://github.com/altertable-ai/altertable-js/pull/45))
- Allow `identify()` with an empty traits object ([#55](https://github.com/altertable-ai/altertable-js/pull/55))
- Include a timestamp on event payloads ([#46](https://github.com/altertable-ai/altertable-js/pull/46))
- Set viewport to `null` in context when it cannot be read ([#48](https://github.com/altertable-ai/altertable-js/pull/48))
- Make event `properties` optional; add logger, dev-only code paths, and shared constants ([#33](https://github.com/altertable-ai/altertable-js/pull/33)–[#44](https://github.com/altertable-ai/altertable-js/pull/44))

## [0.4.0] - 2025-06-27

- Update the core client and entry points to match the standardized React integration shipped as `@altertable/altertable-react` ([#30](https://github.com/altertable-ai/altertable-js/pull/30))

## [0.3.0] - 2025-06-26

- Initial published package layout under the current package name ([#26](https://github.com/altertable-ai/altertable-js/pull/26), [#28](https://github.com/altertable-ai/altertable-js/pull/28))

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
