// The rows of the remote check table in CONTRIBUTING.md.
export const CHECKS = [
  [1, 'Show Log shows the start and the host'],
  [2, 'A shared comment reaches a second clone'],
  [3, 'A resolved comment stays resolved'],
  [4, 'A sent task reaches Claude Code'],
  [5, 'The agent resolves the task'],
  [6, 'The context menu of the Markdown preview'],
  [7, 'The Add button of the Markdown preview'],
  [8, 'The diagnostic report holds no remote path'],
  [9, 'The Report button opens the issue form'],
  [10, 'The log export holds the Yreview log'],
  [11, 'The bridge file goes when the window goes'],
  [12, 'The review preview opens and renders'],
  [13, 'The key in the review preview saves lines'],
  [14, 'A comment on a loose file in an empty window'],
]

// The owner checks these rows by hand, so the workflow leaves them out.
export const SKIPPED = new Set([4, 5])
