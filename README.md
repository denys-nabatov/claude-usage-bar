# Usage Bar for Claude Code

**See your plan limits and when they reset, right above the prompt.**

Usage Bar is a Claude Code mod that draws a small board above the prompt: how much of your 5-hour and weekly plan limits you have used, when each one resets, and what the current session has cost so far. It warns you with a toast when a session gets expensive or a limit gets close.

**[Install](#install)** · [How it works](#how-it-works) · [Warnings and settings](#warnings-and-settings) · [What it can reach](#what-it-can-reach) · [Limits](#limits)

```
╭────────────────────────────╮ ╭────────────────────────────╮
│ Session limit (5h)         │ │ Weekly limit (7 days)      │
│ █░░░░░░░░░░░░░ 6% used     │ │ █████░░░░░░░░░ 35% used    │
│ resets in 2h 14m           │ │ resets in 1d 8h            │
╰────────────────────────────╯ ╰────────────────────────────╯
 This session: $1.24 spent (API-price equivalent)
```

## Install

Needs Claude Code with mods enabled (built and tested on 2.1.296) and a Claude subscription login (Pro, Max, Team or Enterprise). With an API key there are no plan limits to show.

At the prompt of a Claude Code terminal session:

```
/plugin install usage-bar --marketplace denys-nabatov/claude-usage-bar
```

Answer `y` to add the marketplace, then pick the **user** scope. Or from a shell:

```sh
claude plugin marketplace add denys-nabatov/claude-usage-bar
claude plugin install usage-bar@claude-usage-bar
```

Start a new session or run `/reload-plugins` in an open one. The board appears above the prompt in every session from then on.

## How it works

The board has two cards and one line under them:

- **Session limit (5h)** - the share of your rolling 5-hour plan allowance you have used, and the time until that window resets.
- **Weekly limit (7 days)** - the share of your 7-day allowance across all models, and the time until it resets.
- **This session** - what this session would cost at API list prices, the same figure `/cost` shows. On a subscription you are not billed this amount; it is a yardstick for how heavy the session is.

Bars are green below 50%, yellow from 50% and red from 80%. The session line turns yellow and gains a ⚠ once it passes the cost warning threshold, so color is never the only signal.

The figures are the ones Claude Code's own status line reads. Claude Code learns the limit windows from API responses, so until the first reply of a session each card says `waiting for first reply`. The board redraws when Claude Code measures the session (after each turn, and when a window moves by a whole point), and the reset countdowns tick once a minute.

The cards sit side by side from 61 columns and stack on narrower terminals. A Claude Code survey takes priority over the band while it is shown, and the band can be collapsed with Claude Code's own `[-]` mark.

## Warnings and settings

A toast appears when:

- this session's cost passes **$5**, and again at $10, $20, $40 and so on (the highest step passed, so one jump warns once);
- a single turn, from sending a prompt to the answer, costs **$2** or more;
- the 5-hour or weekly limit reaches **80%**, and again at 95%; each warning fires once per window and re-arms when that window resets.

The three thresholds are plugin settings, set on the install screen and changeable later in `/config`:

| Setting | Default | Meaning |
|---|---|---|
| Session cost warning (USD) | 5 | First session cost toast, then at each doubling |
| Single turn cost warning (USD) | 2 | Toast when one turn costs at least this |
| Limit warning (%) | 80 | Toast when a limit reaches this (and 95%) |

## What it can reach

Validated on Claude Code 2.1.296:

    ❯ ./register.tsx hooks: session.start, session.measure, prompt.submit, turn.complete, ui.render{component=AbovePrompt}
    ❯ ./register.tsx gating hook without .catch: prompt.submit
    ❯ ./register.tsx calls: $.clock.every, $.clock.now (via tick, warn), $.session.usage (via currentCost, measure), $.state.get, $.state.set, $.ui.resolve, $.ui.status, $.ui.toast
    ❯ ./register.tsx state writes: usage-bar.figures, usage-bar.now, usage-bar.turnStartCost, usage-bar.warned

Threat model:

1. **Reads:** the session's usage figures Claude Code already holds (the 5-hour and weekly windows' percentages and reset times, the session's cost total) and the clock. It never reads prompt text, answers, tool calls or files.
2. **Runs:** nothing. No model calls, no processes, no tools.
3. **Sends:** nothing leaves the machine. No network access, no credentials touched.
4. **Persists:** only session state held by Claude Code (the last figures, the clock reading, which warnings were shown, the cost at the start of the current turn). Nothing is written to disk or to the cross-session store.
5. **Hostile input:** none is parsed. `prompt.submit` only records the session's cost and passes the prompt on untouched; if any hook throws, Claude Code skips it and the prompt goes through. The one `$.ui.status` call clears a status line left by an early version of this mod.

## Limits

- **No Fable limit.** Claude Code passes mods only the 5-hour and weekly windows. The separate Fable weekly limit is shown by `/usage`, which fetches it from Anthropic with your login token; this mod deliberately does not touch credentials, so it cannot show that limit.
- Percentages arrive with API responses, so after a long idle stretch the card shows the last reading until the next reply. Countdowns keep ticking in between.
- The session cost is Claude Code's own estimate at list prices. On a subscription it does not map to how much of your limits a session uses.
- Turn cost is the change in the session total between sending a prompt and the turn completing, so background work finishing in the same stretch is counted too.

## Local development

From a local checkout, load it for one session:

    claude --plugin-dir .

To keep it installed, use the [marketplace commands](#install). To ship a change, bump `version` in `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`, push, then run `claude plugin update usage-bar` and `/reload-plugins`.

## Tests and typecheck

Run from the repository root:

```sh
claude plugin validate .
claude plugin test .
```

The [13 tests](tests/usage-bar.test.tsx) use a mock clock and engine. They cover:

- **Formatting:** countdowns in minutes, hours and days; bar fill and the 50% / 80% color steps; card wording; the expensive session marker.
- **Board:** both cards and the session line on the terminal and desktop surfaces, no Fable card, side by side versus stacked layout, bar and line colors, the waiting state before the first reply, stepping aside for a survey.
- **Warnings:** cost steps, limit levels, each toast shown once, thresholds read from the plugin settings.
- **Clock:** the countdown ticking every minute after the session starts.

The render tests check the element tree, not terminal or desktop pixels.

### Typecheck

Load this checkout once with `claude --plugin-dir .` so Claude Code lays its declarations and a `tsconfig.json` beside the plugin. Then, from the repository root:

```sh
npx -p typescript tsc -p .
```

Generated declarations live in `.claude-plugin/types/`. Keep them untracked.

## License

MIT
