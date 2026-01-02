export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth/getProfile";
import { supabaseServer } from "@/lib/supabase/server";

function isUuid(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

type Block = {
  id: string;
  sort_order: number;
  block_type: string;
  audience: string;
  mode: string;
  title: string | null;
  body: string | null;
  image_url: string | null;
  meta?: any;
};

function fmtDieLabel(d: string) {
  const s = String(d || "").toLowerCase();
  if (!s) return "d20";
  if (s.startsWith("d")) return s;
  return `d${s}`;
}

function parseDieSides(d: string): number | null {
  const s = fmtDieLabel(d);
  const m = s.match(/^d(\d+)$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function rollOne(sides: number) {
  return Math.floor(Math.random() * sides) + 1;
}

export default async function PlayerSessionPage({
  params,
}: {
  params: { id: string } | Promise<{ id: string }>;
}) {
  const p = await Promise.resolve(params);
  const rawSessionId = p?.id;

  if (!rawSessionId || rawSessionId === "undefined" || !isUuid(rawSessionId)) {
    redirect("/player");
  }

  const sessionId = rawSessionId.trim();

  const { user } = await getProfile();
  if (!user) redirect("/login");

  const supabase = await supabaseServer();
  const playerId = user.id;

  // --- Session ---
  const { data: session, error: sErr } = await supabase
    .from("sessions")
    .select("id,name,story_text,episode_id")
    .eq("id", sessionId)
    .single();

  if (sErr) throw new Error(`Failed to load session: ${sErr.message}`);

  // --- State ---
  const { data: state, error: stErr } = await supabase
    .from("session_state")
    .select("*")
    .eq("session_id", sessionId)
    .single();

  if (stErr) throw new Error(`Failed to load session state: ${stErr.message}`);

  // --- Ensure joined ---
  const { data: joinRow } = await supabase
    .from("session_players")
    .select("player_id")
    .eq("session_id", sessionId)
    .eq("player_id", playerId)
    .maybeSingle();

  const isJoined = Boolean(joinRow?.player_id);

  // --- Presented block (if any) ---
  const presentedId = (state as any).presented_block_id as string | null;
  let presented: Block | null = null;

  if (presentedId && isUuid(presentedId)) {
    const { data: b, error: bErr } = await supabase
      .from("episode_blocks")
      .select("id,sort_order,block_type,audience,mode,title,body,image_url,meta")
      .eq("id", presentedId)
      .maybeSingle();

    if (!bErr) presented = (b ?? null) as any;
  }

  // --- Roll state ---
  const rollOpen = Boolean((state as any).roll_open);
  const rollDieCode = String((state as any).roll_die ?? "d20");
  const rollPrompt = String((state as any).roll_prompt ?? "");
  const rollTarget = String((state as any).roll_target ?? "all");

  const rollModes = (((state as any).roll_modes ?? {}) as Record<string, any>) || {};
  const myMode = (rollModes[playerId] ?? "dm") as "dm" | "player" | "digital";

  const rollResults = (((state as any).roll_results ?? {}) as Record<string, any>) || {};
  const myExisting = rollResults[playerId] ?? null;

  const isTargeted = rollTarget === "all" || rollTarget === playerId;
  const shouldShow = isJoined && rollOpen && isTargeted && (myMode === "player" || myMode === "digital");

  // --- Inline server action: submit roll ---
  async function submitRollAction(fd: FormData) {
    "use server";
    const { user } = await getProfile();
    if (!user) redirect("/login");

    const supabase = await supabaseServer();

    // Confirm join
    const { data: jr } = await supabase
      .from("session_players")
      .select("player_id")
      .eq("session_id", sessionId)
      .eq("player_id", user.id)
      .maybeSingle();

    if (!jr?.player_id) redirect(`/player/sessions/${sessionId}`);

    const val = Number(fd.get("roll_value"));
    if (!Number.isFinite(val)) redirect(`/player/sessions/${sessionId}`);

    // Pull latest state (avoid stale overwrite as much as we can)
    const { data: latest } = await supabase
      .from("session_state")
      .select("*")
      .eq("session_id", sessionId)
      .single();

    const latestOpen = Boolean((latest as any)?.roll_open);
    if (!latestOpen) redirect(`/player/sessions/${sessionId}`);

    const prev = (((latest as any)?.roll_results ?? {}) as Record<string, any>) || {};
    const next = {
      ...prev,
      [user.id]: {
        value: val,
        source: String(fd.get("source") ?? "player"),
        submitted_at: new Date().toISOString(),
      },
    };

    await supabase
      .from("session_state")
      .update({ roll_results: next })
      .eq("session_id", sessionId);

    redirect(`/player/sessions/${sessionId}`);
  }

const dieLabel = fmtDieLabel(rollDieCode);
const dieSides = parseDieSides(rollDieCode);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Top header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-neutral-400">Live Session</div>
            <h1 className="text-2xl font-extrabold">{session.name}</h1>
            <div className="mt-1 text-sm text-neutral-300">
              Signed in as {user.email} • Player {playerId.slice(0, 8)} • Joined:{" "}
              <span className={isJoined ? "text-emerald-300" : "text-yellow-300"}>
                {isJoined ? "Yes" : "No"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/player"
              className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-sm hover:bg-neutral-900/50"
            >
              ← Back to Hub
            </a>
            {!isJoined ? (
              <a
                href="/player"
                className="rounded-xl border border-neutral-700 bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-neutral-200"
              >
                Join from Hub
              </a>
            ) : null}
          </div>
        </div>

        {/* Main grid */}
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Left: Presented + Story */}
          <section className="lg:col-span-8 space-y-4">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Presented to Players</div>
                <div className="text-xs text-neutral-400">
                  {presented ? `#${presented.sort_order}` : "Nothing presented yet"}
                </div>
              </div>

              {presented ? (
                <div className="mt-3 space-y-3">
                  <div className="text-lg font-extrabold">
                    {presented.title ?? presented.block_type ?? "Block"}
                  </div>
                  {presented.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={presented.image_url}
                      alt={presented.title ?? "Presented image"}
                      className="w-full rounded-xl border border-neutral-800"
                    />
                  ) : null}
                  {presented.body ? (
                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">
                      {presented.body}
                    </div>
                  ) : (
                    <div className="text-sm text-neutral-400">No body text.</div>
                  )}
                </div>
              ) : (
                <div className="mt-3 text-sm text-neutral-300">
                  When the storyteller clicks <span className="text-neutral-100">Present to Players</span>, it appears here.
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
              <div className="text-sm font-semibold">Story (Announcement Board)</div>
              <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">
                {session.story_text || "No story text yet."}
              </div>
            </div>
          </section>

          {/* Right: Roll requests */}
          <aside className="lg:col-span-4 space-y-4">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Roll Requests</div>
                <div className="text-xs text-neutral-400">
                  {rollOpen ? (
                    <span className="rounded-full bg-red-500/20 px-2 py-1 text-red-200">OPEN</span>
                  ) : (
                    <span className="rounded-full bg-neutral-800 px-2 py-1 text-neutral-300">CLOSED</span>
                  )}
                </div>
              </div>

              <div className="mt-3 space-y-2">
                <div className="text-sm text-neutral-200">
                  Die: <span className="font-bold text-white">{dieLabel}</span>
                </div>
                {rollPrompt ? <div className="text-sm text-neutral-300">{rollPrompt}</div> : null}
                <div className="text-xs text-neutral-400">
                  Mode: <span className="text-neutral-200">{myMode}</span>{" "}
                  {rollTarget !== "all" ? <span>• Targeted</span> : <span>• All players</span>}
                </div>
              </div>

              {!isJoined ? (
                <div className="mt-4 rounded-xl border border-yellow-900/40 bg-yellow-500/10 p-3 text-sm text-yellow-200">
                  You aren’t joined to this session yet. Go back to the Hub and join using the code.
                </div>
              ) : null}

              {shouldShow ? (
                <div className="mt-4 space-y-3">
                  {myExisting ? (
                    <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
                      <div className="text-xs uppercase text-neutral-400">Submitted</div>
                      <div className="mt-1 flex items-center justify-between">
                        <div className="text-2xl font-extrabold">{myExisting.value ?? "—"}</div>
                        <div className="text-xs text-neutral-400">
                          {myExisting.submitted_at ? String(myExisting.submitted_at) : ""}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-neutral-500">
                        Source: {myExisting.source ?? "player"}
                      </div>
                      <div className="mt-2 text-xs text-neutral-400">
                        If you need to change it, submit again (latest wins).
                      </div>
                    </div>
                  ) : null}

                  {/* Manual entry */}
                  {myMode === "player" ? (
                    <form action={submitRollAction} className="space-y-2">
                      <input type="hidden" name="source" value="player" />
                      <label className="block text-xs text-neutral-400">Enter your roll total</label>
                      <input
                        name="roll_value"
                        inputMode="numeric"
                        className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-neutral-600"
                        placeholder="e.g. 17"
                        required
                      />
                      <button className="w-full rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-neutral-200">
                        Submit
                      </button>
                    </form>
                  ) : null}

                  {/* Digital dice */}
                  {myMode === "digital" ? (
                    <div className="space-y-2">
                      <div className="text-xs text-neutral-400">Tap to roll and submit</div>
                      <div className="grid grid-cols-2 gap-2">
                        <form
                          action={async () => {
                            "use server";
                            if (!dieSides) redirect(`/player/sessions/${sessionId}`);
                            const val = rollOne(dieSides);
                            const fd = new FormData();
                            fd.set("roll_value", String(val));
                            fd.set("source", "digital");
                            // reuse the same submit action
                            await submitRollAction(fd);
                          }}
                        >
                          <button
                            type="submit"
                            className="rounded-2xl border border-neutral-800 bg-neutral-950/40 px-3 py-3 text-left hover:bg-neutral-900/50 hover:border-neutral-600 active:scale-[0.99]"
                          >
                            <div className="text-xs uppercase tracking-wide text-neutral-400">Roll</div>
                            <div className="mt-1 text-lg font-extrabold text-white">{dieLabel}</div>
                          </button>
                        </form>

                        <form
                          action={async () => {
                            "use server";
                            if (!dieSides) redirect(`/player/sessions/${sessionId}`);
                            const a = rollOne(dieSides);
                            const b = rollOne(dieSides);
                            const val = Math.max(a, b); // advantage by default
                            const fd = new FormData();
                            fd.set("roll_value", String(val));
                            fd.set("source", "digital_adv");
                            await submitRollAction(fd);
                          }}
                        >
                          <button
                            type="submit"
                            className="rounded-2xl border border-neutral-800 bg-neutral-950/40 px-3 py-3 text-left hover:bg-neutral-900/50 hover:border-neutral-600 active:scale-[0.99]"
                          >
                            <div className="text-xs uppercase tracking-wide text-neutral-400">Adv</div>
                            <div className="mt-1 text-lg font-extrabold text-white">{dieLabel}</div>
                          </button>
                        </form>

                        <form
                          action={async () => {
                            "use server";
                            if (!dieSides) redirect(`/player/sessions/${sessionId}`);
                            const a = rollOne(dieSides);
                            const b = rollOne(dieSides);
                            const val = Math.min(a, b); // disadvantage
                            const fd = new FormData();
                            fd.set("roll_value", String(val));
                            fd.set("source", "digital_dis");
                            await submitRollAction(fd);
                          }}
                        >
                          <button
                            type="submit"
                            className="rounded-2xl border border-neutral-800 bg-neutral-950/40 px-3 py-3 text-left hover:bg-neutral-900/50 hover:border-neutral-600 active:scale-[0.99]"
                          >
                            <div className="text-xs uppercase tracking-wide text-neutral-400">Dis</div>
                            <div className="mt-1 text-lg font-extrabold text-white">{dieLabel}</div>
                          </button>
                        </form>

                        <a
                          href={`/player/sessions/${sessionId}`}
                          className="rounded-2xl border border-neutral-800 bg-neutral-950/40 px-3 py-3 text-left hover:bg-neutral-900/50 hover:border-neutral-600"
                        >
                          <div className="text-xs uppercase tracking-wide text-neutral-400">Refresh</div>
                          <div className="mt-1 text-lg font-extrabold text-white">↻</div>
                        </a>
                      </div>

                      {!dieSides ? (
                        <div className="text-xs text-yellow-200">
                          This roll die value looks invalid: <span className="text-yellow-100">{String(rollDieCode)}</span>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-4 text-sm text-neutral-300">
                  {rollOpen
                    ? isJoined
                      ? isTargeted
                        ? myMode === "dm"
                          ? "Your roll mode is DM-entered. The storyteller will enter your result."
                          : "Waiting for your mode to allow entry."
                        : "This roll is not targeted to you."
                      : "Join the session to submit rolls."
                    : "No roll open right now."}
                </div>
              )}

              <div className="mt-4 text-xs text-neutral-500">
                MVP note: roll submission writes into <code className="rounded bg-neutral-950 px-1">session_state.roll_results</code>.
                Realtime feed comes next phase.
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 text-xs text-neutral-400">
              Session ID: <span className="text-neutral-200">{sessionId}</span>
              <br />
              Episode ID: <span className="text-neutral-200">{(session as any).episode_id ?? "—"}</span>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
