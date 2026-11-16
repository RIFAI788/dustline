# DUSTLINE — a three.js tactical FPS

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/RIFAI788/dustline/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/RIFAI788/dustline/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

Round-based tactical first-person shooter in the style Counter-Strike made
famous, built on three.js 0.187.0. Two teams fight over Dustline Yard, a
desert-industrial map with two bomb sites: Vanguard attacks, the Jackals
defend. First to 5 rounds takes the yard.

## How a round plays

- **Buy phase (15 s):** spend money on rifles, SMGs, a shotgun, a DMR,
  kevlar and frag grenades. Press `B` for the buy menu.
- **Live round (100 s):** plant the spike at A or B (hold `E` inside the
  site) or eliminate the Jackals. The spike explodes 35 s after the plant;
  a Jackal can defuse it in 5 s. Kills pay $300, round wins $3,250.
- **Bots:** four Vanguard teammates and five Jackals. They patrol lanes,
  hold sites, investigate gunfire, strafe and burst-fire when they see you,
  plant the spike if you fall with it, and converge to defuse one you plant.

## Controls

| Key | Action |
| --- | --- |
| WASD / Shift | Move / walk (slower, steadier aim) |
| Mouse | Look (pointer lock) |
| Click / Right-click | Fire / scope (DMR) |
| R / Q | Reload / switch weapon |
| G | Throw frag grenade |
| E (hold) | Plant the spike |
| B | Buy menu (buy phase) |
| Ctrl / Space | Crouch / jump |

## Run it

```sh
node serve.ts        # serves game/ at http://localhost:8080
```

Open the page in desktop Chrome. No build step, no network requests:
everything (three.js included) is served from `game/`.

## Layout

- `game/index.html` — page, HUD and overlays
- `game/src/` — one module per job: `world` (map), `mover` (movement and
  collision), `weapons`, `bots` (AI), `bomb` (spike), `grenades`,
  `effects` (tracers), `audio` (synthesised SFX), `hud`, `minimap`,
  `economy`, `match` (rounds), `main` (boot and the fixed-step loop)
- `game/vendor/three/` — three.js 0.187.0, byte for byte from the kit
- `screenshots/` — real renders of the game (`?shot=start|play|buy|end`)
- `main.ts` — the entry program: copies `game/` and `screenshots/` to
  `/output` and writes `dossier.json`

MIT licensed. Built for the make.fun "Make the best three.js tactical FPS"
bounty.
