'use client';

import { useEffect, useMemo, useState } from 'react';

function fmt(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export default function TimerClient({
  remainingSeconds,
  status,
  updatedAt,
}: {
  remainingSeconds: number;
  status: 'stopped' | 'running' | 'paused';
  updatedAt: string; // timestamptz
}) {
  const baseMs = useMemo(() => new Date(updatedAt).getTime(), [updatedAt]);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const liveRemaining =
    status === 'running'
      ? remainingSeconds - (nowMs - baseMs) / 1000
      : remainingSeconds;

  return (
    <div className="flex items-center gap-3 border rounded-xl px-4 py-3">
      <div className="text-2xl">⌛</div>
      <div>
        <div className="text-xs uppercase text-gray-500">Session Timer</div>
        <div className="text-xl font-mono font-bold">{fmt(liveRemaining)}</div>
        <div className="text-xs text-gray-500">{status}</div>
      </div>
    </div>
  );
}
