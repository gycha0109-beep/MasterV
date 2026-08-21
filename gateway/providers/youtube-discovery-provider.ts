import {
  discoverYouTubeCandidatesWithKey,
  YouTubeDiscoveryError
} from "@/lib/youtube-discovery-core";
import type { GatewayDiscoveryProvider } from "../contracts";
import { GatewayError } from "../errors";

const QUOTA_REASONS = new Set(["quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded"]);
const CONFIG_REASONS = new Set(["keyInvalid", "accessNotConfigured", "ipRefererBlocked"]);

export class YouTubeDiscoveryGatewayProvider implements GatewayDiscoveryProvider {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey.trim();
    if (!this.apiKey) throw new Error("YOUTUBE_DATA_API_KEY is required");
  }

  async discoverYouTube(query: string, options: Parameters<GatewayDiscoveryProvider["discoverYouTube"]>[1]) {
    try {
      return await discoverYouTubeCandidatesWithKey(query, options, { api_key: this.apiKey });
    } catch (error) {
      if (error instanceof YouTubeDiscoveryError) {
        if (error.reason && QUOTA_REASONS.has(error.reason)) throw new GatewayError(429, "GATEWAY_DISCOVERY_QUOTA", error.message);
        if (error.reason && CONFIG_REASONS.has(error.reason)) throw new GatewayError(503, "GATEWAY_DISCOVERY_NOT_CONFIGURED", error.message);
        throw new GatewayError(502, "GATEWAY_DISCOVERY_UPSTREAM", error.message);
      }
      throw new GatewayError(502, "GATEWAY_DISCOVERY_UPSTREAM", "YouTube discovery request failed.");
    }
  }
}
