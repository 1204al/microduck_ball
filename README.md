# 🦆 Microduck Ball

You are a Microduck (the little open-source robot duck) on roller skates. Everything smaller than about half your size that you break sticks straight onto the robot: its head, body and legs. Get going fast enough, forwards or backwards (or hit turbo), and the duck curls up and tumbles head over heels, stuff and all; slow down until you've almost stopped and it pops back up onto its skates with a hop and glides on. Rival ducks do the same. Start at 10 cm among screws and LEGO bricks, end at tens of metres rolling up houses. Then roll up the giant duck.

Original rolling-and-growing game in the spirit of the genre, built with plain JavaScript and Three.js r128. Duck model, animation and synth sounds come from [Microduck Fight](https://github.com/1204al/microduck_fight_game).

## Run it

```bash
python3 -m http.server 8790
```

Then open http://localhost:8790. No build step.

## Controls

| Input | Action |
| --- | --- |
| W / S, arrows | Roll forward / back |
| A / D | Steer (the camera follows) |
| Mouse wheel | Zoom the camera |
| Shift or L (hold) | Turbo: 1.5× speed while the meter lasts (~4 s, refills in ~7 s; AA batteries top it up) |
| P / Esc | Pause |
| M / N | Mute / music |
| Gamepad | Left stick, A / RB turbo, Start pause |
| Touch | Left stick, TURBO button (hold) |

## How a round works

- You start at **12 kg** (radius `0.8·∛(m/12)`); part of last round's mass carries over (`12·(m/12)^0.45`).
- There is no clock: a round lasts until you topple the giant duck or end it from the pause menu (P / Esc), against **11 rival duck balls**. Rivals can't topple the giant duck; each one goes home after 2–9 minutes and someone new rolls in, so they don't outgrow everything. A surprise event (magnet storm, golden rain, duck parade) hits every few minutes.
- You break anything whose **gate** you outweigh (mass ≥ 98% of the gate). Everything on the map is tech, AI or a robot, plus a few duck toys. Eight tiers:

  | Gate | What |
  | --- | --- |
  | 12 kg | batteries (AA, 9V), wall sockets, plugs, chargers, smart bulbs, AirPods cases, Xbox and DualSense controllers, classic, arcade and flight joysticks, Nintendo Switch, Steam Deck, Game Boy, remotes, mice, smartwatches, phones, Meta Quest 3, AI chips, Raspberry Pi 5, Arduino Uno, Jetson Orin Nano, Mac mini, DGX Spark, Echo Dots, rubber ducks, microduck heads; little microducks waddle about and DJI drones fly in loops |
  | 30 kg | power strips, mechanical keyboards and network switches (the yard fences), monitors, Wi-Fi routers, Echo speakers, security cameras, PlayStation 5, Xbox Series X, Reachy Mini |
  | 150 kg | RTX graphics cards, gaming PCs, 3D printers (printing a rubber duck), robot vacuums, Unitree Go2, Sony aibo, boxed microducks |
  | 300 kg | humanoid robots: Tesla Optimus, Figure 02, Atlas, Unitree H1, Unitree G1, Agility Digit, and Pepper |
  | 600 kg | Spot, industrial robot arms, Starship delivery robots |
  | 1 500 kg | DGX Station towers and DGX H100 servers with gold metal-foam fronts |
  | 4 000 kg | DGX SuperPOD racks, server racks |
  | 12 000 kg | the giant duck in the middle |

  Two worlds: **Robot Lab** (day) and **Night Lab** (dark floor, glowing screens and LEDs). The robots just stand there.
  The gadgets and robots are low-poly models of real products and use their real names; there are no logos. All names and trademarks belong to their owners, and this fan project is not affiliated with any of them.
- What you pick up sticks onto the robot on the side it touched (never over its face or on its skates): flat things lie on the surface, tall things lie along it. Things keep their real size, so as the duck grows, the old stuff gets small and falls off.
- You gain the most from things you can only just break; tiny things barely count once you're big. Breaking near your limit costs speed. Broken things grow back in 10–30 s and throw chunks anyone can pick up.
- Crashing into something you can't break above 5 u/s costs up to 10% of your mass.
- Ducks bump each other: a fast ram takes mass from the victim; losing 78% (or being crushed by a duck 3.2× heavier) bursts you — you come back with 40% after 2.6 s and 3 s of shield, the attacker takes the rest. Bots follow the same rules.
- Toppling the giant duck (12 t) ends the round with a finale and resets your carry-over to 12 kg.
- The map is a circle of radius ~204 with four straight roads and two ring roads; ~4 300 props laid out in rings (rows of small things, yards with fences, houses at r = 64, three towers).

## Economy

Currency: **screws**. A new save starts with 150.

**Payout per run**

| Source | Screws |
| --- | --- |
| Place in the round | #1 120 · #2 80 · #3 55 · #4 30 |
| Duck weight | `1.2·√(kg − 12)` + `(kg − 12 000)/100` |
| New tiers reached | 5 … 100 each |
| Golden microduck heads | 40 each |
| Boss | 1,500 the first time each shift, 300 after that |
| Stars (150 kg / 1 500 kg / topple the giant duck), first time per world | 200 / 400 / 800 |
| New record | 100 |
| Multiplier | Screw sorter upgrade, Payday shift |

**Sinks**

- **Upgrades** (permanent, cost ×1.7 per level): Bigger battery (+15% turbo), Faster servos (+5% speed), Sticky beak (+2% grab size), Starter chassis (+10% start size), Screw sorter (+10% payout). All of them cost about 24k in total.
- **Boosts** (one run, used automatically on the next run): Espresso (+25% speed), Spare battery (turbo refills twice as fast), Hot glue (grab bigger things), Lucky screw (3× golden ducks). 100–180 each.
- **Cosmetics**: 7 colorways, 7 hats, 6 shell finishes, 6 trails. 200–6,000 each.
- **Parts Bin deal**: one cosmetic at 40% off, changing every 10 minutes.

**Daily crate**: a 7-day streak (200 screws, item, 500, item, 1,000, item, then an exclusive Rainbow trail + 2,000). Items are random cosmetics, cheaper ones more likely; a duplicate turns into 400 screws. Missing a day restarts the streak.

**After a run** the results card suggests the cheapest upgrade you can afford (with a Buy button) or how many screws you still need.

**Run extras**: beginner's luck (first run grows 2× for 45 s), one surprise event mid-run (Magnet storm, Golden rain or Duck parade), unlock lines when a new kind of thing becomes grabbable, and shout words on big grabs.

**Live-ops loops**

- **Shifts**: a new shift every 20 minutes, with a modifier (Butter floors, Golden hour, Rush hour, Overtime (turbo lasts 50% longer), Payday, or a regular shift) and a fresh boss bonus.
- **Duck League**: a leaderboard of CPU rival ducks plus your best run.
- **Invite**: copies the link and gives 1,000 screws, once.

Expected pace (bot in `tools/sim.js`, `simRound(270)`): an efficient player reaches ~1 t in 45 s and can topple the giant duck around 2 minutes in; bots on their own reach around 4–12 t in 4–5 minutes, then go home and are replaced.

Everything is saved in `localStorage`. There is no server, so the league and the invite reward are local.

## Rendering notes

- Every prop type is one `InstancedMesh` for the whole map; each frame only the instances near the camera and not behind it are packed into its buffer (about 45 draw calls for ~4,300 props).
- Props that would block the view between the camera and the duck are hidden while they do (with hysteresis, so props on the edge don't blink).
- Props the camera ends up inside are hidden too (the near plane would cut them open). The instance lists are rebuilt when the camera moves 4 units, turns 0.15 rad or every 0.25 s, so nothing pops in at the edge of the view on a fast turn.
- Every prop casts and receives shadows, so small things sit on the floor and props darken in the shadow of bigger ones.
- Shell finishes are mapped triplanar onto the duck's parts, so they don't depend on the parts' UVs. Particles are capped in screen size so one next to the camera isn't a giant blurry disc.
- When a prop is merged, any part that shares a face plane with a differently coloured part (a screen flush with its case) is grown out of it by 0.6% of the prop's size, so the two faces never z-fight.
- The depth range is tight (near plane follows the camera, far plane stops just past the fog), the floor is pushed back with polygon offset so flat props never z-fight it, and the sun's shadow box grows in steps and snaps to shadow-map texels so shadows don't shimmer.
- Floor grid, checker and road edges fade/anti-alias by screen-space derivatives to stop distant moiré.
- The pixel ratio adapts to the frame time (0.7 to 2×, starting at 1.5×). The giant duck is baked into one mesh.

## Model viewer

`tools/viewer.html?keys=duck:graphite,ps5,reachy` shows the player duck (`duck:<colorway>`, add `:open` for an open beak) and any prop keys side by side; `keys=all` shows every prop. Options: `yaw`, `pitch`, `cols`, `lo=1` (the low-poly versions).

## Recording a video

`tools/record.js` records a landscape (1920×1080, 30 fps) showcase: a bot plays a round from 12 kg to toppling the giant duck, frame by frame, driving calmly with a camera that turns slower than the game's, with a video HUD (mass counter, tier pips, what the duck can eat now and what it just ate, a LEVEL UP banner at every switch). The quiet stretches between tiers are skipped, and sound is rendered offline in step with the frames.

1. Start `python3 tools/record_server.py` (port 8792; it saves frames and sound to `video/raw`) and open http://localhost:8792.
2. In the console: load `tools/record.js` with a `<script>` tag and call `REC.run()`; `REC.status` turns `done` after about a minute.
3. `tools/make_video.sh` writes `video/microduck-ball.mp4` (needs ffmpeg).

## Files

- `js/props.js`: about 90 prop types. Each is merged into one vertex-coloured mesh.
- `js/world.js`: renderer, the two themes, a ground shader that adapts to scale, landmarks, prop streaming, walkers, particles.
- `js/ball.js`: the player duck: skating and tumbling, sticking things on, shell finishes and trails.
- `js/save.js`: economy, shifts, deals, payout.
- `js/ui.js`: menus, shop sheets, HUD, input.
- `js/main.js`: game flow, camera, frame loop.
- `js/duck-model.js`, `js/duck-anim.js`, `js/audio.js`, `js/music.js`: from Microduck Fight.
- `tools/record.js`, `tools/record_server.py`, `tools/make_video.sh`: the video recorder (see above).
- `tools/sim.js`: headless balance test and bot. Load it in the console and call `sim('w', {time: 120}, 120)`. `MD.Debug` steps the live game by hand (`MD.Debug.manual = true; MD.Debug.step(1/30, 300)`), and `snap()` copies the canvas into the page so background-tab screenshots show the latest frame.
