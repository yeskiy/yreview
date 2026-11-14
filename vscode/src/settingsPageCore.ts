export interface AgentChoice<Id extends string = string> {
  readonly id: Id
  readonly label: string
  /** False for Another agent and No agent, which name no program. */
  readonly product: boolean
  readonly found: string | undefined
  readonly row: string
  /** The arguments or the Add command that Yreview adds for this agent. */
  readonly appended?: string
}

export interface AgentPickItem<Id extends string = string> {
  readonly label: string
  readonly description: string
  readonly detail: string
  readonly picked: boolean
  readonly id: Id
}

export const NOT_FOUND = 'not found on the search path of this window'
export const ARGUMENTS = 'Yreview adds:'

export const agentPickItem = <Id extends string>(
  choice: AgentChoice<Id>,
  current: string | undefined,
): AgentPickItem<Id> => ({
  label: choice.label,
  description: choice.product ? (choice.found ?? NOT_FOUND) : '',
  detail:
    choice.appended === undefined ? choice.row : `${choice.row} ${ARGUMENTS} ${choice.appended}`,
  picked: choice.id === current,
  id: choice.id,
})
