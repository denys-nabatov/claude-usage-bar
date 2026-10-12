import type { SessionRateLimit } from 'claude-code'

export type Thresholds = {
  costWarnUsd: number
  turnCostWarnUsd: number
  limitWarnPct: number
}

export const DEFAULTS: Thresholds = {
  costWarnUsd: 5,
  turnCostWarnUsd: 2,
  limitWarnPct: 80,
}

const FIVE_HOUR = 'five_hour'
const SEVEN_DAY = 'seven_day'

export const BAR_WIDTH = 14

export type Level = 'success' | 'warning' | 'error'

export type Card = {
  key: string
  title: string
  /** Absent until the first reply of the session reports the window. */
  usage?: { bar: string; used: string; level: Level }
  footer: string
}

export const thresholdsFrom = (options: Readonly<Record<string, unknown>>): Thresholds => {
  const pick = (key: keyof Thresholds): number => {
    const value = options[key]

    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : DEFAULTS[key]
  }

  return {
    costWarnUsd: pick('costWarnUsd'),
    turnCostWarnUsd: pick('turnCostWarnUsd'),
    limitWarnPct: pick('limitWarnPct'),
  }
}

const find = (limits: readonly SessionRateLimit[], kind: string): SessionRateLimit | undefined =>
  limits.find(limit => limit.kind === kind)

/** `42m`, `2h 14m`, `1d 8h`; `now` once the time has passed. */
export const countdown = (resetsAt: string | undefined, now: number): string | null => {
  if (resetsAt === undefined) {
    return null
  }

  const at = Date.parse(resetsAt)

  if (Number.isNaN(at)) {
    return null
  }

  const minutes = Math.ceil((at - now) / 60_000)

  if (minutes <= 0) {
    return 'now'
  }

  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60

  if (days > 0) {
    return `${days}d ${hours}h`
  }

  if (hours > 0) {
    return `${hours}h ${mins}m`
  }

  return `${mins}m`
}

export const bar = (percentUsed: number, width = BAR_WIDTH): string => {
  const filled = Math.min(width, Math.max(0, Math.round((percentUsed / 100) * width)))

  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

/** Green below half, yellow from half, red from 80%: the person's own status line scheme. */
export const levelOf = (percentUsed: number): Level =>
  percentUsed >= 80 ? 'error' : percentUsed >= 50 ? 'warning' : 'success'

const percent = (value: number): string => `${Math.round(value)}%`

export const money = (usd: number): string => `$${usd.toFixed(2)}`

const card = (key: string, title: string, limit: SessionRateLimit | undefined, now: number): Card => {
  if (limit === undefined) {
    return { key, title, footer: 'waiting for first reply' }
  }

  const resets = countdown(limit.resetsAt, now)

  return {
    key,
    title,
    usage: { bar: bar(limit.percentUsed), used: `${percent(limit.percentUsed)} used`, level: levelOf(limit.percentUsed) },
    footer: resets === null ? '' : resets === 'now' ? 'resets now' : `resets in ${resets}`,
  }
}

export const cards = (limits: readonly SessionRateLimit[], now: number): Card[] => [
  card('five-hour', 'Session limit (5h)', find(limits, FIVE_HOUR), now),
  card('seven-day', 'Weekly limit (7 days)', find(limits, SEVEN_DAY), now),
]

export const sessionText = (costUsd: number, thresholds: Thresholds): { text: string; isExpensive: boolean } => {
  const isExpensive = costUsd >= thresholds.costWarnUsd

  return {
    text: `${isExpensive ? '⚠ ' : ''}This session: ${money(costUsd)} spent (API-price equivalent)`,
    isExpensive,
  }
}

export type Warning = { key: string; text: string }

export type WarningInput = {
  limits: readonly SessionRateLimit[]
  costUsd: number | null
  thresholds: Thresholds
  now: number
}

const LABELS: Record<string, string> = { [FIVE_HOUR]: 'Session (5h)', [SEVEN_DAY]: 'Weekly' }

/**
 * Every warning the figures call for now, each under a key that says when it
 * was already given: a limit's warnings re-arm with its next window, the cost
 * ones last the session.
 */
export const warnings = ({ limits, costUsd, thresholds, now }: WarningInput): Warning[] => {
  const found: Warning[] = []

  if (costUsd !== null && costUsd >= thresholds.costWarnUsd) {
    // $5, $10, $20, ...: the highest step passed, so a jump warns once.
    let step = thresholds.costWarnUsd

    while (step * 2 <= costUsd) {
      step *= 2
    }

    found.push({
      key: `cost:${step}`,
      text: `This session has cost ${money(costUsd)} so far (past ${money(step)}). Consider /compact or a fresh session.`,
    })
  }

  const levels = [...new Set([95, thresholds.limitWarnPct])].sort((a, b) => b - a)

  for (const limit of limits) {
    const label = LABELS[limit.kind]

    if (label === undefined) {
      continue
    }

    for (const level of levels) {
      if (limit.percentUsed >= level) {
        const resets = countdown(limit.resetsAt, now)

        found.push({
          key: `limit:${limit.kind}:${level}:${limit.resetsAt ?? ''}`,
          text: `${label} limit at ${percent(limit.percentUsed)} used${resets ? `, resets in ${resets}` : ''}.`,
        })

        break
      }
    }
  }

  return found
}
