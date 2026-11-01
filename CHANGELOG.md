# @faith-tools/scripture-inline

## 0.2.0

### Minor Changes

- 58935c8: The reference finder now watches the page and links Bible references in content added later, such as pages that Turbo or Astro view transitions swap in. Cards keep working after `<body>` is replaced. Set `watch: false` to scan once, and mark content that React or another framework renders with `data-scripture-inline-ignore`.

## 0.1.1

### Patch Changes

- 6adb332: Update the README now that the package is on npm.
