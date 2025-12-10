declare module "virtual:dev-inspector-mcp" {
  /**
   * Development-only inspector initialization module.
   * This module is automatically tree-shaken in production builds.
   *
   * Import this in your entry point for non-HTML projects (miniapps, library bundles):
   *
   * @example
   * ```typescript
   * // main.ts
   * import 'virtual:dev-inspector-mcp';
   * ```
   *
   * When building for production, bundlers will statically replace `import.meta.env.DEV`
   * with `false`, causing the entire module code to be removed via dead code elimination.
   */
  const _default: void;
  export default _default;
}
