/* ════════════════════════════════════════════
   CMDino — scroll-driven story engine
   Vanilla JS. No dependencies.
   ════════════════════════════════════════════ */
(() => {
  "use strict";

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ramp = (p, s, e) => clamp((p - s) / (e - s), 0, 1);
  /* vertical jump arc: t in [0,1] → height offset in vh */
  const hop = (t, h) => Math.sin(Math.PI * clamp(t, 0, 1)) * h;
  const mid = (t) => t > 0 && t < 1;

  /* piecewise-linear path: pts = [[t, x], …] sorted by t */
  const path = (p, pts) => {
    if (p <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (p <= pts[i][0]) {
        const [t0, x0] = pts[i - 1], [t1, x1] = pts[i];
        return lerp(x0, x1, (p - t0) / (t1 - t0));
      }
    }
    return pts[pts.length - 1][1];
  };

  /* ── sprite sheet animator (Arks / DemChing Dino Family, 24×24 frames) ── */
  const ANIMS = {
    /* Arks base sheet (24-frame strip) */
    idle:      { start: 0,  frames: 4, fps: 7 },
    walk:      { start: 4,  frames: 6, fps: 10 },
    kick:      { start: 10, frames: 3, fps: 10 },
    hurt:      { start: 13, frames: 4, fps: 8 },
    run:       { start: 17, frames: 7, fps: 14 },
    /* DemChing Dino Family extras (one strip per animation) */
    eggMove:   { start: 0, frames: 4, fps: 6,  sheet: "assets/anim/egg-move.png" },
    crack:     { start: 0, frames: 4, fps: 5,  sheet: "assets/anim/egg-crack.png", once: true },
    hatch:     { start: 0, frames: 4, fps: 5,  sheet: "assets/anim/egg-hatch.png", once: true },
    jump:      { start: 0, frames: 4, fps: 10, sheet: "assets/anim/jump.png", once: true },
    bite:      { start: 0, frames: 3, fps: 9,  sheet: "assets/anim/bite.png" },
    dead:      { start: 0, frames: 5, fps: 7,  sheet: "assets/anim/dead.png", once: true },
    scan:      { start: 0, frames: 6, fps: 7,  sheet: "assets/anim/scan.png" },
    avoid:     { start: 0, frames: 3, fps: 9,  sheet: "assets/anim/avoid.png" },
    ghostIdle: { start: 0, frames: 3, fps: 6,  sheet: "assets/anim/ghost-idle.png" },
    ghostMove: { start: 0, frames: 4, fps: 8,  sheet: "assets/anim/ghost-move.png" },
  };

  class Sprite {
    constructor(el, defaultSheet) { 
      this.el = el; 
      this.defaultSheet = defaultSheet || "";
      this.anim = "idle"; 
      this.clock = 0; 
    }
    set(name) {
      if (this.anim !== name && ANIMS[name]) { 
        this.anim = name; 
        this.clock = 0; 
        /* swap sheet if the animation requires a special one */
        const sheet = ANIMS[name].sheet;
        if (sheet) {
          this.el.style.backgroundImage = `url("${sheet}")`;
        } else if (this.defaultSheet) {
          this.el.style.backgroundImage = `url("${this.defaultSheet}")`;
        }
      }
    }
    tick(dt) {
      const a = ANIMS[this.anim];
      this.clock += dt;
      const raw = Math.floor(this.clock * a.fps);
      /* one-shot animations hold their last frame (hatch, jump, dead…) */
      const frame = a.once ? Math.min(raw, a.frames - 1) : raw % a.frames;
      this.el.style.backgroundPosition = `${-(a.start + frame) * 24}px 0`;
    }
  }

  /* ── DOM handles ── */
  const dinoEl = document.getElementById("dino");
  const dinoSpriteEl = document.getElementById("dinoSprite");
  const progressBar = document.getElementById("progressBar");
  const typedText = document.getElementById("typedText");
  const packet = document.getElementById("packet");
  const orchestra = document.getElementById("orchestra");
  const burst = document.getElementById("burst");
  const dockCount = document.getElementById("dockCount");
  const contextDock = document.getElementById("contextDock");

  /* get default sheet from CSS if possible, or fallback */
  const defaultDinoSheet = "assets/dino-tard.png";
  const dinoSprite = new Sprite(dinoSpriteEl, defaultDinoSheet);
  const miniSprites = [...document.querySelectorAll(".mini-dino")].map((el) => {
    const s = new Sprite(el, defaultDinoSheet);
    s.set(el.dataset.anim || "walk");
    return s;
  });

  /* starfield */
  const stars = document.getElementById("stars");
  for (let i = 0; i < 90; i++) {
    const s = document.createElement("i");
    s.style.left = Math.random() * 100 + "%";
    s.style.top = Math.random() * 100 + "%";
    s.style.setProperty("--td", (Math.random() * 4).toFixed(2) + "s");
    if (Math.random() < 0.25) s.style.width = s.style.height = "3px";
    stars.appendChild(s);
  }

  /* ── scene registry ── */
  const sceneEls = [...document.querySelectorAll("[data-scene]")];
  const scenes = sceneEls.map((el) => ({
    el,
    id: el.id,
    top: 0,
    range: 1,
    ats: [...el.querySelectorAll("[data-at]")].map((n) => ({ n, t: parseFloat(n.dataset.at) })),
  }));

  const measure = () => {
    for (const s of scenes) {
      s.top = s.el.offsetTop;
      s.range = Math.max(1, s.el.offsetHeight - innerHeight);
    }
  };

  /* ── dino state (set by scene choreography each frame) ── */
  const dino = { x: 68, y: 11, scale: 4, flip: false, op: 1, anim: "idle" };
  let prevX = dino.x;

  /* user scroll activity → dino only moves while the user scrolls */
  let lastScrollAt = -1e9;
  addEventListener("scroll", () => { lastScrollAt = performance.now(); }, { passive: true });

  /* ── per-scene choreography: fn(p) mutates `dino` ── */
  const TYPED = "Build a modern SaaS landing page\nfor a fintech startup.";

  const collectChips = [
    { el: document.getElementById("chip0"), t: 0.26 },
    { el: document.getElementById("chip1"), t: 0.42 },
    { el: document.getElementById("chip2"), t: 0.56 },
    { el: document.getElementById("chip3"), t: 0.7 },
  ];

  const choreo = {
    hero(p) {
      /* Egg rocks → shell cracks → dino hatches → walks into the story */
      dino.y = 11; dino.scale = 4; dino.op = 1;
      dino.x = p < 0.4 ? 68 : lerp(68, 112, ramp(p, 0.4, 1));
      if (p < 0.1) dino.anim = "eggMove";
      else if (p < 0.2) dino.anim = "crack";
      else if (p < 0.32) dino.anim = "hatch";
      else if (p < 0.4) dino.anim = "idle";
      else dino.anim = "walk";
    },
    prompt(p) {
      /* Enter scene, scan the terminal portal, then walk off */
      dino.x = path(p, [[0, -8], [0.42, 50], [0.8, 50], [1, 112]]);
      dino.y = 11;
      dino.scale = lerp(4, 2.8, ramp(p, 0, 0.42));
      dino.op = 1;
      dino.anim = p < 0.42 ? "run" : p < 0.8 ? "scan" : "walk";
    },
    input(p) {
      /* Walk across while text is being typed */
      dino.x = lerp(-8, 112, p);
      dino.y = 11; dino.scale = 2.8; dino.op = 1;
      dino.anim = p < 0.1 ? "idle" : "walk";
      if (typedText) {
        const n = Math.round(ramp(p, 0.14, 0.86) * TYPED.length);
        typedText.textContent = TYPED.slice(0, n);
      }
    },
    planner(p) {
      /* Run across the planning phase, victory hop when the plan lands */
      dino.x = lerp(-8, 112, p);
      const j = ramp(p, 0.82, 0.94);
      dino.y = 11 + hop(j, 5);
      dino.scale = 2.8; dino.op = 1;
      dino.anim = mid(j) ? "jump" : "run";
    },
    pipeline(p) {
      /* Run the relay, leaping over the specialist terminals */
      dino.x = lerp(-8, 112, p);
      const j1 = ramp(p, 0.24, 0.4), j2 = ramp(p, 0.56, 0.72);
      dino.y = 11 + hop(j1, 7) + hop(j2, 7);
      dino.scale = 3; dino.op = 1;
      dino.anim = mid(j1) || mid(j2) ? "jump" : "run";
    },
    orchestration(p) {
      /* Run the chain, dodging the packet as it shoots past */
      dino.x = path(p, [[0, -8], [0.15, 6], [0.42, 48], [0.56, 48], [0.85, 94], [1, 112]]);
      dino.y = 11; dino.scale = 2.6; dino.op = 1;
      dino.anim = p > 0.42 && p < 0.56 ? "avoid" : "run";
      /* packet + wires light up as the output travels down the chain */
      const t = ramp(p, 0.15, 0.85);
      if (orchestra && packet) {
        const w = orchestra.getBoundingClientRect().width;
        packet.style.left = (0.04 + t * 0.92) * w + "px";
        packet.classList.toggle("live", p > 0.12 && p < 0.92);
      }
      const w1 = document.getElementById("wire1");
      const w2 = document.getElementById("wire2");
      const w3 = document.getElementById("wire3");
      if (w1) w1.style.setProperty("--fill", ramp(p, 0.2, 0.36));
      if (w2) w2.style.setProperty("--fill", ramp(p, 0.42, 0.58));
      if (w3) w3.style.setProperty("--fill", ramp(p, 0.64, 0.8));
    },
    attention(p) {
      /* run in → take the hit → play dead while blocked → revived by the
         one-click approve → run off */
      dino.scale = 3.2; dino.op = 1;
      dino.y = 11 + hop(ramp(p, 0.58, 0.68), 6);
      if (p < 0.22) {
        dino.x = lerp(-8, 46, ramp(p, 0, 0.22));
        dino.anim = "run";
      } else if (p < 0.34) {
        dino.x = 46;
        dino.anim = "hurt";
      } else if (p < 0.58) {
        dino.x = 46;
        dino.anim = "dead";
      } else if (p < 0.68) {
        dino.x = 46;
        dino.anim = "jump";
      } else {
        dino.x = lerp(46, 112, ramp(p, 0.68, 1));
        dino.anim = "run";
      }
      /* red glow only while the failure is unresolved */
      const vignette = document.querySelector(".alert-vignette");
      const term = document.querySelector(".term-alertable");
      const btn = document.querySelector(".attn-btn");
      const alerting = p > 0.2 && p < 0.62;
      if (vignette) vignette.classList.toggle("calm", !alerting);
      if (term) term.classList.toggle("alerting", alerting);
      if (btn) btn.classList.toggle("pressed", p > 0.55 && p < 0.66);
    },
    context(p) {
      /* zig-zag between the floating files, kicking & biting them into the dock */
      dino.scale = 3.2; dino.op = 1; dino.y = 11;
      dino.x = path(p, [
        [0, -8], [0.24, 24], [0.4, 62], [0.54, 40], [0.68, 74], [0.8, 74], [1, 112],
      ]);
      dino.anim = p > 0.8 || p < 0.24 ? "run" : "walk";
      const grabs = [[0.26, "kick"], [0.42, "bite"], [0.56, "kick"], [0.7, "bite"]];
      for (const [t, a] of grabs) if (Math.abs(p - t) < 0.04) dino.anim = a;
      let n = 0;
      for (const c of collectChips) {
        const got = p >= c.t;
        if (got) n++;
        if (got && !c.el.classList.contains("collected")) {
          const dock = contextDock.getBoundingClientRect();
          const chip = c.el.getBoundingClientRect();
          const dx = dock.left + dock.width / 2 - (chip.left + chip.width / 2);
          const dy = dock.top + dock.height / 2 - (chip.top + chip.height / 2);
          c.el.style.setProperty("--dock-t", `translate(${dx}px, ${dy}px)`);
          c.el.classList.add("collected");
        } else if (!got) {
          c.el.classList.remove("collected");
        }
      }
      if (dockCount) dockCount.textContent = `${n} / 4`;
      if (contextDock) contextDock.classList.toggle("flash", n > 0 && n < 4 ? false : n === 4);
    },
    memory(p) {
      /* inside the memory cave the dino drifts through as a ghost of past runs */
      dino.x = lerp(-8, 112, p);
      const ghost = p > 0.08 && p < 0.92;
      dino.y = 11 + (ghost ? Math.sin(p * Math.PI * 4) * 1.2 : 0);
      dino.scale = 3; dino.op = 1;
      dino.anim = ghost ? "ghostMove" : "walk";
    },
    output(p) {
      /* celebrate the deliverable with a jump at the burst */
      dino.x = path(p, [[0, -8], [0.26, 50], [0.84, 50], [1, 112]]);
      const j = ramp(p, 0.3, 0.42);
      dino.y = 11 + hop(j, 8);
      dino.scale = 3; dino.op = 1;
      dino.anim = p < 0.26 ? "run" : mid(j) ? "jump" : p > 0.84 ? "run" : "idle";
      if (burst) {
        const b = ramp(p, 0.28, 0.5);
        const fade = 1 - ramp(p, 0.66, 0.9);
        burst.style.transform = `scale(${b * 1.6})`;
        burst.style.opacity = b * fade;
      }
    },
    product(p) {
      /* Dino stops to scan the finished product, then walks on */
      dino.x = path(p, [[0, -8], [0.35, 50], [0.65, 50], [1, 112]]);
      dino.y = 11; dino.scale = 3.5; dino.op = 1;
      dino.anim = p < 0.35 ? "walk" : p < 0.65 ? "scan" : "walk";
    },
    workspace(p) {
      /* Dino runs through the command center */
      dino.x = lerp(-8, 112, p);
      dino.y = 11; dino.scale = 3; dino.op = 1; dino.anim = "run";
    },
    final(p) {
      /* arrive, double victory jump, settle into idle */
      dino.x = path(p, [[0, -8], [0.4, 50], [1, 50]]);
      const j1 = ramp(p, 0.45, 0.58), j2 = ramp(p, 0.63, 0.76);
      dino.y = 11 + hop(j1, 7) + hop(j2, 7);
      dino.scale = 4.6; dino.op = 1;
      dino.anim = p < 0.38 ? "run" : mid(j1) || mid(j2) ? "jump" : "idle";
    },
  };

  /* ── master scroll/render loop ── */
  let lastTime = performance.now();

  const frame = (now) => {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    const y = scrollY;
    const docRange = document.documentElement.scrollHeight - innerHeight;
    progressBar.style.transform = `scaleX(${clamp(y / docRange, 0, 1)})`;

    /* per-scene progress + threshold reveals */
    let active = scenes[0];
    for (const s of scenes) {
      const p = clamp((y - s.top) / s.range, 0, 1);
      s.p = p;
      s.el.style.setProperty("--p", p.toFixed(4));
      for (const a of s.ats) a.n.classList.toggle("on", p >= a.t);
      if (y >= s.top - innerHeight * 0.5) active = s;
    }

    /* choreography for the active scene */
    const fn = choreo[active.id];
    if (fn) fn(active.p);

    /* walking only feels right while the page is actually moving */
    const scrolling = now - lastScrollAt < 180;
    let anim = dino.anim;
    if (!scrolling) {
      if (anim === "walk" || anim === "run") anim = "idle";
      else if (anim === "ghostMove") anim = "ghostIdle";
    }

    /* face the direction of travel */
    const dx = dino.x - prevX;
    if (Math.abs(dx) > 0.02) dino.flip = dx < 0;
    prevX = dino.x;

    dinoSprite.set(anim);
    dinoSprite.tick(dt);
    for (const m of miniSprites) m.tick(dt);

    dinoEl.style.left = dino.x + "vw";
    dinoEl.style.bottom = dino.y + "vh";
    dinoEl.style.opacity = dino.op.toFixed(3);
    dinoSpriteEl.style.transform =
      `scale(${(dino.flip ? -dino.scale : dino.scale).toFixed(3)}, ${dino.scale.toFixed(3)})`;

    requestAnimationFrame(frame);
  };

  measure();
  addEventListener("resize", measure);
  addEventListener("load", measure);
  requestAnimationFrame(frame);
})();
