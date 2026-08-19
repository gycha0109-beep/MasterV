import type { GatewayDependencies } from "./contracts";
import { GatewayCredentialCodec } from "./credentials";
import { GeminiAiProvider } from "./providers/gemini-ai-provider";
import { PolarGatewayAuthorityProvider } from "./providers/polar-authority-provider";
import { PolarHttpClient } from "./providers/polar-http-client";
import { YouTubeDiscoveryGatewayProvider } from "./providers/youtube-discovery-provider";

function optionalPositiveInteger(value: string | undefined) {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`Invalid positive integer runtime setting: ${value}`);
  return parsed;
}

export function createGatewayProviderRuntime(env: NodeJS.ProcessEnv = process.env): GatewayDependencies {
  const geminiKey = env.GEMINI_API_KEY?.trim() || "";
  const youtubeKey = env.YOUTUBE_DATA_API_KEY?.trim() || "";
  const polarAccessToken = env.POLAR_ACCESS_TOKEN?.trim() || "";
  const polarOrganizationId = env.POLAR_ORGANIZATION_ID?.trim() || "";
  const credentialSigningSecret = env.GATEWAY_CREDENTIAL_SIGNING_SECRET?.trim() || "";
  const polarConfiguredValues = [polarAccessToken, polarOrganizationId, credentialSigningSecret].filter(Boolean).length;

  if (polarConfiguredValues > 0 && polarConfiguredValues < 3) {
    throw new Error("Polar authority requires POLAR_ACCESS_TOKEN, POLAR_ORGANIZATION_ID, and GATEWAY_CREDENTIAL_SIGNING_SECRET together.");
  }

  let polarAuthority: PolarGatewayAuthorityProvider | undefined;
  if (polarConfiguredValues === 3) {
    const polarClient = new PolarHttpClient({
      access_token: polarAccessToken,
      organization_id: polarOrganizationId,
      base_url: env.POLAR_API_BASE_URL
    });
    const credentialCodec = new GatewayCredentialCodec({
      secret: credentialSigningSecret,
      device_ttl_seconds: optionalPositiveInteger(env.GATEWAY_DEVICE_CREDENTIAL_TTL_SECONDS),
      session_ttl_seconds: optionalPositiveInteger(env.GATEWAY_SESSION_CREDENTIAL_TTL_SECONDS)
    });
    polarAuthority = new PolarGatewayAuthorityProvider({
      client: polarClient,
      credentials: credentialCodec,
      ai_meter_id: env.POLAR_AI_METER_ID,
      usage_event_name: env.POLAR_USAGE_EVENT_NAME,
      plan_metadata_key: env.POLAR_PLAN_METADATA_KEY
    });
  }

  return Object.freeze({
    ...(polarAuthority ? {
      license: polarAuthority,
      billing: polarAuthority,
      credential: polarAuthority,
      entitlement: polarAuthority,
      usage: polarAuthority
    } : {}),
    ...(geminiKey ? {
      ai: new GeminiAiProvider({
        api_key: geminiKey,
        analysis_model: env.GEMINI_MODEL,
        guidance_model: env.GEMINI_PRODUCT_TRUTH_MODEL
      })
    } : {}),
    ...(youtubeKey ? { discovery: new YouTubeDiscoveryGatewayProvider(youtubeKey) } : {})
  });
}
