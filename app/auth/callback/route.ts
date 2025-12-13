import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", url.origin));
  }

  // We'll write cookies onto the response
  let response = NextResponse.redirect(new URL("/player", url.origin));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // Read cookies from the incoming request (sync)
        getAll() {
          return request.headers
            .get("cookie")
            ?.split(";")
            .map((c) => c.trim())
            .filter(Boolean)
            .map((c) => {
              const idx = c.indexOf("=");
              return {
                name: idx >= 0 ? c.slice(0, idx) : c,
                value: idx >= 0 ? c.slice(idx + 1) : "",
              };
            }) ?? [];
        },
        // Write cookies to the outgoing response
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/login?error=callback_failed", url.origin));
  }

  return response;
}
