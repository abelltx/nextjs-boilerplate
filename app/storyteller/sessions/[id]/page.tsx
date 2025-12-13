import TimerClient from '@/components/TimerClient';
import { getDmSession, updateStoryText, updateState } from './actions';

export default async function DmScreenPage({ params }: { params: { id: string } }) {
  const { session, state, joins } = await getDmSession(params.id);

  const encounterPct =
    state.encounter_total > 0 ? Math.round((state.encounter_current / state.encounter_total) * 100) : 0;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4">
      {/* TOP BAR */}
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-8 border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase text-gray-500">Session</div>
              <div className="text-xl font-bold">{session.name}</div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase text-gray-500">Join Code</div>
              <div className="font-mono text-xl font-bold">{session.join_code}</div>
            </div>
          </div>

          {/* PLAYER SLOTS (6 max) */}
          <div className="mt-4 grid grid-cols-6 gap-2">
            {Array.from({ length: 6 }).map((_, i) => {
              const p = joins[i];
              return (
                <div key={i} className="border rounded-lg p-2 text-center">
                  <div className="text-xs text-gray-500">Player {i + 1}</div>
                  <div className="text-[11px] font-mono break-all">
                    {p ? p.player_id.slice(0, 8) : '—'}
                  </div>
                </div>
              );
            })}
          </div>

          {/* NPC/MONSTER SLOTS (placeholders) */}
          <div className="mt-3 grid grid-cols-4 gap-2">
            {['NPC A', 'NPC B', 'Monster A', 'Monster B'].map((label) => (
              <div key={label} className="border rounded-lg p-2 text-center text-xs text-gray-600">
                {label}
              </div>
            ))}
          </div>
        </div>

        <div className="col-span-4 space-y-3">
          <TimerClient
            remainingSeconds={state.remaining_seconds}
            status={state.timer_status}
            updatedAt={state.updated_at}
          />

          {/* TIMER CONTROLS */}
          <div className="border rounded-xl p-4 space-y-2">
            <div className="text-xs uppercase text-gray-500">Timer Controls</div>
            <div className="flex flex-wrap gap-2">
              <form action={async () => { 'use server';
                // Start: keep remaining_seconds as-is; just flip running and bump updated_at
                await updateState(session.id, { timer_status: 'running' });
              }}>
                <button className="px-3 py-2 rounded bg-black text-white text-sm">Start</button>
              </form>

              <form action={async () => { 'use server';
                await updateState(session.id, { timer_status: 'paused' });
              }}>
                <button className="px-3 py-2 rounded border text-sm">Pause</button>
              </form>

              <form action={async () => { 'use server';
                // Reset to duration
                await updateState(session.id, {
                  timer_status: 'stopped',
                  remaining_seconds: state.duration_seconds
                });
              }}>
                <button className="px-3 py-2 rounded border text-sm">Reset</button>
              </form>

              <form action={async () => { 'use server';
                // Extend +5 minutes
                await updateState(session.id, { remaining_seconds: state.remaining_seconds + 300 });
              }}>
                <button className="px-3 py-2 rounded border text-sm">+5 min</button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* MIDDLE BAR */}
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-6 border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase text-gray-500">Encounter Progress</div>
              <div className="font-bold">
                {state.encounter_total === 0 ? 'No encounters set' : `Encounter ${state.encounter_current} / ${state.encounter_total}`}
              </div>
            </div>
            <div className="text-2xl font-bold">{encounterPct}%</div>
          </div>

          <div className="mt-3 h-2 rounded bg-gray-200 overflow-hidden">
            <div className="h-2 bg-black" style={{ width: `${encounterPct}%` }} />
          </div>

          <div className="mt-3 flex gap-2">
            <form action={async () => { 'use server'; await updateState(session.id, { encounter_total: Math.max(0, state.encounter_total + 1) }); }}>
              <button className="px-3 py-2 rounded border text-sm">+ total</button>
            </form>
            <form action={async () => { 'use server'; await updateState(session.id, { encounter_current: Math.min(state.encounter_total, state.encounter_current + 1) }); }}>
              <button className="px-3 py-2 rounded border text-sm">Next</button>
            </form>
            <form action={async () => { 'use server'; await updateState(session.id, { encounter_current: Math.max(0, state.encounter_current - 1) }); }}>
              <button className="px-3 py-2 rounded border text-sm">Back</button>
            </form>
          </div>
        </div>

        <div className="col-span-6 border rounded-xl p-4">
          <div className="text-xs uppercase text-gray-500">Roll Requests (physical dice)</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {['d20','d12','d10','d8','d6','d4'].map(die => (
              <form
                key={die}
                action={async () => {
                  'use server';
                  await updateState(session.id, {
                    roll_open: true,
                    roll_die: die,
                    roll_prompt: `Roll your ${die.toUpperCase()} now`,
                    roll_target: 'all'
                  });
                }}
              >
                <button className="px-3 py-2 rounded bg-black text-white text-sm">Roll {die}</button>
              </form>
            ))}

            <form action={async () => { 'use server'; await updateState(session.id, { roll_open: false, roll_die: null, roll_prompt: null }); }}>
              <button className="px-3 py-2 rounded border text-sm">Close Roll</button>
            </form>
          </div>

          {/* Placeholder for ST to type results later */}
          <div className="mt-3 text-xs text-gray-600">
            Result entry grid comes next (ST types what players rolled).
          </div>
        </div>
      </div>

      {/* MAIN BOARD */}
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-3 border rounded-xl p-4">
          <div className="text-xs uppercase text-gray-500">Map / City</div>
          <div className="mt-2 h-64 rounded bg-gray-100 flex items-center justify-center text-gray-500">
            Map image placeholder
          </div>
        </div>

        <div className="col-span-6 border rounded-xl p-4">
          <div className="text-xs uppercase text-gray-500">Story Text</div>

          <form
            action={async (fd) => {
              'use server';
              await updateStoryText(session.id, fd);
            }}
            className="mt-2 space-y-2"
          >
            <textarea
              name="story_text"
              defaultValue={session.story_text || ''}
              className="w-full h-64 border rounded p-3 font-serif"
              placeholder="Write the scene/story here..."
            />
            <button className="px-4 py-2 rounded bg-black text-white">Save Story</button>
          </form>
        </div>

        <div className="col-span-3 border rounded-xl p-4">
          <div className="text-xs uppercase text-gray-500">NPC Portrait</div>
          <div className="mt-2 h-64 rounded bg-gray-100 flex items-center justify-center text-gray-500">
            NPC image placeholder
          </div>
        </div>
      </div>

      {/* LOOT / OLIVES */}
      <div className="border rounded-xl p-4">
        <div className="text-xs uppercase text-gray-500">Loot / Olives</div>
        <div className="mt-2 text-gray-600 text-sm">
          Framework panel now. Later: olive bank, drops, assignment, time-travel inventory.
        </div>
      </div>
    </div>
  );
}
