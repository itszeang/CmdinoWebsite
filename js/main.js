/* ════════════════════════════════════════════
   CMDino — scroll-driven story engine
   Vanilla JS. No dependencies.
   ════════════════════════════════════════════ */
(() => {
  "use strict";

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ramp = (p, s, e) => clamp((p - s) / (e - s), 0, 1);

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

  /* ── sprite sheet animator (Arks / Dino Family, 24×24 frames) ── */
  const ANIMS = {
    idle: { start: 0,  frames: 4, fps: 7 },
    walk: { start: 4,  frames: 6, fps: 10 },
    kick: { start: 10, frames: 3, fps: 8 },
    hurt: { start: 13, frames: 4, fps: 8 },
    run:  { start: 17, frames: 7, fps: 14 },
  };

  class Sprite {
    constructor(el) { this.el = el; this.anim = "idle"; this.clock = 0; }
    set(name) {
      if (this.anim !== name && ANIMS[name]) { this.anim = name; this.clock = 0; }
    }
    tick(dt) {
      const a = ANIMS[this.anim];
      this.clock += dt;
      const frame = Math.floor(this.clock * a.fps) % a.frames;
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

  const dinoSprite = new Sprite(dinoSpriteEl);
  const miniSprites = [...document.querySelectorAll(".mini-dino")].map((el) => {
    const s = new Sprite(el);
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
      dino.x = lerp(68, 112, ramp(p, 0.18, 1));
      dino.scale = 4; dino.op = 1;
      dino.anim = p < 0.1 ? "idle" : "walk";
    },
    prompt(p) {
      /* Enter scene, look at terminal portal, then walk off */
      dino.x = path(p, [[0, -8], [0.42, 50], [0.8, 50], [1, 112]]);
      dino.scale = lerp(4, 2.8, ramp(p, 0, 0.42));
      dino.op = 1;
      dino.anim = p < 0.42 ? "run" : p < 0.8 ? "idle" : "walk";
    },
    input(p) {
      /* Walk across while text is being typed */
      dino.x = lerp(-8, 112, p);
      dino.scale = 2.8; dino.op = 1; 
      dino.anim = p < 0.1 ? "idle" : "walk";
      if (typedText) {
        const n = Math.round(ramp(p, 0.14, 0.86) * TYPED.length);
        typedText.textContent = TYPED.slice(0, n);
      }
    },
    planner(p) {
      /* Walk across the planning phase */
      dino.x = lerp(-8, 112, p);
      dino.scale = 2.8; dino.op = 1; dino.anim = "run";
    },
    pipeline(p) {
      dino.x = lerp(-8, 112, p);
      dino.y = 11; dino.scale = 3; dino.op = 1; dino.anim = "run";
    },
    orchestration(p) {
      dino.x = path(p, [[0, -8], [0.15, 6], [0.85, 94], [1, 112]]);
      dino.scale = 2.6; dino.op = 1; dino.anim = "run";
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
      dino.scale = 3.2; dino.op = 1;
      if (p < 0.22) {
        dino.x = lerp(-8, 46, ramp(p, 0, 0.22));
        dino.anim = "run";
      } else if (p < 0.66) {
        dino.x = 46;
        dino.anim = p < 0.4 ? "hurt" : "idle"; /* hit the wall, then wait */
      } else {
        dino.x = lerp(46, 112, ramp(p, 0.66, 1));
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
      /* zig-zag between the floating files, then carry on */
      dino.scale = 3.2; dino.op = 1;
      dino.x = path(p, [
        [0, -8], [0.24, 24], [0.4, 62], [0.54, 40], [0.68, 74], [0.8, 74], [1, 112],
      ]);
      dino.anim = p > 0.8 || p < 0.24 ? "run" : "walk";
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
      dino.x = lerp(-8, 112, p);
      dino.scale = 3; dino.op = 1; dino.anim = "walk";
    },
    output(p) {
      dino.x = path(p, [[0, -8], [0.26, 50], [0.84, 50], [1, 112]]);
      dino.scale = 3; dino.op = 1;
      dino.anim = p < 0.26 || p > 0.84 ? "run" : "idle";
      if (burst) {
        const b = ramp(p, 0.28, 0.5);
        const fade = 1 - ramp(p, 0.66, 0.9);
        burst.style.transform = `scale(${b * 1.6})`;
        burst.style.opacity = b * fade;
      }
    },
    product(p) {
      /* Dino inspects the finished product */
      dino.x = lerp(-8, 112, p);
      dino.scale = 3.5; dino.op = 1; dino.anim = "walk";
    },
    workspace(p) {
      /* Dino runs through the command center */
      dino.x = lerp(-8, 112, p);
      dino.scale = 3; dino.op = 1; dino.anim = "run";
    },
    final(p) {
      dino.x = path(p, [[0, -8], [0.4, 50], [1, 50]]);
      dino.scale = 4.6; dino.op = 1;
      dino.anim = p < 0.38 ? "run" : "idle";
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
    if (!scrolling && (anim === "walk" || anim === "run")) anim = "idle";

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
