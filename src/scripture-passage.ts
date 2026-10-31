import { ApiClient, getPassageDisplay, type BiblePassageDisplay } from "@youversion/platform-core";
import { formatPassageForDisplay, tryParsePassage } from "grab-bcv";

export const SCRIPTURE_PASSAGE_TAG = "si-passage";

// Light DOM on purpose: YouVersion's Bible CSS and reader tokens apply directly.
// These rules only style what the element adds around the Bible HTML.
const STYLES = `
/* flow-root keeps the passage's margins inside, so its layout is identical during and after the grow. */
${SCRIPTURE_PASSAGE_TAG} { display: flow-root; position: relative; }
/* Typography comes from --scripture-* properties, which pages set like any CSS. The fallbacks
   are bible.css's own values, except the font: Untitled Serif is YouVersion's Bible typeface,
   but bible.css defaults to Source Serif 4. */
${SCRIPTURE_PASSAGE_TAG} [data-slot="yv-bible-renderer"] {
  --yv-reader-font-family: var(--scripture-font-family, "Untitled Serif", "Source Serif 4", serif);
  --yv-reader-font-size: var(--scripture-font-size, 20px);
  --yv-reader-line-height: var(--scripture-line-height, 1.625);
  --yv-reader-max-width: var(--scripture-max-width, 65ch);
  /* bible.css caps each paragraph at this width. */
  --yv-container-lg: var(--scripture-max-width, 32rem);
}
/* Content switches. CSS alone applies them, so toggling one never refetches or re-renders. */
${SCRIPTURE_PASSAGE_TAG}[verse-numbers="hide"] .yv-vlbl { display: none; }
${SCRIPTURE_PASSAGE_TAG}[red-letter="off"] .wj { color: inherit; }
/* .yv-h marks editorial headings. Psalm titles (.d) are Scripture, so they stay. */
${SCRIPTURE_PASSAGE_TAG}[headings="hide"] .yv-h { display: none; }
/* Translators' added words read as italic, as in print Bibles. bible.css also bolds them,
   which stresses the words the original text does not contain. */
${SCRIPTURE_PASSAGE_TAG} [data-slot="yv-bible-renderer"] .add { font-weight: inherit; }
/* Page frameworks (Sensible UI, Pico) draw their own spinner on [aria-busy]; this element has one. */
${SCRIPTURE_PASSAGE_TAG}[aria-busy]::before, ${SCRIPTURE_PASSAGE_TAG}[aria-busy]::after { content: none !important; }
${SCRIPTURE_PASSAGE_TAG} > .scripture-loading { display: flex; padding: 0.75rem 0; opacity: 0.5; }
${SCRIPTURE_PASSAGE_TAG} > .scripture-loading.scripture-leaving { position: absolute; inset: 0 auto auto 0; pointer-events: none; }
${SCRIPTURE_PASSAGE_TAG} > .scripture-stage { position: absolute; inset: 0 0 auto; height: 0; overflow: hidden; visibility: hidden; }
${SCRIPTURE_PASSAGE_TAG} > .scripture-loading > svg { animation: scripture-spin 0.8s linear infinite; }
@keyframes scripture-spin { to { transform: rotate(360deg); } }
${SCRIPTURE_PASSAGE_TAG} > [role="alert"] { margin: 0; opacity: 0.7; font-family: var(--yv-font-sans, system-ui, sans-serif); }
/* Every layout uses the same citation; only its place changes. */
${SCRIPTURE_PASSAGE_TAG} .scripture-citation {
  all: unset;
  display: block;
  /* Match the width bible.css gives the text. */
  max-width: var(--scripture-max-width, 32rem);
  margin-block-start: 1rem;
  font: calc(var(--scripture-font-size, 20px) * 0.8)/1.5 var(--yv-font-sans, system-ui, sans-serif);
  color: var(--yv-foreground);
}
${SCRIPTURE_PASSAGE_TAG} > .scripture-citation:first-child { margin-block: 0 1rem; }
${SCRIPTURE_PASSAGE_TAG} .scripture-citation > .scripture-version { color: var(--yv-muted-foreground); }
/* The attribution always comes after the text, right under a citation when one follows it. */
${SCRIPTURE_PASSAGE_TAG} .scripture-attribution {
  all: unset;
  display: block;
  max-width: var(--scripture-max-width, 32rem);
  margin-block-start: 1rem;
  font: 0.75rem/1.5 var(--yv-font-sans, system-ui, sans-serif);
  color: var(--yv-muted-foreground);
}
${SCRIPTURE_PASSAGE_TAG} .scripture-citation + .scripture-attribution { margin-block-start: 0; }
${SCRIPTURE_PASSAGE_TAG} > .scripture-quote {
  all: unset;
  display: block;
  padding-inline-start: 1rem;
  border-inline-start: 2px solid color-mix(in srgb, currentColor 18%, transparent);
}
@media (prefers-reduced-motion: reduce) { ${SCRIPTURE_PASSAGE_TAG} > .scripture-loading > svg { animation-duration: 2.4s; } }`;

