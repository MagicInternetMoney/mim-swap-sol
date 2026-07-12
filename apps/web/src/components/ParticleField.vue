<template>
  <canvas
    ref="canvas"
    aria-hidden="true"
    class="pointer-events-none fixed inset-0 z-0 h-full w-full"
    :class="
      theme === 'light'
        ? 'opacity-50 mix-blend-multiply'
        : 'opacity-[0.72] mix-blend-screen'
    "
  />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  phase: number;
};

withDefaults(
  defineProps<{
    theme?: "dark" | "light";
  }>(),
  {
    theme: "dark",
  }
);

const canvas = ref<HTMLCanvasElement | null>(null);
const colors = ["#19f7ff", "#14f195", "#9b5cff", "#ff3dcb", "#fcee09"];
const pointer = {
  active: false,
  x: -9999,
  y: -9999,
};

let context: CanvasRenderingContext2D | null = null;
let particles: Particle[] = [];
let animationFrame = 0;
let width = 0;
let height = 0;
let pixelRatio = 1;
let reducedMotion = false;

onMounted(() => {
  const element = canvas.value;
  if (!element) return;

  context = element.getContext("2d");
  if (!context) return;

  reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("mouseleave", clearPointer);
  window.addEventListener("touchmove", handleTouchMove, { passive: true });
  window.addEventListener("touchend", clearPointer);

  draw(performance.now());
});

onUnmounted(() => {
  cancelAnimationFrame(animationFrame);
  window.removeEventListener("resize", resizeCanvas);
  window.removeEventListener("mousemove", handleMouseMove);
  window.removeEventListener("mouseleave", clearPointer);
  window.removeEventListener("touchmove", handleTouchMove);
  window.removeEventListener("touchend", clearPointer);
});

function resizeCanvas() {
  const element = canvas.value;
  if (!element || !context) return;

  pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  element.width = Math.floor(width * pixelRatio);
  element.height = Math.floor(height * pixelRatio);
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  seedParticles();
}

function seedParticles() {
  const particleCount = Math.min(
    92,
    Math.max(34, Math.floor((width * height) / 26000))
  );

  particles = Array.from({ length: particleCount }, (_, index) => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.22,
    vy: (Math.random() - 0.5) * 0.22,
    radius: 1.1 + Math.random() * 1.8,
    color: colors[index % colors.length],
    phase: Math.random() * Math.PI * 2,
  }));
}

function draw(time: number) {
  if (!context) return;

  context.clearRect(0, 0, width, height);
  context.globalCompositeOperation = "lighter";
  drawConnections();
  particles.forEach((particle) => {
    updateParticle(particle, time);
    drawParticle(particle);
  });
  context.globalCompositeOperation = "source-over";

  if (!reducedMotion) {
    animationFrame = requestAnimationFrame(draw);
  }
}

function drawConnections() {
  if (!context) return;

  const maxDistance = width < 768 ? 112 : 150;
  for (let index = 0; index < particles.length; index += 1) {
    const particle = particles[index];
    for (let nextIndex = index + 1; nextIndex < particles.length; nextIndex += 1) {
      const nextParticle = particles[nextIndex];
      const distance = distanceBetween(particle.x, particle.y, nextParticle.x, nextParticle.y);
      if (distance > maxDistance) continue;

      const opacity = (1 - distance / maxDistance) * 0.16;
      context.beginPath();
      context.moveTo(particle.x, particle.y);
      context.lineTo(nextParticle.x, nextParticle.y);
      context.strokeStyle = `rgba(25, 247, 255, ${opacity})`;
      context.lineWidth = 1;
      context.stroke();
    }
  }
}

function updateParticle(particle: Particle, time: number) {
  const drift = Math.sin(time * 0.0007 + particle.phase) * 0.04;
  particle.x += particle.vx + drift;
  particle.y += particle.vy + Math.cos(time * 0.0006 + particle.phase) * 0.035;

  if (pointer.active) {
    const dx = particle.x - pointer.x;
    const dy = particle.y - pointer.y;
    const distance = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
    const interactionRadius = width < 768 ? 118 : 170;

    if (distance < interactionRadius) {
      const force = (1 - distance / interactionRadius) * 1.35;
      particle.x += (dx / distance) * force;
      particle.y += (dy / distance) * force;
    }
  }

  wrapParticle(particle);
}

function drawParticle(particle: Particle) {
  if (!context) return;

  const boost = pointer.active
    ? Math.max(0, 1 - distanceBetween(particle.x, particle.y, pointer.x, pointer.y) / 150)
    : 0;

  context.beginPath();
  context.shadowBlur = 12 + boost * 18;
  context.shadowColor = particle.color;
  context.fillStyle = withAlpha(particle.color, 0.44 + boost * 0.32);
  context.arc(particle.x, particle.y, particle.radius + boost * 1.4, 0, Math.PI * 2);
  context.fill();
  context.shadowBlur = 0;
}

function wrapParticle(particle: Particle) {
  const gutter = 18;
  if (particle.x < -gutter) particle.x = width + gutter;
  if (particle.x > width + gutter) particle.x = -gutter;
  if (particle.y < -gutter) particle.y = height + gutter;
  if (particle.y > height + gutter) particle.y = -gutter;
}

function handleMouseMove(event: MouseEvent) {
  pointer.active = true;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
}

function handleTouchMove(event: TouchEvent) {
  const touch = event.touches.item(0);
  if (!touch) return;

  pointer.active = true;
  pointer.x = touch.clientX;
  pointer.y = touch.clientY;
}

function clearPointer() {
  pointer.active = false;
  pointer.x = -9999;
  pointer.y = -9999;
}

function distanceBetween(x1: number, y1: number, x2: number, y2: number) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

function withAlpha(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
</script>
