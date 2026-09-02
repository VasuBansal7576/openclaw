import path from "node:path";
import { pluginCacheExistsSync } from "./plugin-cache-files.js";

/** Resolves caller-ordered filenames across root and package-local dist layouts. */
export function resolvePluginRootArtifactPath(
  rootDir: string,
  artifactBasenames: readonly string[],
): string | null {
  // Filename preference precedes layout so callers retain their source/format order.
  for (const basename of artifactBasenames) {
    for (const baseDir of [rootDir, path.join(rootDir, "dist")]) {
      const candidate = path.join(baseDir, basename);
      if (pluginCacheExistsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}
