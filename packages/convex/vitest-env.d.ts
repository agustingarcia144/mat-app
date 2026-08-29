// Vite's `import.meta.glob`, used by convex-test to load the Convex modules
// under test. Declared locally because `vite/client` is not resolvable under
// this workspace's isolated node linker.
interface ImportMeta {
  glob(pattern: string): Record<string, () => Promise<unknown>>;
}
