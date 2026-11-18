import { useEffect, useRef } from 'react';

type Point = { x: number; y: number };
type Stroke = { from: Point; control: Point; to: Point; time: number; width: number; fleck?: Point };

const fadeDuration = 440;

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export default function CursorInkTrail() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvasRef.current;
    const drawingContext = element?.getContext('2d');
    if (!element || !drawingContext) return;
    const canvas = element;
    const context = drawingContext;

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let strokes: Stroke[] = [];
    let previous: Point | undefined;
    let previousMidpoint: Point | undefined;
    let previousDirection: Point | undefined;
    let previousTime = 0;
    let lastFleck = -Infinity;
    let frame: number | undefined;
    let scale = 1;

    function clear() {
      context.clearRect(0, 0, canvas.width / scale, canvas.height / scale);
    }

    function resize() {
      scale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * scale);
      canvas.height = Math.round(window.innerHeight * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.lineCap = 'round';
    }

    function draw(now: number) {
      clear();
      strokes = strokes.filter(({ time }) => now - time < fadeDuration);
      for (const { from, control, to, time, width, fleck } of strokes) {
        const freshness = 1 - Math.max(0, now - time) / fadeDuration;
        const opacity = freshness ** 2;
        const brushWidth = width * (0.25 + 0.75 * freshness);
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.quadraticCurveTo(control.x, control.y, to.x, to.y);

        context.strokeStyle = '#C15656';
        context.globalAlpha = 0.12 * opacity;
        context.lineWidth = brushWidth * 2;
        context.stroke();

        context.strokeStyle = '#84302C';
        context.globalAlpha = 0.44 * opacity;
        context.lineWidth = brushWidth;
        context.stroke();

        if (fleck) {
          context.fillStyle = '#A65C45';
          context.globalAlpha = 0.5 * opacity;
          context.beginPath();
          context.ellipse(fleck.x, fleck.y, 1.6, 0.85, -0.5, 0, Math.PI * 2);
          context.fill();
        }
      }
      frame = strokes.length ? window.requestAnimationFrame(draw) : undefined;
    }

    function move(event: PointerEvent) {
      if (motion.matches || (event.pointerType !== 'mouse' && event.pointerType !== 'pen')) return;

      const point = { x: event.clientX, y: event.clientY };
      const now = performance.now();
      const elapsed = now - previousTime;
      const dx = point.x - (previous?.x ?? point.x);
      const dy = point.y - (previous?.y ?? point.y);
      const distance = Math.hypot(dx, dy);
      if (previous && elapsed < 80 && distance > 0 && distance < 100) {
        const direction = { x: dx / distance, y: dy / distance };
        const nextMidpoint = midpoint(previous, point);
        const speed = distance / Math.max(1, elapsed);
        const width = Math.max(1.4, 5.4 - 1.7 * speed);
        const turn = previousDirection
          ? previousDirection.x * direction.y - previousDirection.y * direction.x
          : 0;
        const stroke: Stroke = { from: previousMidpoint ?? previous, control: previous, to: nextMidpoint, time: now, width };
        if (speed > 0.55 && Math.abs(turn) > 0.38 && now - lastFleck > 110) {
          stroke.fleck = { x: previous.x + direction.y * turn * 11, y: previous.y - direction.x * turn * 11 };
          lastFleck = now;
        }
        strokes.push(stroke);
        previousMidpoint = nextMidpoint;
        previousDirection = direction;
        frame ??= window.requestAnimationFrame(draw);
      } else if (distance > 0 || elapsed >= 80) {
        previousMidpoint = undefined;
        previousDirection = undefined;
      }
      previous = point;
      previousTime = now;
    }

    function reset() {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = undefined;
      previous = undefined;
      previousMidpoint = undefined;
      previousDirection = undefined;
      strokes = [];
      clear();
    }

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('blur', reset);
    motion.addEventListener('change', reset);
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('blur', reset);
      motion.removeEventListener('change', reset);
      reset();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 9999 }}
    />
  );
}
