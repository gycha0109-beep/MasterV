import type { SearchOptions } from "@/lib/discovery";
import type { VideoAnalysis } from "@/lib/analysis-schema";
import type { ProductTruthInput, SingleVideoProductionGuide } from "@/lib/single-video-production";
import type { YouTubeDiscoveryResult } from "@/lib/youtube-discovery-core";

export type GatewayCapability = "discovery" | "analyze" | "guidance";

export type GatewayPrincipal = Readonly<{
  subject: string;
  session_id: string;
  device_id: string;
}>;

export type GatewayEntitlement = Readonly<{
  license_status: "active" | "inactive" | "expired" | "suspended";
  subscription_status: "active" | "inactive" | "expired" | "past_due" | "none";
  plan: string | null;
  capabilities: Readonly<Record<GatewayCapability, boolean>>;
}>;

export type GatewayUsageDecision = Readonly<{
  allowed: boolean;
  reason?: string;
  remaining?: number | null;
}>;

export type GatewayUsageReceipt = Readonly<{
  capability: GatewayCapability;
  charged_units: number;
}>;

export type GatewayAnalyzeResult = Readonly<{
  provider: "gemini";
  model: string;
  analysis: VideoAnalysis;
  derived_metrics: unknown;
}>;

export type GatewayGuidanceResult = Readonly<{
  provider: "gemini" | "none";
  model: string | null;
  guide: SingleVideoProductionGuide;
  gemini_requests: number;
}>;

export interface GatewayCredentialProvider {
  verifySession(credential: string): Promise<GatewayPrincipal>;
}

export interface GatewayEntitlementProvider {
  getEntitlement(principal: GatewayPrincipal): Promise<GatewayEntitlement>;
}

export interface GatewayUsageProvider {
  authorize(input: {
    principal: GatewayPrincipal;
    entitlement: GatewayEntitlement;
    capability: GatewayCapability;
  }): Promise<GatewayUsageDecision>;
  record(input: {
    principal: GatewayPrincipal;
    capability: GatewayCapability;
    charged_units: number;
  }): Promise<GatewayUsageReceipt>;
}

export interface GatewayLicenseProvider {
  activate(input: unknown): Promise<unknown>;
  createSession(input: unknown): Promise<unknown>;
}

export interface GatewayBillingProvider {
  getEntitlement(principal: GatewayPrincipal): Promise<GatewayEntitlement>;
}

export interface GatewayAiProvider {
  analyzeYouTube(url: string): Promise<GatewayAnalyzeResult>;
  generateProductionGuidance(input: {
    analysis: VideoAnalysis;
    product_truth: ProductTruthInput;
  }): Promise<GatewayGuidanceResult>;
}

export interface GatewayDiscoveryProvider {
  discoverYouTube(query: string, options: SearchOptions): Promise<YouTubeDiscoveryResult>;
}

export type GatewayDependencies = Readonly<{
  credential?: GatewayCredentialProvider;
  entitlement?: GatewayEntitlementProvider;
  usage?: GatewayUsageProvider;
  license?: GatewayLicenseProvider;
  billing?: GatewayBillingProvider;
  ai?: GatewayAiProvider;
  discovery?: GatewayDiscoveryProvider;
}>;
