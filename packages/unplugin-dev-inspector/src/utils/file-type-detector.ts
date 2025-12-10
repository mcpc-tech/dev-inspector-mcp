/**
 * Detects the file type based on the file path extension
 * @param id - The file path
 * @returns The file type ('jsx' | 'vue' | 'svelte') or null if not supported
 */
export function detectFileType(id: string): "jsx" | "vue" | "svelte" | null {
  if (id.match(/\.(jsx|tsx|js|ts|mjs|mts)$/)) return "jsx";
  if (id.match(/\.vue$/)) return "vue";
  if (id.match(/\.svelte$/)) return "svelte";
  return null;
}
