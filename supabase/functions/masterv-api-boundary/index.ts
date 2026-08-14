import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  return new Response(JSON.stringify({
    service: "masterv-hosted-api",
    contract_version: "mv-hosted-api-v1",
    authenticated: true,
    capabilities: {
      boundary_probe: true,
      analyze: false,
      youtube_discovery: false,
      product_truth: false
    }
  }), { status: 200, headers });
});
