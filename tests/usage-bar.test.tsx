import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, SessionRateLimit, SessionUsage } from 'claude-code'

import { bar, cards, countdown, DEFAULTS, levelOf, sessionText, warnings } from '../hooks/format'

const NOW = Date.parse('2026-10-12T15:46:00Z')

const fiveHour = (percentUsed: number): SessionRateLimit => ({
  kind: 'five_hour',
  percentUsed,
  resetsAt: '2026-10-12T17:59:59Z',
})
const sevenDay = (percentUsed: number): SessionRateLimit => ({
  kind: 'seven_day',
  percentUsed,
  resetsAt: '2026-10-13T23:59:59Z',
})

const usage = (rateLimits: SessionRateLimit[], usd: number): SessionUsage => ({
  startedAt: NOW - 3_600_000,
  context: { window: 200_000 },
  rateLimits,
  cost: { usd },
})

/** The engine beneath the plugin: the events it hooks and the ops it calls. */
const engine = (on: On, current: () => SessionUsage, toasts: string[] = []) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: current() }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', ($, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
}

const measure = ($: Engine, u: SessionUsage) =>
  $.session.measure({ context: u.context, rateLimits: u.rateLimits, cost: u.cost, changed: ['rateLimits', 'cost'] })

const band = (bodyColumns: number) => ({
  hasSurvey: false,
  isWorking: false,
  maxRows: 20,
  bodyColumns,
  scroll: { offset: 0, bodyRows: 19 },
  view: {},
})

test('countdown reads minutes, hours and days', () => {
  expect(countdown('2026-10-12T16:28:00Z', NOW)).toBe('42m')
  expect(countdown('2026-10-12T17:59:59Z', NOW)).toBe('2h 14m')
  expect(countdown('2026-10-13T23:59:59Z', NOW)).toBe('1d 8h')
  expect(countdown('2026-10-12T15:00:00Z', NOW)).toBe('now')
  expect(countdown(undefined, NOW)).toBe(null)
})

test('bars fill with usage and change colour at 50% and 80%', () => {
  expect(bar(6)).toBe('█░░░░░░░░░░░░░')
  expect(bar(50)).toBe('███████░░░░░░░')
  expect(bar(130)).toBe('██████████████')
  expect([levelOf(49), levelOf(50), levelOf(80)]).toEqual(['success', 'warning', 'error'])
})

test('cards say in words what each number is', () => {
  expect(cards([fiveHour(6), sevenDay(35)], NOW)).toEqual([
    {
      key: 'five-hour',
      title: 'Session limit (5h)',
      usage: { bar: bar(6), used: '6% used', level: 'success' },
      footer: 'resets in 2h 14m',
    },
    {
      key: 'seven-day',
      title: 'Weekly limit (7 days)',
      usage: { bar: bar(35), used: '35% used', level: 'success' },
      footer: 'resets in 1d 8h',
    },
  ])
  expect(cards([], NOW).map(card => card.footer)).toEqual(['waiting for first reply', 'waiting for first reply'])
})

test('the session line is marked once the session gets expensive', () => {
  expect(sessionText(1.237, DEFAULTS)).toEqual({
    text: 'This session: $1.24 spent (API-price equivalent)',
    isExpensive: false,
  })
  expect(sessionText(6, DEFAULTS)).toEqual({
    text: '⚠ This session: $6.00 spent (API-price equivalent)',
    isExpensive: true,
  })
})

test('warnings: highest cost step passed, and each limit at 80% or 95%', () => {
  const found = warnings({ limits: [fiveHour(83), sevenDay(96)], costUsd: 12.5, thresholds: DEFAULTS, now: NOW })

  expect(found).toEqual([
    {
      key: 'cost:10',
      text: 'This session has cost $12.50 so far (past $10.00). Consider /compact or a fresh session.',
    },
    { key: 'limit:five_hour:80:2026-10-12T17:59:59Z', text: 'Session (5h) limit at 83% used, resets in 2h 14m.' },
    { key: 'limit:seven_day:95:2026-10-13T23:59:59Z', text: 'Weekly limit at 96% used, resets in 1d 8h.' },
  ])
})

