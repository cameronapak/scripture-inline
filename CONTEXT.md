# Scripture Inline Context

Scripture Inline gives any web page Scripture with no framework: a script finds Bible references in the page, and two web components show and pick passages. Bible text comes from the YouVersion Platform. The project is independent and not affiliated with YouVersion.

## Terms

- **Bible reference** - Text in a page that names a passage, such as "Rom 8:28-30". The reference finder parses these with grab-bcv.
- **Reference finder** - `scriptureInline()`, or the script tag. It turns Bible references into reference links.
- **Reference link** - The `a.scripture-inline-ref` element that replaces a Bible reference. It lays out exactly like the text it replaced.
- **Mode** - What a reference link does. `card` opens a Scripture card. `link` goes to route.bible.
- **Trigger** - What opens a card: `click`, or `hover` with a mouse.
- **Scripture card** - The popover that shows a passage next to a reference link. It renders a passage inside a shadow root.
- **Passage** - The Bible text that `<si-passage>` shows.
- **Passage ID** - A USFM passage, such as `JHN.3.16`, `ROM.8.28-30`, or a whole chapter, `ROM.8`. Passages can't cross chapters.
- **Bible version** - A YouVersion translation, chosen by `yvp-bible-version-id`. The default is 3034, the Berean Standard Bible (BSB).
- **Reference layout** - Where a passage shows its reference: `heading`, `citation`, `quote`, or `none`.
- **Attribution** - The version's copyright line. It always sits below the Bible text.
- **Public app key** - The YouVersion Platform key. It is public and safe in page markup. The script tag's key is the page-wide default.
- **Passage input** - `<si-passage-input>`, a form field that autocompletes books, chapters, and verses into a passage ID.
- **Version Packages PR** - The pull request the Release workflow opens to bump the version. Merging it publishes to npm.

## Boundaries

- No React or other framework. Components are plain custom elements.
- The Bible text and its styles come from `@youversion/platform-core`. Scripture Inline adds layout and typography on top of them, not its own Bible data.
- Sensible UI styles only the docs page. The published components don't depend on it.
