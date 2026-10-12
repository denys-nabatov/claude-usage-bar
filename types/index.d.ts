/** One rate-limit window as `$.session.usage()` reports it. */
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

/** What the board draws from: the session's last measurement. */
export type Figures = { limits: Limit[]; costUsd: number | null }

declare module 'claude-code' {
  interface PluginState {
    'usage-bar': {
      figures: Figures | null
      now: number
      warned: string[]
      turnStartCost: number | null
    }
  }
}
