'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import TimerClient from './TimerClient';
import RollPromptClient from './RollPromptClient';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function PlayerStateClient({
  sessionId,
  initialState,
}: {
  sessionId: string;
  initialState: any;
}) {
  const [state, setState] = useState(initialState);

  useEffect(() => {
    const channel = supabase
      .channel(`session-state-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'session_state',
          filter: `session_id=eq.${sessionId}`,
        },
        payload => {
          setState(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const pct =
    state.encounter_total > 0
      ? Math.round((state.encounter_current / state.encounter_total) * 100)
      : 0;

  return (
    <>
      <TimerClient
        remainingSeconds={state.remaining_seconds}
        status={state.timer_status}
        updatedAt={state.updated_at}
      />

      <div className="border rounded-xl p-4 mt-4">
        <div className="text-xs uppercase text-gray-500">Encounter</div>
        <div className="mt-2 h-2 rounded bg-gray-200 overflow-hidden">
          <div className="h-2 bg-black" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 text-sm text-gray-600">
          {state.encounter_total === 0
            ? 'No encounters set'
            : `${state.encounter_current} / ${state.encounter_total}`}
        </div>
      </div>

      <RollPromptClient open={state.roll_open} prompt={state.roll_prompt} />
    </>
  );
}
