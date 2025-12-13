import { supabaseServer } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  email: string;
  role: "player" | "storyteller" | string;
};

export async function getProfile() {
  const supabase = await supabaseServer();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { user: null, profile: null };

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id,email,role")
    .eq("id", user.id)
    .single();

  if (error) {
    return { user, profile: null };
  }

  return { user, profile: profile as Profile };
}
