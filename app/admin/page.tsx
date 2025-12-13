@'
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/getProfile";
import AdminClient from "./AdminClient";

type Row = {
  id: string;
  email: string;
  is_storyteller: boolean;
  is_admin: boolean;
};

export default async function AdminPage() {
  const { user, profile } = await getProfile();
  if (!user) redirect("/login");
  if (!profile?.is_admin) redirect("/player");

  const supabase = await supabaseServer();

  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,is_storyteller,is_admin")
    .order("email", { ascending: true });

  if (error) throw new Error(error.message);

  return (
    <AdminClient
      meId={user.id}
      meEmail={user.email ?? ""}
      rows={(data ?? []) as Row[]}
    />
  );
}
'@ | Set-Content -Path .\app\admin\page.tsx -Encoding utf8
