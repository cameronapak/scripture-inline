import { createScriptureCard } from "./card";
import { REF_CLASS, unwrapReferences, wrapReferences } from "./scan";
import type { ReferenceLayout } from "./scripture-passage";

export { findReferences, type FoundReference } from "./find";
export { unwrapReferences, wrapReferences } from "./scan";
export { createScriptureCard } from "./card";
export { PASSAGE_INPUT_TAG, ScripturePassageInput, definePassageInput, type PassageInputDetail } from "./passage-input";
export { SCRIPTURE_PASSAGE_TAG, ScripturePassage, defineScripturePassage, type ReferenceLayout } from "./scripture-passage";

export type Mode = "link" | "card";
export type Trigger = "click" | "hover";

export type ScriptureInlineOptions = {
  /** "link" opens route.bible. "card" shows the passage in a card. Default: "card". */
  mode?: Mode;
  /** YouVersion Platform app key. Required for "card" mode. */
  yvpPublicAppKey?: string;
  /** What opens a card: "click", or "hover" with a mouse (taps and clicks still work). Default: "click". */
  trigger?: Trigger;
  /** Bible version for cards. Default: 3034 (BSB). */
  yvpBibleVersionId?: number;
  /** Where a card shows the reference: "heading", "citation", "quote", or "none". Default: "heading". */
  reference?: ReferenceLayout;
  /** Where to look for references. Default: the whole page, including a body that replaces it. */
  root?: Node;
  /** Keep linking references in content added later, such as pages swapped in by Turbo or a router. Default: true. */
  watch?: boolean;
};

const BSB = 3034;

const linkStyles = `
.${REF_CLASS} {
  /* Lay out exactly like the text it replaced, whatever the host styles links as,
     so linking a reference never reflows the line. Only paint-only styles below. */
  display: inline !important;
  font: inherit !important;
  letter-spacing: inherit !important;
  word-spacing: inherit !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  color: inherit;
  text-decoration: underline dotted;
  text-decoration-thickness: 1.5px;
  text-underline-offset: 0.2em;
  cursor: pointer;
}
.${REF_CLASS}:hover { text-decoration-style: solid; }`;

export type ScriptureInline = {
  /** The links that replaced each reference. */
  links: HTMLAnchorElement[];
  /** Closes any card, removes the listeners, and turns the links back into plain text. */
  stop(): void;
};

/** Finds Bible references on the page and makes them interactive. */
export function scriptureInline({
  mode = "card",
  trigger = "click",
  yvpPublicAppKey,
  yvpBibleVersionId = BSB,
  reference = "heading",
  root,
  watch = true,
}: ScriptureInlineOptions = {}): ScriptureInline {
  if (!document.getElementById("scripture-inline-styles")) {
    const style = document.createElement("style");
    style.id = "scripture-inline-styles";
    style.textContent = linkStyles;
    document.head.append(style);
  }

  const links = wrapReferences(root ?? document.body);
  const listening = new AbortController();
  const { signal } = listening;
  let card: ReturnType<typeof createScriptureCard> | null = null;
  // Listen on the document for the whole page, so the listeners outlive a swapped body.
  const events = root ?? document;

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        // For the whole page, only the body has prose. Skip what lands in <head>.
        if (!node.isConnected || (!root && !document.body?.contains(node))) continue;
        // A tree walker never visits its own root, so scan a new text node from its parent.
        const scope = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
        if (!scope) continue;
        links.push(...wrapReferences(scope));
        // Track links that come back already wrapped, as when Turbo restores a cached page, so stop() unwraps them.
        if (scope instanceof Element) {
          for (const link of scope.querySelectorAll<HTMLAnchorElement>(`a.${REF_CLASS}`)) if (!links.includes(link)) links.push(link);
        }
      }
    }
    // Drop the mutations the wrapping just made, so they don't trigger another pass.
    observer.takeRecords();
    // Forget links the page removed, so old pages can be garbage collected.
    for (let i = links.length - 1; i >= 0; i--) if (!links[i].isConnected) links.splice(i, 1);
    card?.closeIfDetached();
  });
  if (mode === "card") {
    if (!yvpPublicAppKey) throw new Error("[scripture-inline] Card mode needs a YouVersion Platform yvpPublicAppKey.");
    const opened = (card = createScriptureCard({ yvpPublicAppKey, yvpBibleVersionId, reference }));
    const refFrom = (event: Event) => (event.target as Element).closest?.(`a.${REF_CLASS}`) as HTMLAnchorElement | null;

    events.addEventListener("click", (event) => {
      const mouse = event as MouseEvent;
      // Let modified clicks open route.bible as a normal link.
      if (mouse.metaKey || mouse.ctrlKey || mouse.shiftKey || mouse.altKey || mouse.button !== 0) return;
      const link = refFrom(event);
      if (!link) return;
      event.preventDefault();
      opened.toggle(link);
    }, { signal });

    if (trigger === "hover") {
      events.addEventListener("pointerover", (event) => {
        const link = refFrom(event);
        if (link && (event as PointerEvent).pointerType === "mouse") opened.hover(link);
      }, { signal });
      events.addEventListener("pointerout", (event) => {
        if (refFrom(event)) opened.unhover(event as PointerEvent);
      }, { signal });
    }
  }

  if (watch) observer.observe(root ?? document.documentElement, { childList: true, subtree: true });

  return {
    links,
    stop() {
      observer.disconnect();
      listening.abort();
      card?.destroy();
      unwrapReferences(links);
    },
  };
}
