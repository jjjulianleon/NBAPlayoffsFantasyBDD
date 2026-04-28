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
    // Handle 'Z' to properly match UTC if the database sends naive timestamps 
    // that are actually UTC under the hood, or simply parse correctly
    const parseDate = (d) => new Date(d.endsWith('Z') ? d : d + 'Z').getTime();
    return Date.now() - parseDate(startedAt);
  });

  useEffect(() => {
    if (!startedAt) {
      return undefined;
    }

    const parseDate = (d) => new Date(d.endsWith('Z') ? d : d + 'Z').getTime();
    
    // Set initial elapsed time
    setElapsed(Date.now() - parseDate(startedAt));

    const interval = window.setInterval(() => {
      setElapsed(Date.now() - parseDate(startedAt));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [startedAt]);

  return <span className="font-stat text-6xl font-black tracking-tight text-[--color-text] md:text-7xl">{formatElapsed(elapsed)}</span>;
}
