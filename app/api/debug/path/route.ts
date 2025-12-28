import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  return NextResponse.json({
    requestUrl: req.url,
    pathname: url.pathname,
    search: url.search,
    headers: {
      host: (req as any).headers?.get?.("host") ?? null,
      "x-vercel-id": (req as any).headers?.get?.("x-vercel-id") ?? null,
      "x-forwarded-host": (req as any).headers?.get?.("x-forwarded-host") ?? null,
      "x-forwarded-uri": (req as any).headers?.get?.("x-forwarded-uri") ?? null,
    },
  });
}
