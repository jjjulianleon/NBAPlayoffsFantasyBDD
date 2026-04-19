import { useEffect, useState } from 'react';

function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export default function DraftClock({ startedAt }) {
  const [elapsed, setElapsed] = useState(() => {
    if (!startedAt) {
      return 0;
    }
    return Date.now() - new Date(startedAt).getTime();
  });

  useEffect(() => {
    if (!startedAt) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setElapsed(Date.now() - new Date(startedAt).getTime());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [startedAt]);

  return <span className="font-stat text-6xl font-black tracking-tight text-[--color-text] md:text-7xl">{formatElapsed(elapsed)}</span>;
}
