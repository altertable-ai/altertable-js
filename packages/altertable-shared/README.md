# altertable-shared

Private, platform-neutral helpers shared by every Altertable SDK package:
`@altertable/altertable-js`, `@altertable/altertable-react` and
`@altertable/altertable-react-native`. It is never published: each package lists
it as a dev dependency and tsdown bundles it into the package's `dist`.

This is the bottom layer. It imports nothing: not React, not React Native, not
browser globals, and not the core package. Lint rules in `.oxlintrc.json`
enforce this.

- `__LIB__` and `__LIB_VERSION__` are replaced by the bundling package, so events
  report that package's name and version.
- Test behavior through the public API of the packages that bundle this module.
