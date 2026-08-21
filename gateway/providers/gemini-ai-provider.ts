import { deriveVideoMetrics } from "@/lib/derived-metrics";
import { analyzeYouTubeVideoWithKey, DEFAULT_DEEP_GEMINI_MODEL } from "@/lib/gemini-deep-core";
import { normalizeGeminiError } from "@/lib/gemini-error";
import {
  DEFAULT_PRODUCT_TRUTH_MODEL,
  interpretProductTruthAgainstReferenceWithKey
} from "@/lib/product-truth-interpreter-core";
import { compileSingleVideoProductionGuide } from "@/lib/single-video-production";
import type { GatewayAiProvider } from "../contracts";
import { GatewayError } from "../errors";

export class GeminiAiProvider implements GatewayAiProvider {
  private readonly apiKey: string;
  private readonly analysisModel: string;
  private readonly guidanceModel: string;

  constructor(options: {
    api_key: string;
    analysis_model?: string;
    guidance_model?: string;
  }) {
    this.apiKey = options.api_key.trim();
    if (!this.apiKey) throw new Error("GEMINI_API_KEY is required");
    this.analysisModel = options.analysis_model?.trim() || DEFAULT_DEEP_GEMINI_MODEL;
    this.guidanceModel = options.guidance_model?.trim() || options.analysis_model?.trim() || DEFAULT_PRODUCT_TRUTH_MODEL;
  }

  async analyzeYouTube(url: string) {
    try {
      const analysis = await analyzeYouTubeVideoWithKey(url, {
        api_key: this.apiKey,
        model: this.analysisModel
      });
      return {
        provider: "gemini" as const,
        model: this.analysisModel,
        analysis,
        derived_metrics: deriveVideoMetrics(analysis)
      };
    } catch (error) {
      const normalized = normalizeGeminiError(error);
      if (normalized.is_rate_limit) throw new GatewayError(429, "GATEWAY_AI_RATE_LIMIT", normalized.message);
      throw new GatewayError(502, "GATEWAY_AI_UPSTREAM", normalized.message);
    }
  }

  async generateProductionGuidance(input: Parameters<GatewayAiProvider["generateProductionGuidance"]>[0]) {
    const derivedMetrics = deriveVideoMetrics(input.analysis);
    const initialGuide = compileSingleVideoProductionGuide(input.analysis, derivedMetrics, input.product_truth);
    const shouldInterpret = initialGuide.interpretation_required && initialGuide.reference_mechanisms.length > 0;
    if (!shouldInterpret) {
      return {
        provider: "none" as const,
        model: null,
        guide: initialGuide,
        gemini_requests: 0
      };
    }

    try {
      const interpretation = await interpretProductTruthAgainstReferenceWithKey({
        verified_facts: input.product_truth.verified_facts,
        reference_mechanisms: initialGuide.reference_mechanisms
      }, {
        api_key: this.apiKey,
        model: this.guidanceModel
      });
      return {
        provider: "gemini" as const,
        model: this.guidanceModel,
        guide: compileSingleVideoProductionGuide(input.analysis, derivedMetrics, {
          ...input.product_truth,
          interpretation
        }),
        gemini_requests: 1
      };
    } catch (error) {
      const normalized = normalizeGeminiError(error);
      if (normalized.is_rate_limit) throw new GatewayError(429, "GATEWAY_AI_RATE_LIMIT", normalized.message);
      throw new GatewayError(502, "GATEWAY_AI_UPSTREAM", normalized.message);
    }
  }
}
