export const DISCUSS = 'refs/notes/devtools/discuss'
export const ANALYSES = 'refs/notes/devtools/analyses'
export const LOCAL = 'refs/notes/y-review/local'
export const ALL_REFS: readonly string[] = [DISCUSS, ANALYSES, LOCAL]

export const isShared = (ref: string): boolean => ref !== LOCAL

/** The ref a new comment goes to. The choice is the ref itself, never a field in the note. */
export const refFor = (shared: boolean): string => (shared ? DISCUSS : LOCAL)
