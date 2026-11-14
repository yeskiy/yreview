import path from 'node:path'

export const MCP_FOLDER = 'mcp'
export const PRODUCT_CODE = 'vscode'
export const SUFFIX = '.json'

/** One file for each agent. The product code keeps the file apart from the file of an IDE. */
export const configFileName = (agentId: string): string =>
  `${agentId.toLowerCase()}-${PRODUCT_CODE}${SUFFIX}`

export const configFilePath = (home: string, agentId: string): string =>
  path.join(home, '.y-review', MCP_FOLDER, configFileName(agentId))

/** The content decides, because a VS Code update moves the runtime path. */
export const needsWrite = (onDisk: string | undefined, wanted: string): boolean => onDisk !== wanted
