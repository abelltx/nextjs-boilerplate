import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;

  // Project ref is the subdomain portion: https://<ref>.supabase.co
  const projectRef =
    url && url.includes("https://") ? url.replace("https://", "").split(".")[0] : null;

  return NextResponse.json({
    supabaseUrl: url,
    projectRef,
  });
}
