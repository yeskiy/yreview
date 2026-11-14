import { access } from 'node:fs/promises'
import path from 'node:path'

import type { SendReport } from '../bridge/sendReport'
import type { BridgeExtras } from '../session/bridgePlan'
import type { SessionPlan } from '../session/sessionPlan'
import { NONE, type SendFacts, type SessionStart } from './sessionRecord'

/** The folder and the name of a file. The install folder of the editor can be outside each place. */
const tail = (file: string): string => file.split(/[\\/]/).slice(-2).join('/')

/** Reads no field of the plan environment or of `extras.env`, because both can hold a bridge variable. */
export const startOf = async (
  plan: SessionPlan,
  extras: Partial<BridgeExtras>,
  facts: { readonly terminalStarted: boolean; readonly processId?: number },
): Promise<SessionStart> => ({
  command: [path.basename(plan.shellPath), ...plan.shellArgs].join(' '),
  directory: plan.workingDirectory,
  status: plan.status,
  runtime: process.version,
  bridgeReady: extras.bridgeReady ?? false,
  bridgeUrl: extras.bridgeUrl ? extras.bridgeUrl : NONE,
  configFile: extras.configFile,
  channelServer:
    extras.channelScript === undefined
      ? undefined
      : {
          kind: await access(extras.channelScript).then(
            () => 'found' as const,
            () => 'missing' as const,
          ),
          path: tail(extras.channelScript),
        },
  ...facts,
})

/** Counts and the route only. The tasks, the folder and the session name stay out of the record. */
export const sendOf = (
  report: SendReport,
  store: 'git' | 'folder',
  readers: number,
): SendFacts => ({
  route: report.route ?? NONE,
  store,
  readers,
  tasks: report.tasks,
  batches: report.batches,
  dropped: report.dropped ?? 0,
  problem: report.problem ?? report.dropReason,
})
