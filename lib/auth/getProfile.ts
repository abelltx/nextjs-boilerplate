import { supabaseServer } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  email: string;
  is_storyteller: boolean;
  is_admin: boolean;
};

export async function getProfile() {
  const supabase = await supabaseServer();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  const user = userData.user;

  if (userErr) console.error("getUser error:", userErr);
  if (!user) return { user: null, profile: null };

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id,email,is_storyteller,is_admin")
    .eq("id", user.id)
    .single();

  if (error) console.error("profiles select error:", error);

  if (error) return { user, profile: null };
  return { user, profile: profile as Profile };
}
