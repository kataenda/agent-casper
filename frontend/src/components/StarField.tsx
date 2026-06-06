"use client";

import { useEffect, useRef } from "react";

interface Star {
  x: number;
  y: number;
  size: number;
  opacity: number;
  twinkleSpeed: number;
  twinklePhase: number;
  color: string;
}

interface Shooter {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  active: boolean;
  color: string;
  tailLen: number;
  width: number;
}

const STAR_COLORS = [
  "255,255,255",
  "200,220,255",
  "180,240,255",
  "220,200,255",
  "0,245,255",
];

const SHOOTER_PALETTES = [
  { head: "255,255,255", tail: "0,245,255"   },  // white → cyan
  { head: "255,255,255", tail: "191,90,242"  },  // white → purple
  { head: "255,255,255", tail: "0,255,148"   },  // white → green
  { head: "0,245,255",   tail: "0,245,255"   },  // full cyan
  { head: "191,90,242",  tail: "191,90,242"  },  // full purple
];

function makeStars(w: number, h: number): Star[] {
  return Array.from({ length: 280 }, () => ({
    x:            Math.random() * w,
    y:            Math.random() * h,
    size:         Math.pow(Math.random(), 2.5) * 2 + 0.3,
    opacity:      Math.random() * 0.7 + 0.15,
    twinkleSpeed: Math.random() * 0.015 + 0.003,
    twinklePhase: Math.random() * Math.PI * 2,
    color:        STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
  }));
}

function makeShooter(w: number, h: number): Shooter {
  const palette = SHOOTER_PALETTES[Math.floor(Math.random() * SHOOTER_PALETTES.length)];
  const goLeft  = Math.random() < 0.3;
  const angle   = (Math.random() * 35 + 10) * (Math.PI / 180);
  const speed   = Math.random() * 14 + 7;

  return {
    x:       goLeft ? Math.random() * w * 0.4 + w * 0.6 : Math.random() * w * 0.7,
    y:       Math.random() * h * 0.55,
    vx:      Math.cos(angle) * speed * (goLeft ? -1 : 1),
    vy:      Math.sin(angle) * speed,
    life:    0,
    maxLife: Math.random() * 50 + 35,
    active:  true,
    color:   palette.head + "|" + palette.tail,
    tailLen: Math.random() * 90 + 60,
    width:   Math.random() * 1.2 + 0.8,
  };
}

export function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = window.innerWidth;
    let h = window.innerHeight;
    canvas.width  = w;
    canvas.height = h;

    let stars    = makeStars(w, h);
    let shooters: Shooter[] = [];
    let frame    = 0;
    let raf: number;
    let nextShooter = Math.random() * 60 + 30;

    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      // ── Twinkling stars ──────────────────────────────────────────
      for (const s of stars) {
        const twinkle = Math.sin(frame * s.twinkleSpeed + s.twinklePhase);
        const alpha   = Math.max(0, s.opacity * (0.65 + 0.35 * twinkle));
        const glow    = s.size > 1.2;

        if (glow) {
          const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size * 3);
          grad.addColorStop(0,   `rgba(${s.color},${alpha})`);
          grad.addColorStop(0.4, `rgba(${s.color},${alpha * 0.4})`);
          grad.addColorStop(1,   `rgba(${s.color},0)`);
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.size * 3, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${s.color},${alpha})`;
        ctx.fill();
      }

      // ── Shooting stars ───────────────────────────────────────────
      for (const sh of shooters) {
        if (!sh.active) continue;

        const progress = sh.life / sh.maxLife;
        const alpha = progress < 0.15
          ? progress / 0.15
          : progress > 0.75
          ? 1 - (progress - 0.75) / 0.25
          : 1;

        const speed   = Math.sqrt(sh.vx * sh.vx + sh.vy * sh.vy);
        const nx      = sh.vx / speed;
        const ny      = sh.vy / speed;
        const tailX   = sh.x - nx * sh.tailLen;
        const tailY   = sh.y - ny * sh.tailLen;

        const [headCol, tailCol] = sh.color.split("|");

        // Trail gradient
        const grad = ctx.createLinearGradient(tailX, tailY, sh.x, sh.y);
        grad.addColorStop(0,    `rgba(${tailCol},0)`);
        grad.addColorStop(0.5,  `rgba(${tailCol},${alpha * 0.35})`);
        grad.addColorStop(0.85, `rgba(${headCol},${alpha * 0.75})`);
        grad.addColorStop(1,    `rgba(${headCol},${alpha})`);

        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(sh.x, sh.y);
        ctx.strokeStyle = grad;
        ctx.lineWidth   = sh.width;
        ctx.lineCap     = "round";
        ctx.stroke();

        // Glow at head
        const glowR = ctx.createRadialGradient(sh.x, sh.y, 0, sh.x, sh.y, sh.width * 6);
        glowR.addColorStop(0,   `rgba(${headCol},${alpha * 0.9})`);
        glowR.addColorStop(0.4, `rgba(${headCol},${alpha * 0.4})`);
        glowR.addColorStop(1,   `rgba(${headCol},0)`);
        ctx.beginPath();
        ctx.arc(sh.x, sh.y, sh.width * 6, 0, Math.PI * 2);
        ctx.fillStyle = glowR;
        ctx.fill();

        // Bright core dot
        ctx.beginPath();
        ctx.arc(sh.x, sh.y, sh.width * 1.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fill();

        sh.x    += sh.vx;
        sh.y    += sh.vy;
        sh.life += 1;
        if (sh.life >= sh.maxLife || sh.x < -200 || sh.x > w + 200 || sh.y > h + 100)
          sh.active = false;
      }

      // Spawn new shooters — more frequent, allow up to 6 active
      nextShooter--;
      if (nextShooter <= 0) {
        shooters = shooters.filter(s => s.active);
        if (shooters.length < 6) {
          // occasionally spawn 2 at once
          shooters.push(makeShooter(w, h));
          if (Math.random() < 0.25) shooters.push(makeShooter(w, h));
        }
        nextShooter = Math.random() * 80 + 25;
      }

      frame++;
      raf = requestAnimationFrame(draw);
    };

    draw();

    const onResize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width  = w;
      canvas.height = h;
      stars = makeStars(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}
    />
  );
}
