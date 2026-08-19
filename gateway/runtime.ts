import type { GatewayDependencies } from "./contracts";
import { GeminiAiProvider } from "./providers/gemini-ai-provider";
import { YouTubeDiscoveryGatewayProvider } from "./providers/youtube-discovery-provider";

export function createGatewayProviderRuntime(env: NodeJS.ProcessEnv = process.env): GatewayDependencies {
  const geminiKey = env.GEMINI_API_KEY?.trim() || "";
  const youtubeKey = env.YOUTUBE_DATA_API_KEY?.trim() || "";

  return Object.freeze({
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
