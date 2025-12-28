import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);

  return NextResponse.json({
    requestUrl: req.url,
    pathname: url.pathname,
    search: url.search,
    forwarded: {
      host: (req as any).headers?.get?.("x-forwarded-host") ?? null,
      uri: (req as any).headers?.get?.("x-forwarded-uri") ?? null,
      proto: (req as any).headers?.get?.("x-forwarded-proto") ?? null,
    },
    vercel: {
      id: (req as any).headers?.get?.("x-vercel-id") ?? null,
    },
    note: "Append ?p=... to echo what the browser is trying to access.",
    query: Object.fromEntries(url.searchParams.entries()),
  });
}