test('the board shows both limits and the session cost on every surface', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on, () => usage([fiveHour(6), sevenDay(35)], 1.24))
  await measure($, usage([fiveHour(6), sevenDay(35)], 1.24))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-bar', surface, component: 'AbovePrompt', props: band(100) })

    expect(await ui.find({ type: 'Text', text: 'Session limit (5h)' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Weekly limit (7 days)' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /6% used/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'resets in 2h 14m' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'resets in 1d 8h' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /This session: \$1\.24 spent \(API-price equivalent\)/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Fable/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('cards sit side by side when there is room and stack when there is not', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on, () => usage([fiveHour(6), sevenDay(35)], 1))
  await measure($, usage([fiveHour(6), sevenDay(35)], 1))

  const wide = await $.ui.mount({ plugin: 'usage-bar', surface: 'terminal', component: 'AbovePrompt', props: band(100) })
  const wideRow = (await wide.findAll({ type: 'Box' }))[1]
  expect(wideRow?.props.flexDirection).toBe('row')
  await wide.unmount()

  const narrow = await $.ui.mount({ plugin: 'usage-bar', surface: 'terminal', component: 'AbovePrompt', props: band(50) })
  const narrowRow = (await narrow.findAll({ type: 'Box' }))[1]
  expect(narrowRow?.props.flexDirection).toBe('column')
  await narrow.unmount()
})

test('bars turn red at 80% and an expensive session line turns yellow', async ($, on) => {
  mock.clock(on, { now: NOW })
  const current = usage([fiveHour(85), sevenDay(35)], 7)
  engine(on, () => current)
  await measure($, current)

  const ui = await $.ui.mount({ plugin: 'usage-bar', surface: 'terminal', component: 'AbovePrompt', props: band(100) })

  const colourOf = async (text: string) =>
    (await ui.findAll({ type: 'Text', text })).find(found => found.text === text)?.props.color

  expect(await colourOf(bar(85))).toBe('error')
  expect(await colourOf(bar(35))).toBe('success')
  expect((await ui.find({ type: 'Text', text: /⚠ This session: \$7\.00/ }))?.props.color).toBe('warning')
  await ui.unmount()
})

test('before the first reply the cards say they are waiting', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on, () => usage([], 0))

  const ui = await $.ui.mount({ plugin: 'usage-bar', surface: 'terminal', component: 'AbovePrompt', props: band(100) })

  expect((await ui.findAll({ type: 'Text', text: 'waiting for first reply' })).length).toBe(2)
  await ui.unmount()
})

test('the board steps aside for a survey', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on, () => usage([fiveHour(6)], 0))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>survey</Text>
  })

  const ui = await $.ui.mount({
    plugin: 'usage-bar',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { ...band(100), hasSurvey: true },
  })

  expect(await ui.find({ type: 'Text', text: 'survey' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Session limit (5h)' })).toBeUndefined()
  await ui.unmount()
})

test('a measurement toasts each warning once', async ($, on) => {
  mock.clock(on, { now: NOW })
  const toasts: string[] = []
  let current = usage([fiveHour(10), sevenDay(35)], 0.4)
  engine(on, () => current, toasts)

  await measure($, current)
  expect(toasts).toEqual([])

  current = usage([fiveHour(81), sevenDay(35)], 6)
  await measure($, current)
  await measure($, current)

  expect(toasts).toEqual([
    '⚠ This session has cost $6.00 so far (past $5.00). Consider /compact or a fresh session.',
    '⚠ Session (5h) limit at 81% used, resets in 2h 14m.',
  ])
})

test('thresholds come from the config', { options: { costWarnUsd: 1 } }, async ($, on) => {
  mock.clock(on, { now: NOW })
  const toasts: string[] = []
  const current = usage([], 1.5)
  engine(on, () => current, toasts)

  await measure($, current)

  expect(toasts).toEqual(['⚠ This session has cost $1.50 so far (past $1.00). Consider /compact or a fresh session.'])
})

test('the countdown ticks every minute after the session starts', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  engine(on, () => usage([fiveHour(10)], 0))

  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'usage-bar', surface: 'terminal', component: 'AbovePrompt', props: band(100) })
  expect(await ui.find({ type: 'Text', text: 'resets in 2h 14m' })).toBeDefined()

  await clock.advance(60_000)
  expect(await ui.find({ type: 'Text', text: 'resets in 2h 13m' })).toBeDefined()
  await ui.unmount()
})
