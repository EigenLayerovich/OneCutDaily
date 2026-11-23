# one/cut

**A daily game for Reddit: one shape, one straight cut, no do-overs.**

Every day at midnight UTC, a new paper shape is posted. Drag a single line across it to split it exactly 50/50, or cut off exactly ⅓ or ¼ on some days. The server measures the two pieces to a tenth of a percent. After you commit, the pieces slide apart and you see every other Redditor's cut layered on the mat as string art.

Built on Devvit Web (React + Hono) for Reddit's Game of the Day hackathon.

## Why it works as a daily game

- **Two-second onboarding.** An animated hint line shows the gesture. There's no tutorial screen; the helper text changes as you draw ("drag across the shape", then "drag the red ends to fine-tune").
- **Pure skill, instantly legible.** Your score is how far off you were, e.g. *off by 0.4*. Anyone can understand it, and nobody gets it perfect every day.
- **Collective payoff.** The crowd reveal (every cut drawn as a faint line), the error histogram, "sharper than 87% of 1,204 cutters" and a daily top-10 turn a solo puzzle into a shared one.
- **Weekly rhythm.** The difficulty is calibrated by weekday:

  | Mon | Tue | Wed | Thu | Fri | Sat | Sun |
  | --- | --- | --- | --- | --- | --- | --- |
  | smooth pebble, ½ | lumpy, ½ | lobed, ⅓ | shape with a hole, ½ | two islands, ½ | wild, ⅓ | Sunday Special, ½ |

- **Reddit-native.**
  - The daily post is created automatically, with a pinned discussion prompt.
  - "Comment my result" posts a spoiler-free result card as *you*.
  - Streaks are tracked.
  - A long-run rank (Butter Knife → Bread Knife → Chef's Knife → Scalpel → Laser) can be worn as subreddit flair.
  - Players can **draw their own shapes**, and each one becomes its own playable post.
- **Replayable.** After the daily cut there's an endless practice mode, plus an archive (old posts stay playable).
- **Works logged out.** Logged-out players can cut and see the crowd. The login prompt only appears when they'd want to save a streak.
- **Accessible.** Keyboard play (arrows move the line, `[` `]` rotate it, Enter cuts), screen-reader labels, reduced-motion support, high-contrast palette, and sound with a mute button that stops when the tab is hidden.

## How it's built

```
src/shared/geometry.ts   exact polygon splitting (half-plane clipping), works with holes and concave shapes
src/shared/puzzle.ts     seeded shape generator (superformula + harmonics), weekly calendar, scoring tiers
src/server/core/game.ts  game rules over a tiny KV interface: one cut per player, crowd sampling, streaks, boards
src/server/core/posts.ts daily post creation, player-made shape posts
src/server/routes/*      Devvit endpoints: /api/*, scheduler, triggers, mod menu
src/client/splash.tsx    inline feed card (tap-only, renders instantly from postData)
src/client/game.tsx      expanded game: draw → cut → result / crowd / top cuts → practice
src/client/forge.tsx     shape maker (freehand loop → simplified polygon → new post)
dev/                     local harness: in-memory Redis + 600 simulated players
```

- Scoring runs on the server. The client only sends the line; the server re-measures it against the puzzle.
- Each player gets one saved cut per puzzle (`HSETNX`).
- The crowd overlay uses a 400-slot rolling sample, so it stays cheap at any player count.

## Run it locally (no Reddit account needed)

```bash
npm install
npm run local
```

Open http://localhost:5199/splash.html. Use URL parameters to switch the simulated context:
`game.html?user=alice`, `game.html?anon=1`, `game.html?day=4` (Hole-y Thursday), `forge.html`.

Checks: `npm run test:types`, `npm run lint`, `npm run test:unit`, `npm run build`.

## Put it on Reddit

1. Make a Reddit account for testing if you want, and a small private subreddit (for example `r/onecut_dev`). You must be a moderator of it.
2. `npm run login`. This opens the browser for Reddit auth.
3. The app name in `devvit.json` (`one-cut-daily`) must be globally unique. If upload says it's taken, change it (3-20 lowercase chars).
4. `npx devvit playtest r/onecut_dev`. This installs a live dev build. Installing creates today's post automatically. Mods also get a subreddit menu item, "One Cut: post today's puzzle".
5. `npm run deploy`. This uploads a version (type-check + lint + `devvit upload`).

**Do not run `devvit publish` during the hackathon.** The rules ask for uploaded, playtested apps, not published ones.

Note: while the app is unapproved, "Comment my result" and player-made shape posts are attributed to the app account for everyone except you (Reddit's rule for user actions in playtest).
