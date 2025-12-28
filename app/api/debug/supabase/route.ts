import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;

  const projectRef =
    url && url.startsWith("https://")
      ? url.replace("https://", "").split(".")[0]
      : null;

  return NextResponse.json({
    supabaseUrl: url,
    projectRef,
  });
}
