import assert from 'node:assert/strict'
import path from 'node:path'

import { windowFolderName } from '../../../src/core/paths'
import { folderLabel, handoffFolder, sharedPlace } from '../../../src/handoff/handoffPlace'

const named = (folder: string | undefined): string => path.basename(folder ?? assert.fail())

describe('handoff place', () => {
  const root = 'E:/work/api'
  const gitDir = 'E:/work/api/.git'
  const window = 'E:/work/api'

  it('a repository keeps the files in the git directory', () => {
    assert.equal(sharedPlace('git', root, gitDir), path.join('E:/work/api/.git/y-review'))
  })

  it('a worktree keeps the files where git names the directory', () => {
    assert.equal(
      sharedPlace('git', root, 'E:/work/main/.git/worktrees/api'),
      path.join('E:/work/main/.git/worktrees/api/y-review'),
    )
  })

  it('a repository without a git directory has no place', () => {
    assert.equal(sharedPlace('git', root, undefined), undefined)
    assert.equal(handoffFolder('git', root, undefined, window), undefined)
  })

  it('a folder store keeps the files beside its own records', () => {
    assert.equal(sharedPlace('folder', root, undefined), path.join('E:/work/api/.y-review'))
  })

  it('a folder store ignores a git directory', () => {
    assert.equal(sharedPlace('folder', root, gitDir), path.join('E:/work/api/.y-review'))
  })

  it('the folder of one window stands inside the folder that every window shares', () => {
    assert.equal(
      path.dirname(handoffFolder('git', root, gitDir, window) ?? assert.fail()),
      sharedPlace('git', root, gitDir),
    )
    assert.equal(
      path.dirname(handoffFolder('folder', root, undefined, window) ?? assert.fail()),
      sharedPlace('folder', root, undefined),
    )
  })

  it('two project windows on one repository get two folders', () => {
    assert.notEqual(
      handoffFolder('git', root, gitDir, window),
      handoffFolder('git', root, gitDir, 'E:/work/api/server'),
    )
  })

  it('two folder stores of one root get two folders', () => {
    assert.notEqual(
      handoffFolder('folder', root, undefined, window),
      handoffFolder('folder', root, undefined, 'E:/work/api/server'),
    )
  })

  it('one window keeps one folder', () => {
    assert.equal(
      handoffFolder('git', root, gitDir, window),
      handoffFolder('git', root, gitDir, window),
    )
  })

  it('the name of the folder starts with the name of the project folder', () => {
    assert.ok(
      named(handoffFolder('git', root, gitDir, 'E:/Projects/Opened/y-review')).startsWith(
        'vscode-y-review-',
      ),
    )
  })

  it('a project that names no directory still gets a folder', () => {
    assert.ok(named(handoffFolder('git', root, gitDir, '')).startsWith('vscode-project-'))
  })

  it('the window folder never equals the folder of the IntelliJ plugin', () => {
    assert.notEqual(named(handoffFolder('git', root, gitDir, window)), windowFolderName(window))
  })
})

describe('handoff folder label', () => {
  // The root of the file system that runs the test, "E:\" on Windows and "/" on Linux.
  const top = path.parse(process.cwd()).root
  const topLabel = top.replaceAll('\\', '/')
  const absolute = (...names: string[]): string => path.join(top, ...names)

  it('shortens a folder that sits inside the repository', () => {
    assert.equal(
      folderLabel(absolute('repo', '.git', 'y-review'), absolute('repo')),
      '.git/y-review',
    )
  })

  it('keeps the whole path of a folder outside the repository', () => {
    assert.equal(
      folderLabel(absolute('main', '.git', 'worktrees', 'tree', 'y-review'), absolute('tree')),
      `${topLabel}main/.git/worktrees/tree/y-review`,
    )
  })
})
