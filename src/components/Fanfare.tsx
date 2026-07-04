import { useEffect, useMemo, useState } from 'react';

const COLORS = ['#008de4', '#3fb950', '#d29922', '#f85149', '#a371f7', '#e6edf3'];
const PIECES = 120;
const DURATION_MS = 6000;

/** One-shot full-screen confetti burst; unmounts itself when the animation ends. */
export function Fanfare() {
  const [done, setDone] = useState(false);

  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 1.8,
        fall: 2.4 + Math.random() * 2.2,
        drift: (Math.random() - 0.5) * 120,
        spin: 360 + Math.random() * 720,
        size: 6 + Math.random() * 6,
        color: COLORS[i % COLORS.length],
        round: Math.random() < 0.3,
      })),
    [],
  );

  useEffect(() => {
    const t = setTimeout(() => setDone(true), DURATION_MS);
    return () => clearTimeout(t);
  }, []);

  if (done) return null;

  return (
    <div className="fanfare" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * (p.round ? 1 : 0.5),
            background: p.color,
            borderRadius: p.round ? '50%' : 1,
            animationDuration: `${p.fall}s`,
            animationDelay: `${p.delay}s`,
            ['--drift' as string]: `${p.drift}px`,
            ['--spin' as string]: `${p.spin}deg`,
          }}
        />
      ))}
    </div>
  );
}
