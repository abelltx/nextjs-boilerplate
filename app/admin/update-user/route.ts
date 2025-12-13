import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

type Body = {
  userId: string;
  set?: Partial<{ is_storyteller: boolean; is_admin: boolean }>;
};

export async function POST(request: Request) {
  const supabase = await supabaseServer();

  // 1) Must be signed in
  const { data: userData } = await supabase.auth.getUser();
  const me = userData.user;
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 2) Must be admin
  const { data: myProfile, error: myErr } = await supabase
    .from("profiles")
    .select("id,is_admin")
    .eq("id", me.id)
    .single();

  if (myErr || !myProfile?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3) Parse body
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.userId || !body.set) {
    return NextResponse.json({ error: "Missing userId or set" }, { status: 400 });
  }

  const patch: Record<string, boolean> = {};
  if (typeof body.set.is_storyteller === "boolean") patch.is_storyteller = body.set.is_storyteller;
  if (typeof body.set.is_admin === "boolean") patch.is_admin = body.set.is_admin;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // Guardrail: prevent accidental self-demotion from admin
  if (body.userId === me.id && patch.is_admin === false) {
    return NextResponse.json(
      { error: "Refusing to remove your own admin access (guardrail)." },
      { status: 400 }
    );
  }

  // 4) Update
  const { error: updErr } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", body.userId);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
