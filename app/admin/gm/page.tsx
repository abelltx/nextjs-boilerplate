import Link from "next/link";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

type Counts = {
  episodes: number;
  npcs: number;
  traits: number;
  actions: number;
  items: number;
  users: number;
  sessions: number;
  sessionPlayers: number;
  episodeBlocks: number;
};

type Card = {
  title: string;
  description: string;
  href?: string;
  count: number;
  status?: "live" | "coming";
  tone: "orange" | "blue" | "green" | "purple" | "red" | "slate" | "amber";
};

type WorkflowStep = {
  id: string;
  label: string;
  description: string;
  href?: string;
  current: number;
  target: number;
};

type WorkflowPhase = {
  title: string;
  objective: string;
  steps: WorkflowStep[];
};

const WORKFLOW_DONE_COOKIE = "gm_workflow_done";

async function safeCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string
) {
  const { count, error } = await supabase
    .from(table as any)
    .select("*", { count: "exact", head: true });

  if (error) return 0;
  return count ?? 0;
}

async function getCounts(): Promise<Counts> {
  const supabase = await createClient();

  const [
    episodes,
    npcs,
    traits,
    actions,
    items,
    users,
    sessions,
    sessionPlayers,
    episodeBlocks,
  ] = await Promise.all([
    safeCount(supabase, "episodes"),
    safeCount(supabase, "npcs"),
    safeCount(supabase, "traits"),
    safeCount(supabase, "actions"),
    safeCount(supabase, "items"),
    safeCount(supabase, "profiles"),
    safeCount(supabase, "sessions"),
    safeCount(supabase, "session_players"),
    safeCount(supabase, "episode_blocks"),
  ]);

  return {
    episodes,
    npcs,
    traits,
    actions,
    items,
    users,
    sessions,
    sessionPlayers,
    episodeBlocks,
  };
}

function toneClasses(tone: Card["tone"]) {
  switch (tone) {
    case "orange":
      return "border-orange-200 bg-orange-50/60 hover:bg-orange-50";
    case "blue":
      return "border-blue-200 bg-blue-50/60 hover:bg-blue-50";
    case "green":
      return "border-green-200 bg-green-50/60 hover:bg-green-50";
    case "purple":
      return "border-purple-200 bg-purple-50/60 hover:bg-purple-50";
    case "red":
      return "border-red-200 bg-red-50/60 hover:bg-red-50";
    case "amber":
      return "border-amber-200 bg-amber-50/60 hover:bg-amber-50";
    default:
      return "border-slate-200 bg-slate-50/60 hover:bg-slate-50";
  }
}

function StatusPill({ status }: { status: "live" | "coming" }) {
  const cls =
    status === "live"
      ? "bg-green-100 text-green-800 border-green-200"
      : "bg-slate-100 text-slate-700 border-slate-200";

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${cls}`}>
      {status === "live" ? "Live" : "Coming"}
    </span>
  );
}

function CountBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center rounded-full border bg-white/70 px-2 py-0.5 text-xs font-medium">
      {n}
    </span>
  );
}

function CardTile({ c }: { c: Card }) {
  const content = (
    <div className={`rounded-xl border p-4 transition ${toneClasses(c.tone)}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight">{c.title}</div>
          <div className="mt-1 text-xs leading-snug text-muted-foreground">{c.description}</div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <CountBadge n={c.count} />
          {c.status ? <StatusPill status={c.status} /> : null}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-mono">{c.href ? c.href : "Not wired yet"}</span>
        <span className="inline-flex items-center rounded-md border bg-white/70 px-2 py-1 text-xs">
          {c.href ? "Open ->" : "Soon"}
        </span>
      </div>
    </div>
  );

  return c.href ? <Link href={c.href}>{content}</Link> : content;
}

function pct(current: number, target: number) {
  if (target <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
}

function parseManualDone(raw: string | undefined): Set<string> {
  if (!raw) return new Set<string>();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.filter((v) => typeof v === "string"));
  } catch {
    return new Set<string>();
  }
}

function stepAutoDone(step: WorkflowStep) {
  return step.current >= step.target;
}

function stepDone(step: WorkflowStep, manualDone: Set<string>) {
  return stepAutoDone(step) || manualDone.has(step.id);
}

function phaseDone(phase: WorkflowPhase, manualDone: Set<string>) {
  return phase.steps.every((s) => stepDone(s, manualDone));
}

function phaseProgress(phase: WorkflowPhase, manualDone: Set<string>) {
  const done = phase.steps.filter((s) => stepDone(s, manualDone)).length;
  return pct(done, phase.steps.length);
}

