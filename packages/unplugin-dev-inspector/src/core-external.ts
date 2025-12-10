import { createDevInspectorPlugin } from "./utils/create-plugin";
import { detectFileType } from "./utils/file-type-detector";
import { transformCode } from "@code-inspector/core";

export const unpluginExternal = createDevInspectorPlugin(
  "unplugin-dev-inspector-external",
  (options) => {
    return async (code, id) => {
      if (!id || id.includes("node_modules")) return null;

      const fileType = detectFileType(id);
      if (!fileType) return null;

      try {
        return transformCode({
          content: code,
          filePath: id,
          fileType,
          escapeTags: [],
          pathType: "absolute",
        });
      } catch (error) {
        console.error(`[dev-inspector] Failed to transform ${id}:`, error);
        return null;
      }
    };
  },
);
