/** Which repositories the extension may ask about the fetch refspec. One question for each repository and session. */
export class RefspecAsks {
  private readonly refused: Set<string>

  private readonly asked = new Set<string>()

  constructor(declined: Iterable<string> = []) {
    this.refused = new Set(declined)
  }

  /** True for the first call for `root` in this session, and never after "Do not ask again". */
  mayAsk(root: string): boolean {
    if (this.refused.has(root) || this.asked.has(root)) return false
    this.asked.add(root)
    return true
  }

  decline(root: string): void {
    this.refused.add(root)
  }

  declined(): readonly string[] {
    return [...this.refused].sort()
  }
}
