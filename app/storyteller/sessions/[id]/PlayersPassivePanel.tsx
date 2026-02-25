"use client";

import { useEffect, useMemo, useState } from "react";
import DmPlayerRollLineRealtime from "@/components/DmPlayerRollLineRealtime";
import { supabaseBrowser } from "@/lib/supabase/browser";

type PassiveRow = {
  source: string;
  playerText: string;
  storytellerText?: string;
  mode?: string;
  saveTriggerEnabled?: boolean;
};

type PlayerCardData = {
  playerId: string;
  characterId?: string;
  characterName?: string;
  passives: PassiveRow[];
};

export default function PlayersPassivePanel({
  sessionId,
  joins,
  initialState,
  players,
  onRequestSave,
}: {
  sessionId: string;
  joins: any[];
  initialState: any;
  players: PlayerCardData[];
  onRequestSave: (formData: FormData) => Promise<void>;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<any>(initialState ?? {});
  const playersById = useMemo(() => {
    const m = new Map<string, PlayerCardData>();
    for (const p of players ?? []) m.set(String(p.playerId), p);
    return m;
  }, [players]);

  const selected = selectedPlayerId ? playersById.get(selectedPlayerId) ?? null : null;
  const rollOpen = Boolean(liveState?.roll_open);
  const rollTarget = String(liveState?.roll_target ?? "all").trim();

  useEffect(() => {
    setLiveState(initialState ?? {});
  }, [initialState]);

  useEffect(() => {
    const channel = supabase
      .channel(`session_state:${sessionId}:playerspassive`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_state",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          if (payload?.new) setLiveState(payload.new);
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, sessionId]);

  return (
    <>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {Array.from({ length: 6 }).map((_, i) => {
          const pRow = (joins ?? [])[i];
          const playerId = String(pRow?.player_id ?? "").trim();
          const hasPlayer = Boolean(playerId);
          const info = hasPlayer ? playersById.get(playerId) : null;
          const hasActiveRoll = hasPlayer && rollOpen && (rollTarget === "all" || rollTarget === playerId);
          return (
            <button
              key={i}
              type="button"
              disabled={!hasPlayer}
              onClick={() => {
                if (!hasPlayer) return;
                setSelectedPlayerId(playerId);
              }}
              className={[
                "border rounded-lg p-2 text-center disabled:opacity-60 disabled:cursor-not-allowed hover:bg-gray-50 transition",
                hasActiveRoll
                  ? "border-emerald-400 bg-emerald-50 shadow-[0_0_0_2px_rgba(52,211,153,0.5),0_0_20px_rgba(16,185,129,0.35)]"
                  : "",
              ].join(" ")}
            >
              <div className="text-xs text-gray-500">Player {i + 1}</div>
              <div className="text-[11px] font-mono break-all">{hasPlayer ? playerId.slice(0, 8) : "-"}</div>
              <div className="mt-1 text-[11px] text-gray-600">
                {info?.characterName ? info.characterName : hasPlayer ? "Open passives" : "No player"}
              </div>
              {hasActiveRoll ? (
                <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Roll Active</div>
              ) : null}
              <DmPlayerRollLineRealtime sessionId={sessionId} playerId={hasPlayer ? playerId : null} initialState={initialState as any} />
            </button>
          );
        })}
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/35" onClick={() => setSelectedPlayerId(null)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l bg-white p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase text-gray-500">Player Passives</div>
                <div className="text-lg font-semibold">{selected.characterName || "Character"}</div>
                <div className="text-[11px] font-mono text-gray-500">{selected.playerId}</div>
              </div>
              <button
                type="button"
                className="rounded border px-2 py-1 text-sm"
                onClick={() => setSelectedPlayerId(null)}
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {selected.passives.length ? (
                selected.passives.map((p, idx) => (
                  <div key={`${p.source}-${idx}`} className="rounded border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-sm">{p.source}</div>
                      {p.mode ? <span className="rounded border px-1.5 py-0.5 text-[10px] uppercase text-gray-600">{p.mode}</span> : null}
                    </div>
                    <div className="mt-1 text-sm text-gray-700">{p.playerText || "-"}</div>
                    {p.storytellerText ? (
                      <div className="mt-2 rounded border bg-amber-50 px-2 py-1 text-xs text-amber-900">
                        ST Note: {p.storytellerText}
                      </div>
                    ) : null}
                    {p.saveTriggerEnabled ? (
                      <form action={onRequestSave} className="mt-2 grid grid-cols-1 gap-2">
                        <input type="hidden" name="player_id" value={selected.playerId} />
                        <input type="hidden" name="source" value={p.source} />
                        <input type="hidden" name="default_instruction" value={p.storytellerText ?? ""} />
                        <div className="grid grid-cols-3 gap-2">
                          <label className="space-y-1">
                            <div className="text-[10px] uppercase text-gray-500">Save</div>
                            <select name="check_key" defaultValue="WIS" className="w-full rounded border px-2 py-1 text-xs">
                              {["STR", "DEX", "CON", "INT", "WIS", "CHA"].map((k) => (
                                <option key={k} value={k}>
                                  {k}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="space-y-1">
                            <div className="text-[10px] uppercase text-gray-500">DC</div>
                            <input
                              name="dc"
                              type="number"
                              min={1}
                              max={40}
                              placeholder="12"
                              className="w-full rounded border px-2 py-1 text-xs"
                            />
                          </label>
                          <div className="flex items-end">
                            <button
                              type="submit"
                              className="inline-flex w-full items-center justify-center gap-1 rounded border bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                              title="Send saving throw roll request to this player"
                            >
                              <span>Request Save</span>
                            </button>
                          </div>
                        </div>
                      </form>
                    ) : (
                      <div className="mt-2 text-[11px] text-gray-500">No save trigger configured for this passive.</div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-500">No active passive effects for this player.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
