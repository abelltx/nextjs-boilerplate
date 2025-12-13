import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function supabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // READ ONLY in Server Components / Pages
        getAll() {
          return cookieStore.getAll();
        },
        // No-op: Next 16 forbids setting cookies here
        setAll() {},
      },
    }
  );
}
