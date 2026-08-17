const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const apiBaseUrl = (process.env.NEXT_PUBLIC_MASTERV_API_BASE_URL || "").replace(/\/+$/, "");
const apikey = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "").trim();
const email = (process.env.SUPABASE_TEST_EMAIL || "").trim();
const password = process.env.SUPABASE_TEST_PASSWORD || "";

for (const [name, value] of Object.entries({ supabaseUrl, apiBaseUrl, apikey, email, password })) {
  if (!value) throw new Error(`${name} is required`);
}

const login = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password })
});
if (!login.ok) throw new Error(`Supabase login failed (${login.status})`);
const session = await login.json();
if (!session?.access_token) throw new Error("Supabase login returned no access token");

const response = await fetch(`${apiBaseUrl}/masterv-update-channel?current_version=0.1.1&target=windows-x86_64`, {
  headers: {
    apikey,
    Authorization: `Bearer ${session.access_token}`
  },
  redirect: "manual"
});

if (response.status !== 204) {
  const text = await response.text();
  throw new Error(`Expected empty private update channel (204), received ${response.status}: ${text}`);
}

console.log(JSON.stringify({
  status: "MASTERV_PRIVATE_UPDATE_CHANNEL_EMPTY_PASS",
  authenticated: true,
  current_version: "0.1.1",
  target: "windows-x86_64",
  available_update: false
}));
