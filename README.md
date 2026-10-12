# usage-bar

A Claude Code mod that puts a small board above the prompt showing how much of your plan limits you have used and when they reset, and warns you when a session gets expensive.

```
╭────────────────────────────╮ ╭────────────────────────────╮
│ Session limit (5h)         │ │ Weekly limit (7 days)      │
│ █░░░░░░░░░░░░░ 6% used     │ │ █████░░░░░░░░░ 35% used    │
│ resets in 2h 14m           │ │ resets in 1d 8h            │
╰────────────────────────────╯ ╰────────────────────────────╯
 This session: $1.24 spent (API-price equivalent)
```

## Install

Type this at the prompt of a Claude Code terminal session:

```
/plugin install usage-bar --marketplace denys-nabatov/claude-usage-bar
```

Answer `y` to add the marketplace, then pick the **user** scope (Enter). The board appears above the prompt from then on, in every session.

## What it shows

- **Session limit (5h)** - share of your rolling 5-hour plan allowance used, and when that window resets.
- **Weekly limit (7 days)** - share of your 7-day allowance across all models, and when it resets.
- **This session** - what this session would cost at API prices (the same figure as `/cost`). On a subscription you are not billed this amount; it is a measure of how heavy the session is.

Bars are green below 50%, yellow from 50% and red from 80%. The limit figures appear after the first reply of a session (Claude Code only learns them from an API response). On terminals narrower than 61 columns the cards stack. The board steps aside while a Claude Code survey uses that space, and can be collapsed with the `[-]` mark.

Requires a Claude subscription login (Pro, Max, Team or Enterprise); with an API key there are no plan limits to show.

## Warnings

A toast appears when:

- this session's cost passes $5, and again at $10, $20, $40 and so on;
- a single prompt-to-answer turn costs $2 or more;
- the 5-hour or weekly limit reaches 80%, and again at 95% (once per window).

All three thresholds can be changed in `/config` under the plugin's settings.

## Updating

```
claude plugin update usage-bar
```

then `/reload-plugins` in a running session.

## Development

`claude plugin validate .` checks the manifest and hooks module, `claude plugin test .` runs the tests in `tests/`.

## License

MIT
