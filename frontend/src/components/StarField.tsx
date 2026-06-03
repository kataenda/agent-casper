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

interface ShootingStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  active: boolean;
}

const STAR_COLORS = [
  "255,255,255",   // white
  "200,220,255",   // blue-white
  "180,240,255",   // ice blue
  "220,200,255",   // lavender
  "0,245,255",     // cyan (rare)
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

function makeShooter(w: number, h: number): ShootingStar {
  const angle = (Math.random() * 30 + 15) * (Math.PI / 180);
  const speed = Math.random() * 12 + 8;
  return {
    x:       Math.random() * w * 0.8,
    y:       Math.random() * h * 0.3,
    vx:      Math.cos(angle) * speed,
    vy:      Math.sin(angle) * speed,
    life:    0,
    maxLife: Math.random() * 40 + 30,
    active:  true,
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
    let shooters: ShootingStar[] = [];
    let frame    = 0;
    let raf: number;

    // Spawn shooting stars occasionally
    let nextShooter = Math.random() * 300 + 200;

    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      // ── Draw twinkling stars ─────────────────────────────────
      for (const s of stars) {
        const twinkle   = Math.sin(frame * s.twinkleSpeed + s.twinklePhase);
        const alpha     = Math.max(0, s.opacity * (0.65 + 0.35 * twinkle));
        const glow      = s.size > 1.2;

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

      // ── Draw shooting stars ──────────────────────────────────
      for (const sh of shooters) {
        if (!sh.active) continue;
        const progress  = sh.life / sh.maxLife;
        const alpha     = progress < 0.2
          ? progress / 0.2
          : progress > 0.7
          ? 1 - (progress - 0.7) / 0.3
          : 1;
        const tailLen   = 80 * (1 - progress * 0.5);

        const grad = ctx.createLinearGradient(
          sh.x - sh.vx * tailLen / sh.vx,
          sh.y - sh.vy * tailLen / sh.vx,
          sh.x, sh.y
        );
        grad.addColorStop(0, `rgba(0,245,255,0)`);
        grad.addColorStop(1, `rgba(255,255,255,${alpha * 0.9})`);

        ctx.beginPath();
        ctx.moveTo(sh.x - sh.vx * (tailLen / Math.sqrt(sh.vx ** 2 + sh.vy ** 2)),
                   sh.y - sh.vy * (tailLen / Math.sqrt(sh.vx ** 2 + sh.vy ** 2)));
        ctx.lineTo(sh.x, sh.y);
        ctx.strokeStyle = grad;
        ctx.lineWidth   = 1.5;
        ctx.stroke();

        sh.x    += sh.vx;
        sh.y    += sh.vy;
        sh.life += 1;
        if (sh.life >= sh.maxLife || sh.x > w || sh.y > h) sh.active = false;
      }

      // Spawn new shooter
      nextShooter--;
      if (nextShooter <= 0) {
        shooters = shooters.filter(s => s.active);
        shooters.push(makeShooter(w, h));
        nextShooter = Math.random() * 400 + 180;
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
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}
