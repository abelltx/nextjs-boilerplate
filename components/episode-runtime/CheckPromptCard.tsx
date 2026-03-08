type JoinRow = {
  player_id?: string | null;
};

const PRESET_CHECKS = [
  "Perception",
  "Investigation",
  "Insight",
  "Medicine",
  "Athletics",
  "Acrobatics",
  "Stealth",
  "Survival",
  "Arcana",
  "Religion",
  "History",
  "Persuasion",
  "Deception",
  "Intimidation",
  "STR",
  "DEX",
  "CON",
  "INT",
  "WIS",
  "CHA",
];

export default function CheckPromptCard(props: {
  sessionId: string;
  joins: JoinRow[];
  rollOpen: boolean;
  currentPrompt: string;
  onSendPrompt: (formData: FormData) => Promise<void>;
  onClosePrompt: () => Promise<void>;
  pendingRequests?: Array<{
    id: string;
    playerId: string;
    playerLabel: string;
    checkKey: string;
    message?: string | null;
    createdAt?: string | null;
  }>;
  onApproveRequest?: (formData: FormData) => Promise<void>;
  onDeclineRequest?: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="border rounded-xl p-4 space-y-3">
      <div className="text-xs uppercase text-gray-500">Check Prompt</div>
      <div className="text-sm text-gray-700">
        Send a clear instruction to players. This appears on the player Stage panel.
      </div>

      <form action={props.onSendPrompt} className="space-y-2">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <label className="space-y-1">
            <div className="text-xs text-gray-600">Check</div>
            <select name="check_key" className="w-full border rounded p-2 text-sm" defaultValue="Perception">
              {PRESET_CHECKS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <div className="text-xs text-gray-600">Difficulty (optional)</div>
            <input name="dc" type="number" min={1} max={40} className="w-full border rounded p-2 text-sm" placeholder="e.g. 12" />
          </label>

          <label className="space-y-1">
            <div className="text-xs text-gray-600">Target</div>
            <select name="target" className="w-full border rounded p-2 text-sm" defaultValue="all">
              <option value="all">All joined players</option>
              {props.joins
                .filter((j) => j?.player_id)
                .map((j, i) => (
                  <option key={j.player_id as string} value={j.player_id as string}>
                    Player {i + 1} ({String(j.player_id).slice(0, 8)})
                  </option>
                ))}
            </select>
          </label>
        </div>

        <label className="space-y-1 block">
          <div className="text-xs text-gray-600">Instruction (optional)</div>
          <input
            name="instruction"
            className="w-full border rounded p-2 text-sm"
            placeholder='e.g. "Click Medicine in your Skills and report your total."'
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button className="px-3 py-2 rounded bg-black text-white text-sm">Send Prompt</button>
        </div>
      </form>

      <form action={props.onClosePrompt}>
        <button className="px-3 py-2 rounded border text-sm">Clear Prompt</button>
      </form>

      <div className="rounded border bg-gray-50 p-2 text-xs">
        <div className="font-semibold text-gray-700">Live Prompt</div>
        <div className="mt-1 text-gray-600">{props.rollOpen ? props.currentPrompt || "Prompt open (no text)." : "No active prompt."}</div>
      </div>

      <div className="rounded border bg-gray-50 p-2 text-xs space-y-2">
        <div className="font-semibold text-gray-700">Player Roll Requests</div>
        {(props.pendingRequests ?? []).length ? (
          <div className="space-y-2">
            {(props.pendingRequests ?? []).map((r) => (
              <div key={r.id} className="rounded border bg-white p-2 space-y-2">
                <div className="text-[11px]">
                  <span className="font-semibold">{r.playerLabel}</span> requests <span className="font-semibold">{r.checkKey}</span>
                </div>
                {r.message ? <div className="text-[11px] text-gray-600">Plan: {r.message}</div> : null}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {props.onApproveRequest ? (
                    <form action={props.onApproveRequest} className="space-y-1">
                      <input type="hidden" name="request_id" value={r.id} />
                      <label className="space-y-1 block">
                        <div className="text-[10px] uppercase text-gray-500">DC (optional)</div>
                        <input name="dc" type="number" min={1} max={40} className="w-full border rounded p-1.5 text-xs" />
                      </label>
                      <label className="space-y-1 block">
                        <div className="text-[10px] uppercase text-gray-500">Instruction (optional)</div>
                        <input name="instruction" className="w-full border rounded p-1.5 text-xs" placeholder={`Click ${r.checkKey} and roll.`} />
                      </label>
                      <button className="w-full rounded border border-green-700 bg-green-50 px-2 py-1 text-xs text-green-800">
                        Approve
                      </button>
                    </form>
                  ) : null}
                  {props.onDeclineRequest ? (
                    <form action={props.onDeclineRequest} className="flex items-end">
                      <input type="hidden" name="request_id" value={r.id} />
                      <button className="w-full rounded border border-red-700 bg-red-50 px-2 py-1 text-xs text-red-700">
                        Decline
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-gray-600">No pending player requests.</div>
        )}
      </div>
    </div>
  );
}