// Lucide "loader-circle".
const LOADER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

export type ReferenceLayout = "heading" | "citation" | "quote" | "none";
const LAYOUTS: readonly ReferenceLayout[] = ["heading", "citation", "quote", "none"];

// One request per passage per page, so reopening a card is instant.
const displays = new Map<string, Promise<BiblePassageDisplay>>();

function fetchDisplay(appKey: string, apiHost: string | undefined, versionId: number, passageId: string) {
  const key = [apiHost, appKey, versionId, passageId].join("|");
  let request = displays.get(key);
  if (!request) {
    request = getPassageDisplay(new ApiClient({ appKey, apiHost }), {
      versionId,
      passageId,
      includeHeadings: true,
      includeNotes: false,
    });
    request.catch(() => displays.delete(key));
    displays.set(key, request);
  }
  return request;
}

/**
 * Displays Scripture with its required attribution. Works in the page or inside a shadow root.
 *
 * Attributes choose what shows: `reference`, `verse-numbers="hide"`, `red-letter="off"`,
 * `headings="hide"`, `direction`, and `theme`. CSS properties choose how it looks:
 * `--scripture-font-size`, `--scripture-line-height`, `--scripture-font-family`, `--scripture-max-width`.
 */
export class ScripturePassage extends HTMLElement {
  // verse-numbers, red-letter, and headings are pure CSS, so they need no callback.
  static observedAttributes = ["yvp-public-app-key", "yvp-api-host", "yvp-bible-version-id", "passage-id", "theme", "reference", "direction"];

  private generation = 0;
  /** The loaded passage, kept so a layout change re-renders without a request. */
  private loaded: { display: BiblePassageDisplay; passageId: string } | null = null;
  private scheduled = false;
  private readonly systemDark = matchMedia("(prefers-color-scheme: dark)");
  private readonly onSystemTheme = () => this.applyTheme();

  connectedCallback(): void {
    this.systemDark.addEventListener("change", this.onSystemTheme);
    // Show the loader now, not a microtask later, so whoever lays us out measures it.
    if (!this.childElementCount) this.showLoading();
    this.scheduleLoad();
  }

