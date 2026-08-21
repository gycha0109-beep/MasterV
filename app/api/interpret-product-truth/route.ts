import { NextResponse } from "next/server";
import { legacyWebApiEnabled } from "@/lib/deployment-surface";
import { normalizeGeminiError } from "@/lib/gemini-error";
import { interpretProductTruthAgainstReference } from "@/lib/product-truth-interpreter";
import type { ReferenceMechanismCandidate } from "@/lib/product-truth-interpretation";

export async function POST(request: Request) {
  if (!legacyWebApiEnabled()) {
    return NextResponse.json({ error: "Not found", code: "LEGACY_WEB_API_DISABLED" }, { status: 404 });
  }

  try {
    const body = (await request.json()) as {
      verified_facts?: string;
      reference_mechanisms?: ReferenceMechanismCandidate[];
    };

    const verifiedFacts = body.verified_facts ?? "";
    const referenceMechanisms = Array.isArray(body.reference_mechanisms) ? body.reference_mechanisms : [];

    if (referenceMechanisms.length === 0) {
      return NextResponse.json({ error: "해석할 참고영상 제작 메커니즘이 없습니다." }, { status: 400 });
    }

    const interpretation = await interpretProductTruthAgainstReference({
      verified_facts: verifiedFacts,
      reference_mechanisms: referenceMechanisms
    });

    return NextResponse.json({ interpretation });
  } catch (error) {
    const normalized = normalizeGeminiError(error);

    if (normalized.is_rate_limit) {
      return NextResponse.json(
        {
          error: normalized.message,
          code: "GEMINI_RATE_LIMIT",
          rate_limit: normalized.diagnostic
        },
        { status: 429 }
      );
    }

    return NextResponse.json({ error: normalized.message }, { status: 500 });
  }
}
