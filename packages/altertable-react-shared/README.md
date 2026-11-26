# altertable-react-shared

Private React code shared by `@altertable/altertable-react` (web) and
`@altertable/altertable-react-native`. It is never published: each package lists
it as a dev dependency and tsdown bundles it into the package's `dist`.

- Keep this module platform-neutral. Browser APIs (`IntersectionObserver`,
  `useView`) stay in the web package; `screen()` and `trackNavigation` stay in
  the React Native package.
- Support every React version either package accepts, so React 16.14 and up.
- `__LIB__` and `__LIB_VERSION__` are replaced by the bundling package, so
  events report that package's name and version.
- Types exported from here can appear in either package's public declarations.
  The declaration builds use `packages/tsconfig.<package>.build.json`, which sit
  above both packages so tsdown can inline these types.
- Test behavior through the public API of the packages that bundle this module.
