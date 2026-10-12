import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Figures } from '../types'
import { cards, money, sessionText, thresholdsFrom, warnings } from './format'
import type { Thresholds } from './format'

const figures = atom({ plugin: 'usage-bar', key: 'figures' } as const, null)
const now = atom({ plugin: 'usage-bar', key: 'now' } as const, 0)
const warned = atom({ plugin: 'usage-bar', key: 'warned' } as const, [])
const turnStartCost = atom({ plugin: 'usage-bar', key: 'turnStartCost' } as const, null)

const TICK_MS = 60_000
const CARD_WIDTH = 30
const SIDE_BY_SIDE_COLUMNS = CARD_WIDTH * 2 + 1

async function measure($: EngineInterface): Promise<Figures> {
  const usage = await $.session.usage()
  const measured: Figures = { limits: [...usage.rateLimits], costUsd: usage.cost?.usd ?? null }

  await update($, figures, () => measured)

  return measured
}

async function tick($: EngineInterface): Promise<void> {
  const time = await $.clock.now()
  await update($, now, () => time)
}

async function warn($: EngineInterface, measured: Figures, thresholds: Thresholds): Promise<void> {
  const given = new Set(await read($, warned))
  const fresh = warnings({ ...measured, thresholds, now: await $.clock.now() }).filter(w => !given.has(w.key))

  if (fresh.length === 0) {
    return
  }

  await update($, warned, keys => [...keys, ...fresh.map(w => w.key)].slice(-200))

  for (const warning of fresh) {
    $.ui.toast(`⚠ ${warning.text}`, { timeoutMs: 10_000 })
  }
}

async function currentCost($: EngineInterface): Promise<number | null> {
  return (await $.session.usage()).cost?.usd ?? null
}

export const register: Register = (on, options) => {
  const thresholds = thresholdsFrom(options)

  on('session.start', async ($, e, next) => {
    // The line the first version pinned under the prompt, if a reload left it.
    $.ui.status(undefined)
    // Countdowns move with the clock, not with the session's measurements.
    $.clock.every(TICK_MS, () => tick($))
    await measure($)
    await tick($)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const measured = await measure($)
    await tick($)
    await warn($, measured, thresholds)

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const cost = await currentCost($)
    await update($, turnStartCost, () => cost)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const startedAt = await read($, turnStartCost)
    const cost = await currentCost($)

    if (startedAt !== null && cost !== null && cost - startedAt >= thresholds.turnCostWarnUsd) {
      $.ui.toast(`⚠ That turn cost ${money(cost - startedAt)} (session ${money(cost)}).`, { timeoutMs: 10_000 })
    }

    await update($, turnStartCost, () => null)

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const measured = await read($, figures)
    const time = await read($, now)
    const isSideBySide = e.props.bodyColumns >= SIDE_BY_SIDE_COLUMNS
    const session = measured?.costUsd == null ? null : sessionText(measured.costUsd, thresholds)

    return (
      <Box flexDirection="column">
        <Box flexDirection={isSideBySide ? 'row' : 'column'} columnGap={1}>
          {cards(measured?.limits ?? [], time).map(card => (
            <Box key={card.key} flexDirection="column" borderStyle="round" paddingX={1} width={CARD_WIDTH}>
              <Text bold>{card.title}</Text>
              {card.usage === undefined ? (
                <Text dimColor>{card.footer}</Text>
              ) : (
                <>
                  <Text>
                    <Text color={card.usage.level}>{card.usage.bar}</Text> {card.usage.used}
                  </Text>
                  <Text dimColor>{card.footer}</Text>
                </>
              )}
            </Box>
          ))}
        </Box>
        {session !== null && (
          <Text color={session.isExpensive ? 'warning' : undefined} dimColor={!session.isExpensive}>
            {' '}
            {session.text}
          </Text>
        )}
      </Box>
    )
  })
}
