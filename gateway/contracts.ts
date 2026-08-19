import type { SearchOptions } from "@/lib/discovery";
import type { VideoAnalysis } from "@/lib/analysis-schema";
import type { ProductTruthInput, SingleVideoProductionGuide } from "@/lib/single-video-production";
import type { YouTubeDiscoveryResult } from "@/lib/youtube-discovery-core";

export type GatewayCapability = "discovery" | "analyze" | "guidance";

export const GATEWAY_USAGE_UNITS: Readonly<Record<GatewayCapability, number>> = Object.freeze({
  discovery: 0,
  analyze: 5,
  guidance: 1
});

export type GatewayPrincipal = Readonly<{
  subject: string;
  session_id: string;
  device_id: string;
  customer_id: string;
  license_id: string;
  activation_id: string;
}>;

export type GatewayEntitlement = Readonly<{
  license_status: "active" | "inactive" | "expired" | "suspended";
  subscription_status:
    | "trial"
    | "active"
    | "past_due"
    | "cancel_at_period_end"
    | "inactive"
    | "expired"
    | "none";
  grace_active: boolean;
  plan: string | null;
  owner: boolean;
  current_period_end: string | null;
  device_limit: number | null;
  usage_remaining: number | null;
  capabilities: Readonly<Record<GatewayCapability, boolean>>;
}>;

export type GatewayUsageDecision = Readonly<{
  allowed: boolean;
  reason?: string;
  remaining?: number | null;
  required_units?: number;
}>;

export type GatewayUsageReceipt = Readonly<{
  capability: GatewayCapability;
  charged_units: number;
  external_id?: string;
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
    required_units: number;
  }): Promise<GatewayUsageDecision>;
  record(input: {
    principal: GatewayPrincipal;
    entitlement: GatewayEntitlement;
    capability: GatewayCapability;
    charged_units: number;
    operation_id: string;
  }): Promise<GatewayUsageReceipt>;
}

export interface GatewayLicenseProvider {
  activate(input: unknown): Promise<unknown>;
  createSession(input: unknown, deviceCredential: string): Promise<unknown>;
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
