package com.yeskiy.yreview.handoff

import com.yeskiy.yreview.store.FolderStore
import com.yeskiy.yreview.store.StoreKind
import java.nio.file.Path

/**
 * The folder that holds the three files of the file protocol, for one store.
 *
 * A git repository keeps them inside the git directory, which git never tracks, so no
 * review file reaches a commit. A folder store keeps them beside its own records, in the
 * same folder, because no git directory exists there.
 *
 * The rule takes plain paths, so a test proves it without a project.
 */
object HandoffPlace {

    /** [gitDir] is the answer of [GitDir.of], and it is null when git did not answer. */
    fun of(kind: StoreKind, root: Path, gitDir: Path?): Path? = when (kind) {
        StoreKind.GIT -> gitDir?.resolve(GitDir.FOLDER)
        StoreKind.FOLDER -> root.resolve(FolderStore.FOLDER)
    }
}