  disconnectedCallback(): void {
    this.systemDark.removeEventListener("change", this.onSystemTheme);
    this.generation += 1;
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue || !this.isConnected) return;
    if (name === "theme") this.applyTheme();
    else if (name === "reference" || name === "direction") this.relayout();
    else this.scheduleLoad();
  }

  private scheduleLoad(): void {
    this.generation += 1;
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      if (this.isConnected) void this.load(this.generation);
    });
  }

  private applyTheme(): void {
    // "light" (default), "dark", or "auto" to follow the system setting.
    const setting = this.getAttribute("theme");
    const theme = setting === "dark" || (setting === "auto" && this.systemDark.matches) ? "dark" : "light";
    for (const el of this.querySelectorAll("[data-yv-sdk]")) el.setAttribute("data-yv-theme", theme);
  }

  /** "heading" (default), "citation", "quote", or "none". */
  get referenceLayout(): ReferenceLayout {
    const value = this.getAttribute("reference") as ReferenceLayout | null;
    return value && LAYOUTS.includes(value) ? value : "heading";
  }

  /** Swaps the reference layout in place. Only the label moves, so there is no loader or grow. */
  private relayout(): void {
    if (!this.loaded || this.getAttribute("aria-busy")) return;
    this.replaceChildren(...this.compose(this.loaded.display, this.loaded.passageId));
    this.applyTheme();
  }

  /** Builds the passage, its reference and version in the chosen layout, and its attribution. */
  private compose(display: BiblePassageDisplay, passageId: string): HTMLElement[] {
    const doc = this.ownerDocument;
    const el = (tag: string, className: string, text?: string) => {
      const node = doc.createElement(tag);
      node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };
    const parsed = tryParsePassage(passageId);
    const reference = parsed.ok ? formatPassageForDisplay(parsed.value) : passageId;

    const scripture = doc.createElement("section");
    for (const [name, value] of Object.entries(display.containerAttributes)) scripture.setAttribute(name, value);
    // "ltr" or "rtl" overrides the passage's own direction, like the React SDK's scriptureDirection.
    const direction = this.getAttribute("direction");
    scripture.setAttribute("dir", direction === "ltr" || direction === "rtl" ? direction : "auto");
    scripture.innerHTML = display.html;

    // The citation carries the reference and version; the layout only moves it.
    const citation = el("p", "scripture-citation");
    citation.setAttribute("data-yv-sdk", "");
    citation.append(reference, " ", el("span", "scripture-version", display.version.localized_abbreviation));

    // The attribution always shows, always below the text. It is a license requirement.
    const attribution = el("p", "scripture-attribution");
    attribution.setAttribute("data-yv-sdk", "");
    const attributionText = doc.createElement("bdi");
    attributionText.setAttribute("dir", "auto");
    attributionText.textContent = display.attribution.text;
    attribution.append(attributionText);

    switch (this.referenceLayout) {
      case "heading":
        return [citation, scripture, attribution];
      case "citation":
        return [scripture, citation, attribution];
      case "quote": {
        const quote = el("blockquote", "scripture-quote");
        quote.append(scripture, citation, attribution);
        return [quote];
      }
      case "none":
        return [scripture, attribution];
    }
  }

  private showLoading(): void {
    this.installStyles();
    this.setAttribute("aria-busy", "true");
    const loading = this.ownerDocument.createElement("div");
    loading.className = "scripture-loading";
    loading.setAttribute("role", "status");
    loading.setAttribute("aria-label", "Loading Bible text");
    loading.innerHTML = LOADER_SVG;
    this.replaceChildren(loading);
  }

  private showError(message: string): void {
    const alert = this.ownerDocument.createElement("p");
    alert.setAttribute("role", "alert");
    alert.textContent = message;
    this.removeAttribute("aria-busy");
    this.replaceChildren(alert);
  }

  private async load(generation: number): Promise<void> {
    const appKey = this.getAttribute("yvp-public-app-key")?.trim() || defaultYvpPublicAppKey;
    const version = this.getAttribute("yvp-bible-version-id");
    const passageId = this.getAttribute("passage-id")?.trim();
    const versionId = version && /^[1-9]\d*$/.test(version) ? Number(version) : NaN;

    if (!appKey || !Number.isSafeInteger(versionId) || !passageId) {
      this.showError("Set an app key, a positive yvp-bible-version-id, and passage-id to display Bible text.");
      return;
    }

    this.loaded = null;
    if (!this.querySelector(":scope > .scripture-loading")) this.showLoading();
    // Cached passages resolve before the loader paints; those swap in without a grow.
    let loaderPainted = false;
    requestAnimationFrame(() => (loaderPainted = true));

    try {
      const display = await fetchDisplay(appKey, this.getAttribute("yvp-api-host") || undefined, versionId, passageId);
      if (!this.isConnected || generation !== this.generation) return;

      // Wait for the Bible CSS and fonts so the text appears styled, at its final height.
      await this.installStylesheets(display);
      if (!this.isConnected || generation !== this.generation) return;
      const parts = this.compose(display, passageId);

      // Lay the text out unseen first, so the browser fetches the fonts it uses,
      // and swap it in once they arrive. That way the text never shifts.
      const stage = this.ownerDocument.createElement("div");
      stage.className = "scripture-stage";
      stage.setAttribute("aria-hidden", "true");
      stage.append(...parts);
      this.append(stage);
      void stage.offsetHeight;
      await Promise.race([this.ownerDocument.fonts.ready, new Promise((wait) => setTimeout(wait, 3000))]);
      if (!this.isConnected || generation !== this.generation) return;

      const from = this.offsetHeight;
      const loader = this.querySelector<HTMLElement>(":scope > .scripture-loading");
      this.replaceChildren(...parts);
      this.loaded = { display, passageId };
      this.applyTheme();
      if (loaderPainted) this.growFrom(from, loader);
      this.removeAttribute("aria-busy");
      this.dispatchEvent(new CustomEvent("scripture-load", { detail: { yvpBibleVersionId: versionId, passageId, yvpBibleVersion: display.version } }));
    } catch (error) {
      if (!this.isConnected || generation !== this.generation) return;
      this.showError("Unable to display Bible text. Check the app key, version, and passage.");
      this.dispatchEvent(new CustomEvent("scripture-error", { detail: error }));
    }
  }

  /** Styles go where they apply: the page head, or the shadow root this element lives in. */
  private styleTarget(): Document["head"] | ShadowRoot {
    const root = this.getRootNode();
    return root instanceof ShadowRoot ? root : this.ownerDocument.head;
  }

  private installStyles(): void {
    const target = this.styleTarget();
    if (target.querySelector(`style[data-${SCRIPTURE_PASSAGE_TAG}]`)) return;
    const style = this.ownerDocument.createElement("style");
    style.setAttribute(`data-${SCRIPTURE_PASSAGE_TAG}`, "");
    style.textContent = STYLES;
    target.append(style);
  }

  /** Resolves once every Bible stylesheet has loaded (or failed, so text still shows). */
  private installStylesheets(display: BiblePassageDisplay): Promise<unknown> {
    const loads = display.stylesheets.map(({ kind, href }) => {
      // @font-face is ignored inside a shadow root, so fonts always go on the page.
      const target = kind === "font" ? this.ownerDocument.head : this.styleTarget();
      const links = target.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]');
      let link = Array.from(links).find((existing) => existing.href === href);
      if (!link) {
        link = this.ownerDocument.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        target.append(link);
      } else if (link.sheet || link.dataset.scriptureLoaded) {
        return null;
      }
      const pending = link;
      return new Promise((done) => {
        const finish = () => {
          pending.dataset.scriptureLoaded = "";
          done(null);
        };
        pending.addEventListener("load", finish, { once: true });
        pending.addEventListener("error", finish, { once: true });
      });
    });
    return Promise.all(loads);
  }

  /**
   * Grows from the loader's height to the passage's height. The loader fades out in place
   * while the text fades in, with a light blur to mask the crossfade.
   */
  private growFrom(from: number, loader: HTMLElement | null): void {
    const to = this.offsetHeight;
    const easing = "cubic-bezier(0.23, 1, 0.32, 1)";
    const text = Array.from(this.children) as HTMLElement[];

    // Reduced motion keeps the fade and drops the movement and blur.
    if (reducedMotion.matches) {
      for (const el of text) el.animate({ opacity: [0, 1] }, { duration: 200, easing });
      return;
    }

    if (loader) {
      loader.classList.add("scripture-leaving");
      this.append(loader);
      loader.animate({ opacity: [0.5, 0] }, { duration: 150, easing }).finished.finally(() => loader.remove());
    }
    if (from !== to) {
      this.style.overflow = "hidden";
      this.animate({ height: [`${from}px`, `${to}px`] }, { duration: 280, easing }).finished.finally(() => {
        this.style.overflow = "";
      });
    }
    for (const el of text) {
      el.animate({ opacity: [0, 1], filter: ["blur(4px)", "blur(0)"] }, { duration: 280, easing });
    }
  }
}

/** Register once in a browser entry point. Importing this module does not register it. */
// The app key passages use when they have no yvp-public-app-key attribute.
let defaultYvpPublicAppKey: string | undefined;

/** Registers <si-passage>. A yvpPublicAppKey here becomes the page-wide default app key. */
export function defineScripturePassage({ yvpPublicAppKey }: { yvpPublicAppKey?: string } = {}): void {
  if (yvpPublicAppKey) defaultYvpPublicAppKey = yvpPublicAppKey;
  if (!customElements.get(SCRIPTURE_PASSAGE_TAG)) customElements.define(SCRIPTURE_PASSAGE_TAG, ScripturePassage);
}

declare global {
  interface HTMLElementTagNameMap {
    "si-passage": ScripturePassage;
  }
}
