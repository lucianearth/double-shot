# trading-console — user stories

The stories come FIRST. Frames exist to serve them; the lint fails any story no frame
serves ("the experience is missing a piece") and warns on any frame no story motivates.
These are UX stories — beats of the experience, walkable on a frame with a thumb — not
correctness cases (the build pipeline owns those).

## Arrival
- **S1** — As an operator, I want one glance at the home screen to tell me whether the bot is healthy and making money, so I don't dig through logs every morning.
- **S2** — As a first-time user, I want an empty home screen to tell me exactly what to connect first, so setup is obvious without docs.

## The core loop
- **S3** — As an operator, I want open positions with live P&L in one list, so I always know my current exposure.
- **S4** — As an operator, I want to drill into one position's fills and history, so I can audit an odd trade.
- **S9** — As an operator, I want to pause a single strategy without touching the others, so containment doesn't require a full stop.

## Find & navigate
- **S5** — As an operator, I want to search any symbol, order, or log line from the home screen, so I can chase a hunch in seconds.
- **S10** — As an operator, I want bottom navigation to the core areas, so nothing is more than one tap away.

## The worst moment
- **S6** — As an operator paged at 3am, I want alerts ranked by severity with the newest first, so one tap gets me to the problem.
- **S7** — As an operator, I want a kill switch that flattens everything (with confirmation), so a runaway strategy can be stopped from my phone.

## Moments of trust
- **S8** — As an operator, I want stale or disconnected data marked loudly on every screen, so I never act on dead numbers.
- **S11** — As an operator, I want empty states to say WHY they're empty (no trades today vs. feed down), so silence is informative.
- **S12** — As an operator, I want a last-refreshed stamp on data screens, so I know how old what I'm seeing is.

## Out of scope this pass
Settings (nav slot reserved), multi-account, backtesting. Listed so their absence is a
decision, not an oversight.