function workflowFromCounts(counts: Counts): WorkflowPhase[] {
  return [
    {
      title: "Point A: Storyteller Dashboard",
      objective: "Run live sessions smoothly from the storyteller side.",
      steps: [
        {
          id: "pa_session_runtime",
          label: "Session runtime stable",
          description: "Session join/present/clear flow works with no reload confusion.",
          href: "/storyteller/sessions",
          current: counts.sessions > 0 ? 1 : 0,
          target: 1,
        },
        {
          id: "pa_episode_assignment",
          label: "Episode assignment flow",
          description: "Storyteller can pick/switch episode on session page reliably.",
          href: "/storyteller/sessions",
          current: counts.episodes > 0 && counts.sessions > 0 ? 1 : 0,
          target: 1,
        },
        {
          id: "pa_roll_requests",
          label: "Roll request loop",
          description: "Roll prompts from storyteller route to players and results come back.",
          href: "/storyteller/sessions",
          current: counts.sessionPlayers > 0 ? 1 : 0,
          target: 1,
        },
      ],
    },
    {
      title: "Point B: Episode Mechanics",
      objective: "Build reusable runtime components for episode execution.",
      steps: [
        {
          id: "pb_scene_map",
          label: "1) SceneMap",
          description: "Intro image + marker hotspots for scene exploration.",
          href: "/admin/episodes",
          current: 0,
          target: 1,
        },
        {
          id: "pb_reveal_bridge",
          label: "2) RevealCard + PresenterBridge",
          description: "Click marker, reveal linked card, and present instantly to player stage.",
          href: "/storyteller/sessions",
          current: 0,
          target: 1,
        },
        {
          id: "pb_sequence_rail",
          label: "3) SequenceRail",
          description: "Linear scene runner with next/back/present controls for live pacing.",
          href: "/storyteller/sessions",
          current: 0,
          target: 1,
        },
        {
          id: "pb_check_prompt",
          label: "4) CheckPrompt",
          description: "Reusable skill/ability check request and response loop.",
          href: "/storyteller/sessions",
          current: 0,
          target: 1,
        },
        {
          id: "pb_encounter_lite",
          label: "5) EncounterLite",
          description: "Initiative + HP/damage controls for lightweight battle running.",
          href: "/storyteller/sessions",
          current: 0,
          target: 1,
        },
      ],
    },
    {
      title: "Point C: Player Dashboard",
      objective: "Ensure player-side experience mirrors storyteller intent.",
      steps: [
        {
          id: "pc_stage_render",
          label: "Stage rendering parity",
          description: "Players see exactly what storyteller presents (image, text, marker context).",
          href: "/player",
          current: counts.sessionPlayers > 0 ? 1 : 0,
          target: 1,
        },
        {
          id: "pc_character_interaction",
          label: "Character interaction loop",
          description: "Player skills, inventory effects, and roll actions are usable in live session.",
          href: "/player",
          current: counts.items > 0 ? 1 : 0,
          target: 1,
        },
      ],
    },
    {
      title: "Content Library",
      objective: "Establish your core content libraries and build baseline.",
      steps: [
        {
          id: "p1_episode_shell",
          label: "Create episode shell",
          description: "At least 1 episode ready for story blocks.",
          href: "/admin/episodes",
          current: counts.episodes,
          target: 1,
        },
        {
          id: "p1_npc_roster",
          label: "Create NPC roster",
          description: "At least 3 NPCs available for encounters.",
          href: "/admin/designer",
          current: counts.npcs,
          target: 3,
        },
        {
          id: "p1_actions_library",
          label: "Create actions library",
          description: "At least 8 actions across attack and utility.",
          href: "/admin/actions",
          current: counts.actions,
          target: 8,
        },
        {
          id: "p1_traits_library",
          label: "Create trait library",
          description: "At least 8 traits for player and NPC variation.",
          href: "/admin/traits",
          current: counts.traits,
          target: 8,
        },
        {
          id: "p1_item_library",
          label: "Create item library",
          description: "At least 10 items for rewards and gear testing.",
          href: "/admin/items",
          current: counts.items,
          target: 10,
        },
      ],
    },
    {
      title: "Playtest Cadence",
      objective: "Run one complete session loop from stage prompt to reward.",
      steps: [
        {
          id: "p2_storyboard_blocks",
          label: "Build storyboard blocks",
          description: "At least 6 blocks available for presenting to players.",
          href: "/admin/episodes",
          current: counts.episodeBlocks,
          target: 6,
        },
        {
          id: "p2_test_sessions",
          label: "Create test sessions",
          description: "At least 2 sessions for playtesting iterations.",
          href: "/storyteller/sessions",
          current: counts.sessions,
          target: 2,
        },
        {
          id: "p2_player_joins",
          label: "Get player joins",
          description: "At least 2 joined player records for live tests.",
          href: "/storyteller/sessions",
          current: counts.sessionPlayers,
          target: 2,
        },
      ],
    },
    {
      title: "Production Readiness",
      objective: "Scale quality, reliability, and operations before content burst.",
      steps: [
        {
          id: "p3_expand_episodes",
          label: "Expand episode catalog",
          description: "Reach 3 episodes to validate repeatable content flow.",
          href: "/admin/episodes",
          current: counts.episodes,
          target: 3,
        },
        {
          id: "p3_expand_items",
          label: "Expand item catalog",
          description: "Reach 30 items to stress inventory and effects.",
          href: "/admin/items",
          current: counts.items,
          target: 30,
        },
        {
          id: "p3_expand_sessions",
          label: "Expand live session activity",
          description: "Reach 8 sessions to prove operating cadence.",
          href: "/storyteller/sessions",
          current: counts.sessions,
          target: 8,
        },
      ],
    },
  ];
}

