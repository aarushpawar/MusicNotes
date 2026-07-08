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
    if (!username || !password) throw new Error("Username and password are required.");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id,username")
      .eq("username", username)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) throw new Error("Invalid username or password.");

    const { data: userLookup, error: userLookupError } = await admin.auth.admin.getUserById(profile.id);
    if (userLookupError) throw userLookupError;
    const email = userLookup.user?.email;
    if (!email) throw new Error("Invalid username or password.");

    const authClient = createClient(supabaseUrl, anonKey);
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });
    if (error) throw new Error("Invalid username or password.");

    return new Response(JSON.stringify({ ...data.session, user: data.user, profile }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Login failed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400
    });
  }
});
