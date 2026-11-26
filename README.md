# Yahtzee Master

**Five dice. Every possibility.**

A Thanksgiving side project built with **OpenAI Codex**: bring a Yahtzee game and a full-game strategy advisor to the family table, then explore how a little probability changes the next move.

**[Play on GitHub Pages](https://vict0rhu.github.io/yahtzee-master/)** · [MIT license](LICENSE)

The Pages link becomes available after the repository's first successful deployment.

## Play your way

- **Play online:** roll fair dice, choose holds, score a turn, and undo a move. Progress is saved on your device.
- **At the table:** enter your real dice, compare hold and scoring recommendations, and keep a scorecard. Held dice stay locked when you enter a reroll.
- **Watch the computer:** choose Optimal, Greedy, Rule of thumb, or Random and let it complete a turn.

No account, backend, analytics, model API, or runtime dependencies. The strategy calculation runs locally in a Web Worker; no AI service is needed to play.

## What the advisor optimizes

The goal is the highest **expected final score**, assuming fair independent dice and optimal play after the chosen action. It does not maximize the probability of beating a particular opponent or guarantee a win.

The solver tracks filled categories, the upper subtotal capped at 63, and whether the Yahtzee box has 50 points. It uses backward induction over scorecard states and remaining rerolls:

- **Score now:** immediate points and newly earned bonuses, plus the next scorecard's future value.
- **Reroll:** the probability-weighted best value of every possible outcome.

The C++ generator combines equivalent dice permutations into **252 full-roll multisets** within a lattice of **462 partial multisets**. It enumerates outcomes rather than using Monte Carlo. “Exact” refers to the finite-state model and complete enumeration; Float64 arithmetic still introduces numerical rounding.

The generated table contains 1,048,576 Float64 entries (8 MiB), with 591,232 nonterminal states evaluated. The empty-scorecard expectation is **254.587728734496** under the rules below. JavaScript independently evaluates current-turn actions against that table.

## Rules

The ruleset is `hasbro-forced-joker-v1`:

- Five dice, up to three rolls per turn, and 13 categories.
- The upper bonus awards 35 points once the upper subtotal reaches at least 63.
- An ordinary full house requires a triple and a different pair.
- A subsequent Yahtzee follows the forced Joker order after the Yahtzee box is filled, whether it holds zero or 50: matching upper category first, then an open lower category, then zero in another upper category.
- Each subsequent Yahtzee earns an extra 100 points only if the Yahtzee box holds 50.

Rule references: [Hasbro instructions](https://instructions.hasbro.com/en-us/instruction/yahtzee) and [extra Yahtzee / Joker clarification](https://hasbro-new.custhelp.com/app/answers/detail/a_id/211/related/1).

## Computer players

| Player | Decision rule |
| --- | --- |
| Optimal | Maximize expected remaining-game score. |
| Greedy | Maximize this turn's expected reward, including bonuses earned now, without future-category opportunity cost. Global expectation may break ties. |
| Rule of thumb | Keep selected completed combinations; otherwise prefer repeated values or a four-card straight, then score by immediate reward. |
| Random | Hold each die with probability 1/2; score if all are held, otherwise reroll. On the last roll, choose a random legal category. |

The displayed expected finish assumes **optimal continuation after the displayed action**, even for the other players. It does not forecast the final mean if that other strategy is used for the rest of the game.

## Verification and provenance

The application, solver, and value table were created for this project with Codex. The table is generated from `solver/solve.cpp`; no third-party application source or precomputed strategy data is bundled. The app uses system fonts and project-owned CSS and SVG assets. GitHub Actions provide external build and deployment infrastructure.

The 20 Node tests cover independent scoring over all 7,776 ordered rolls, Joker cases, analytic endgames, an ordered-roll oracle, native/JavaScript Bellman consistency, legal full-game smoke tests, and controller interactions. The build verifies the table's SHA-256 and size. Interactive dice use rejection sampling with `crypto.getRandomValues`.

These checks are reproducible evidence, not a formal proof or a source-uniqueness certification. A rounded expected value alone is not a correctness test.

Released under the [MIT license](LICENSE). This is an independent project, unaffiliated with Hasbro. Product names and trademarks belong to their respective owners.

## Publish on GitHub Pages

Create an empty GitHub repository named `yahtzee-master`, push the `main` branch, and select **Settings → Pages → Source → GitHub Actions**. The included workflow tests, builds, and deploys the website. Asset URLs are relative, so project hosting at `/yahtzee-master/` needs no base-path change.

## Build and run locally

Use Node.js 20 or newer. No packages need to be installed.

```sh
npm test
npm run build
npm run dev
```

Open the local URL printed by the server. Use HTTP hosting rather than opening `web/index.html` directly as a file.

To regenerate the value table, install a C++17 compiler and run:

```sh
npm run solve
npm test
```

The manifest records the table's SHA-256, indexing, size, and ruleset. Terminal scorecards have zero future value; unused dense slots do not represent legal positions.
