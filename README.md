# Carom

A browser paddle duel about angles, spin, and bank shots. Move as you strike to curve the ball, and use the two gold obstacles to send a rally somewhere unexpected. Play against the computer or share a keyboard with a friend. First to 11 wins, with a two-point lead required.

## Run

Install with `npm ci`, then run `npm run dev` and open the local URL printed by Vite. Produce the static site with `npm run build`; serve the resulting `dist/` directory from any static server. `npm run preview` previews the production build locally.

Everything is drawn and synthesized in code. The game uses the supplied Simple 2D engine and makes no runtime requests for assets or services.

## Controls

- Solo: W/S or Up/Down moves your paddle.
- Versus: player one uses W/S; player two uses Up/Down.
- Menus: either movement pair selects; Enter or Space confirms. Mouse and touch work on menu items.
- P or Escape pauses and resumes. Escape returns from instructions and the results screen.
- M toggles sound. Backtick toggles the engine diagnostics.
- On touch devices, use the engine's vertical paddle sliders.

## Verification

`npm run typecheck`, `npm run lint`, `npm run format`, and `npm test` check TypeScript, ESLint, Prettier, and the simulation tests with coverage. Tests run the engine on an in-process canvas with a counted clock. The debug API returned by `game.initialize` supports immutable scenario poses and snapshots through `engine.apply` and `engine.state`.

Player-facing screenshots and a recorded rally are in `showcase/`.
