import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

/** A folder outside every git repository, one for each checkout, so parallel worktrees do not share it. */
export const plainFolder = () =>
  path.join(
    realpathSync.native(tmpdir()),
    `yreview-plain-${createHash('sha256').update(process.cwd()).digest('hex').slice(0, 8)}`,
  )
