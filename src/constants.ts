import * as path from "@modules/path";
import { fileURLToPath } from "@modules/url";

import { TYPORA_RESOURCE_DIR } from "./typora-utils";
import { setGlobalVar } from "./utils/tools";

/**
 * Plugin version.
 */
export const VERSION = "0.3.12";

/**
 * Copilot plugin directory.
 */
const pluginScript = document.currentScript;
export const PLUGIN_DIR =
  pluginScript instanceof HTMLScriptElement && pluginScript.src.startsWith("file:") ?
    path.dirname(fileURLToPath(pluginScript.src))
  : path.join(TYPORA_RESOURCE_DIR, "copilot");
setGlobalVar("__copilotDir", PLUGIN_DIR);
