"use client";

export default function PlayerStatusHeader(props: {
  characterName: string;
  becomingLabel: string;

  healthCurrent: number | null;
  healthMax: number | null;
  defense: number | null;
  speed: number | null;

  faithAvailable: number; // ALWAYS visible
  faithCap: number;

  effects: Array<{ name: string; kind?: "buff" | "debuff"; note?: string }>;

  liveSessionName: string | null;
  onJoinClick: () => void;
}) {
  const hc = props.healthCurrent;
  const hm = props.healthMax;

  const healthText = hc != null && hm != null ? `${hc} / ${hm}` : "—";
  const defenseText = props.defense != null ? String(props.defense) : "—";
  const speedText = props.speed != null ? `${props.speed} ft` : "—";

  const faithText = `${props.faithAvailable} / ${props.faithCap}`;

  const effects = props.effects ?? [];
  const shown = effects.slice(0, 3);
  const extra = effects.length - shown.length;

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-lg font-semibold">{props.characterName}</div>
          <div className="text-sm text-neutral-300">{props.becomingLabel}</div>
        </div>

        <div className="flex flex-wrap gap-2">
          <StatPill label="Health" value={healthText} />
          <StatPill label="Defense" value={defenseText} />
          <StatPill label="Speed" value={speedText} />
          <StatPill label="Faith" value={faithText} dim={props.faithAvailable === 0} />
          <EffectsPill shown={shown} extra={extra} />
          <SessionPill liveSessionName={props.liveSessionName} onJoinClick={props.onJoinClick} />
        </div>
      </div>
    </div>
  );
}

function StatPill(props: { label: string; value: string; dim?: boolean }) {
  return (
    <div className={["rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-2", props.dim ? "opacity-60" : ""].join(" ")}>
      <div className="text-[11px] uppercase tracking-wide text-neutral-400">{props.label}</div>
      <div className="text-sm font-semibold text-white">{props.value}</div>
    </div>
  );
}

function EffectsPill(props: { shown: Array<{ name: string; kind?: string }>; extra: number }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-neutral-400">Effects</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {props.shown.length === 0 ? (
          <span className="text-sm text-neutral-400">—</span>
        ) : (
          <>
            {props.shown.map((e, idx) => (
              <span
                key={idx}
                className={[
                  "rounded-full px-2 py-0.5 text-xs",
                  e.kind === "debuff" ? "bg-red-500/20 text-red-200" : "bg-emerald-500/20 text-emerald-200",
                ].join(" ")}
              >
                {e.name}
              </span>
            ))}
            {props.extra > 0 ? (
              <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-200">+{props.extra} more</span>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function SessionPill(props: { liveSessionName: string | null; onJoinClick: () => void }) {
  const live = props.liveSessionName;
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-neutral-400">Session</div>
      {live ? (
        <div className="mt-1 inline-flex items-center gap-2 rounded-full bg-red-500/20 px-2 py-1 text-xs text-red-200">
          <span className="h-2 w-2 rounded-full bg-red-400" />
          LIVE • {live}
        </div>
      ) : (
        <button
          className="mt-1 rounded-full border border-neutral-700 bg-neutral-950 px-3 py-1 text-xs text-neutral-200 hover:bg-neutral-900"
          onClick={props.onJoinClick}
        >
          Offline • Join
        </button>
      )}
    </div>
  );
}
