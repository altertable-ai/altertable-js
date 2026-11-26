# altertable-react-shared

Private React code shared by `@altertable/altertable-react` (web) and
`@altertable/altertable-react-native`. It is never published: each package lists
it as a dev dependency and tsdown bundles it into the package's `dist`.

It may import `react` and `@altertable/altertable-shared`, nothing else. Lint
rules in `.oxlintrc.json` enforce these boundaries:

- No platform code. Browser APIs (`IntersectionObserver`, `useView`,
  `useScreenView`) stay in the web package; `screen()` and `trackNavigation`
  stay in the React Native package.
- React 16.14 APIs only, the lowest version either package supports. React 18+
  imports such as `use` or `useId` are rejected, and so is a namespace import of
  `react`, which would hide them.
- Types exported from here can appear in either package's public declarations.
  The declaration builds use `packages/tsconfig.<package>.build.json`, which sit
  above the packages so tsdown can inline these types.
- Test behavior through the public API of the packages that bundle this module.
