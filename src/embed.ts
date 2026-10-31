// Drop-in entry: <script src="scripture-inline.js" data-yvp-public-app-key="..." data-mode="card" data-trigger="hover"></script>
import { definePassageInput, defineScripturePassage, scriptureInline, type Mode, type ReferenceLayout, type Trigger } from "./index";

const script = document.currentScript as HTMLScriptElement | null;
const data = script?.dataset ?? {};

// Pages that load the script can also place <si-passage> and <si-passage-input> themselves.
// The script's app key is the default for every passage, so they don't repeat it.
defineScripturePassage({ yvpPublicAppKey: data.yvpPublicAppKey });
definePassageInput();

const run = () =>
  scriptureInline({
    mode: (data.mode as Mode | undefined) ?? (data.yvpPublicAppKey ? "card" : "link"),
    trigger: data.trigger as Trigger | undefined,
    yvpPublicAppKey: data.yvpPublicAppKey,
    yvpBibleVersionId: data.yvpBibleVersionId ? Number(data.yvpBibleVersionId) : undefined,
    reference: data.reference as ReferenceLayout | undefined,
  });

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
else run();