function WorkflowBoard({
  phases,
  manualDone,
  onToggleManualDone,
  onResetManualDone,
}: {
  phases: WorkflowPhase[];
  manualDone: Set<string>;
  onToggleManualDone: (formData: FormData) => Promise<void>;
  onResetManualDone: () => Promise<void>;
}) {
  const totalSteps = phases.reduce((n, p) => n + p.steps.length, 0);
  const doneSteps = phases.reduce(
    (n, p) => n + p.steps.filter((s) => stepDone(s, manualDone)).length,
    0
  );
  const overall = pct(doneSteps, totalSteps);

  const nextStep =
    phases
      .flatMap((phase) =>
        phase.steps
          .filter((step) => !stepDone(step, manualDone))
          .map((step) => ({ phase: phase.title, step }))
      )
      .at(0) ?? null;

  return (
    <div className="mt-8 rounded-xl border bg-white p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-base font-semibold">Build Workflow</h2>
          <p className="text-sm text-muted-foreground">
            Track progress across foundations, playable loop, and production readiness.
          </p>
        </div>

        <div className="w-full md:w-80">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Overall Progress</span>
            <span className="font-medium">{doneSteps}/{totalSteps} steps</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-200">
            <div className="h-2 rounded-full bg-slate-700" style={{ width: `${overall}%` }} />
          </div>
        </div>
      </div>
      <div className="mt-3">
        <form action={onResetManualDone}>
          <button
            type="submit"
            className="rounded-md border bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
          >
            Reset manual checks
          </button>
        </form>
      </div>

      {nextStep ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          <span className="font-semibold">Next up:</span>{" "}
          {nextStep.phase} - {nextStep.step.label}
          {nextStep.step.href ? (
            <>
              {" "}
              <Link href={nextStep.step.href} className="underline">
                Open
              </Link>
            </>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm">
          All workflow steps are complete. You can tighten balancing and expand content safely.
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {phases.map((phase) => {
          const done = phaseDone(phase, manualDone);
          const p = phaseProgress(phase, manualDone);
          return (
            <div key={phase.title} className="rounded-xl border bg-slate-50/40 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{phase.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{phase.objective}</div>
                </div>
                <span
                  className={[
                    "rounded-full border px-2 py-0.5 text-[11px]",
                    done
                      ? "border-green-200 bg-green-100 text-green-800"
                      : p > 0
                      ? "border-blue-200 bg-blue-100 text-blue-800"
                      : "border-slate-200 bg-slate-100 text-slate-700",
                  ].join(" ")}
                >
                  {done ? "Done" : p > 0 ? "In progress" : "Not started"}
                </span>
              </div>

              <div className="mt-3 h-2 w-full rounded-full bg-slate-200">
                <div className="h-2 rounded-full bg-slate-700" style={{ width: `${p}%` }} />
              </div>

              <div className="mt-3 space-y-2">
                {phase.steps.map((step) => {
                  const auto = stepAutoDone(step);
                  const manual = manualDone.has(step.id);
                  const doneStep = stepDone(step, manualDone);
                  return (
                    <div key={step.label} className="rounded-md border bg-white px-2 py-2 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium">
                            {doneStep ? "[x] " : "[ ] "}
                            {step.label}
                          </div>
                          <div className="mt-0.5 text-muted-foreground">{step.description}</div>
                        </div>
                        <div className="shrink-0 rounded-full border bg-slate-50 px-2 py-0.5 font-mono">
                          {step.current}/{step.target}
                        </div>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        {auto ? (
                          <span className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[11px] text-green-800">
                            Auto complete
                          </span>
                        ) : manual ? (
                          <span className="rounded-full border border-blue-200 bg-blue-100 px-2 py-0.5 text-[11px] text-blue-800">
                            Manually complete
                          </span>
                        ) : null}
                      </div>
                      {step.href ? (
                        <div className="mt-1">
                          <Link href={step.href} className="text-[11px] underline">
                            Open
                          </Link>
                        </div>
                      ) : null}
                      {!auto ? (
                        <div className="mt-1">
                          <form action={onToggleManualDone}>
                            <input type="hidden" name="step_id" value={step.id} />
                            <button
                              type="submit"
                              className="rounded-md border bg-white px-2 py-1 text-[11px] hover:bg-slate-50"
                            >
                              {manual ? "Unmark" : "Mark done"}
                            </button>
                          </form>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default async function GMHubPage() {
  const counts = await getCounts();
  const phases = workflowFromCounts(counts);
  const cookieStore = await cookies();
  const manualDone = parseManualDone(cookieStore.get(WORKFLOW_DONE_COOKIE)?.value);

  async function toggleManualDone(formData: FormData) {
    "use server";
    const stepId = String(formData.get("step_id") ?? "").trim();
    if (!stepId) return;

    const store = await cookies();
    const currentSet = parseManualDone(store.get(WORKFLOW_DONE_COOKIE)?.value);

    if (currentSet.has(stepId)) currentSet.delete(stepId);
    else currentSet.add(stepId);

    const list = JSON.stringify(Array.from(currentSet.values()).sort());
    store.set(WORKFLOW_DONE_COOKIE, list, {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 180,
    });
    revalidatePath("/admin/gm");
  }

  async function resetManualDone() {
    "use server";
    const store = await cookies();
    store.delete(WORKFLOW_DONE_COOKIE);
    revalidatePath("/admin/gm");
  }

  const cards: Card[] = [
    {
      title: "Episodes Designer",
      description: "Build storyboards, scenes, encounters, and episode assets.",
      href: "/admin/episodes",
      count: counts.episodes,
      status: "live",
      tone: "orange",
    },
    {
      title: "NPC Designer",
      description: "Create NPCs, stats, trait sets, and action kits.",
      href: "/admin/designer",
      count: counts.npcs,
      status: "live",
      tone: "blue",
    },
    {
      title: "Traits Designer",
      description: "Manage the global trait library used by NPCs and players.",
      href: "/admin/traits",
      count: counts.traits,
      status: "live",
      tone: "purple",
    },
    {
      title: "Actions Designer",
      description: "Manage the global action library (melee/ranged/other).",
      href: "/admin/actions",
      count: counts.actions,
      status: "live",
      tone: "green",
    },
    {
      title: "Inventory Designer",
      description: "Items, loot tables, equipment cards, and rewards.",
      href: "/admin/items",
      count: counts.items,
      status: "live",
      tone: "amber",
    },
    {
      title: "User Manager",
      description: "Manage Storytellers, players, roles, and access.",
      href: undefined,
      count: counts.users,
      status: "coming",
      tone: "red",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="text-center">
        <h1 className="text-lg font-semibold">GameMaster Hub</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your command center for building and running Neweyes content.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {cards.map((c) => (
          <CardTile key={c.title} c={c} />
        ))}
      </div>

      <div className="mt-6 rounded-xl border bg-amber-50/50 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold">Point B Sprint</div>
            <div className="text-xs text-muted-foreground">
              Focus this sprint on Point B components first, then wire them into Episode Zero.
            </div>
          </div>
          <Link
            href="/admin/episodes"
            className="inline-flex items-center rounded-md border bg-white px-3 py-2 text-xs font-semibold hover:bg-slate-50"
          >
            Open Episode Builder
          </Link>
        </div>
      </div>

      <WorkflowBoard
        phases={phases}
        manualDone={manualDone}
        onToggleManualDone={toggleManualDone}
        onResetManualDone={resetManualDone}
      />

      <div className="mt-6 rounded-xl border bg-slate-50/50 p-4 text-xs text-muted-foreground">
        <div className="font-semibold text-slate-700">Quick setup notes</div>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            This page is at <span className="font-mono">/admin/gm</span>.
          </li>
          <li>
            Counts use <span className="font-mono">head: true</span> so it is fast.
          </li>
          <li>
            Missing tables show as <span className="font-mono">0</span> instead of crashing.
          </li>
          <li>
            Workflow targets are editable in <span className="font-mono">app/admin/gm/page.tsx</span>.
          </li>
          <li>Use Mark done for development milestones that are complete but not count-driven.</li>
        </ul>
      </div>
    </div>
  );
}
