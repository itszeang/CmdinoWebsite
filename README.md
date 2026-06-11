# CMDino — Landing Site

Scroll-driven storytelling landing page for **CMDino**, the multi-agent AI
terminal cockpit (Claude · Codex · Gemini · Ollama — working together,
not separately).

Pure **HTML + CSS + JS**. No frameworks, no build step, no dependencies.

## The story

A tiny pixel dino — the task — travels through an empty world that builds
itself as you scroll:

1. **Hero** — "The AI Terminal That Thinks In Teams."
2. **The Prompt** — the dino walks into a giant terminal: the task enters CMDino
3. **Human Input** — scroll-driven typing of the prompt
4. **Claude Planner** — the Architect produces `PLAN.md`
5. **Pipeline Reveal** — one terminal splits into four specialists
6. **Orchestration** — output of one agent becomes input of the next, live
7. **Needs Attention** — a failure surfaces, one click resolves it
8. **Context Library** — the dino collects floating files into the dock
9. **Memory** — a cave with `PLAN.md` / `MEMORY.md` on the walls
10. **Output Library** — light burst → Website / App / API / Dashboard cards
11. **Product Reveal** — the finished product, full screen
12. **Workspace** — camera zooms out to the full operations center
13. **Final CTA** — "Stop managing AI tools. Start directing AI teams."

## Design system

The visual language follows the CMDino **Mission Control** design
(Superdesign): neutral black surfaces (`#0e0e0e` / `#161616` / `#1e1e1e`),
`#292929` hairline borders, JetBrains Mono uppercase micro-labels, amber
`#f59e0b` as the single action color, and per-agent accent bars —
Claude amber, Codex green, Gemini violet, Ollama sky.

Earlier explorations are kept in `legacy/` (`macos.html`, `windows.html`
— the navy/glass theme with macOS / Windows 11 window chrome).

## Run it

Any static server works:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Or just open `index.html` in a browser.

## How it works

- Each chapter is a tall section with a `position: sticky` viewport.
- `js/main.js` computes per-section scroll progress, exposes it as the CSS
  custom property `--p`, and toggles `[data-at]` elements past thresholds.
- The dino is a fixed sprite-sheet animator (24×24 frames, idle / walk /
  run / hurt) choreographed per scene — it only walks while you scroll.
- Honors `prefers-reduced-motion`.

## Credits

Dino sprites by [Arks](https://arks.itch.io/dino-characters); story concept
inspired by [Dino Family by DemChing](https://demching.itch.io/dino-family).
See `assets/ATTRIBUTION.md`.
