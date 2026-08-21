import {
  interpretProductTruthAgainstReferenceWithKey,
  type ProductTruthInterpreterInput
} from "@/lib/product-truth-interpreter-core";

export type { ProductTruthInterpreterInput } from "@/lib/product-truth-interpreter-core";

export async function interpretProductTruthAgainstReference(input: ProductTruthInterpreterInput) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");
  const model = process.env.GEMINI_PRODUCT_TRUTH_MODEL || process.env.GEMINI_MODEL;
  return interpretProductTruthAgainstReferenceWithKey(input, { api_key: apiKey, model });
}
