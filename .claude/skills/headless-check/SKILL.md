---
name: headless-check
description: How to drive the app in headless Chromium (Playwright) to check something that isn't the effects or the animations, including two players in two browser contexts. Read before writing or running any Playwright script against the app.
---

# Driving the app in headless Chromium

Only when really necessary: several sessions share this machine, and every headless browser slows all of them. Tests, `npm run check` and the code come first; go headless for what they can't settle, keep it to the few pages and the one size the question needs, run it once, and close every browser and server it started.

To check something that isn't the effects or the animations:

- Hide WebGL before the page loads (`context.addInitScript(() => { delete window.WebGL2RenderingContext; delete window.WebGLRenderingContext; })`, which keeps `src/lib/fx/` off) and pass `reducedMotion: 'reduce'` to the context. The effects render in software there and make every step crawl.
- With two players in two contexts, `bringToFront()` the page you read from (a window behind gets no animation frames, and its timers run about once a second, a host's pointer batches too).
- Poll until what you read settles rather than waiting a fixed time.
- Retry a join that says it couldn't reach the room (PeerJS signalling fails now and then from the cloud container).

Which Chromium:

- Playwright's default `chromium.launch()` is the headless shell: drawn in software (SwiftShader) and every page in one process. Good for the quick checks above.
- For anything about frames, WebGL, the GPU or many pages at once, launch new headless instead: `chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })` (drop the ANGLE switch off Windows). It draws on the real GPU and gives each site a process of its own. The QA sweep (`scripts/sweep.mjs`) runs this way.

Before writing a script, see whether the QA desk already shows it: `npm run sweep -- --only <scene> --sizes <size>` runs the checks on one scene at one size, and the desk's Play from here drives a live room with bots and link faults (`docs/qa.md`).
