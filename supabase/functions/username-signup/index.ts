import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { username, password } = await req.json();
    if (!/^[a-zA-Z0-9_]{3,32}$/.test(username ?? "")) {
      throw new Error("Username must be 3-32 letters, numbers, or underscores.");
    }
    if (!password || password.length < 8) throw new Error("Password must be at least 8 characters.");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: existing } = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
    if (existing) throw new Error("Username is already taken.");

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: `${crypto.randomUUID()}@spotify-song-notes.local`,
      password,
      email_confirm: true,
      user_metadata: { username }
    });
    if (createError) throw createError;
    if (!created.user) throw new Error("Could not create user.");

    const profile = { id: created.user.id, username };
    const { error: profileError } = await admin.from("profiles").insert(profile);
    if (profileError) throw profileError;

    const authClient = createClient(supabaseUrl, anonKey);
    const { data, error } = await authClient.auth.signInWithPassword({
      email: created.user.email!,
      password
    });
    if (error) throw error;

    return new Response(JSON.stringify({ ...data.session, user: data.user, profile }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Signup failed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400
    });
  }
});
