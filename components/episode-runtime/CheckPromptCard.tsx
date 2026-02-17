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
    </div>
  );
}
