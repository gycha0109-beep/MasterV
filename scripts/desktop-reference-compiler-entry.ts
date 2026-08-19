import { compareVideoAnalyses } from "../lib/reference-compare";
import { compileEvidenceRules } from "../lib/evidence-rules";

type LocalReferenceRecord = {
  source_id: string;
  canonical_url?: string;
  label?: string;
  analysis: Parameters<typeof compareVideoAnalyses>[0][number]["analysis"];
};

function compile(records: LocalReferenceRecord[]) {
  const inputs = records.map((record) => ({
    id: record.source_id,
    label: record.label,
    url: record.canonical_url,
    analysis: structuredClone(record.analysis)
  }));
  const comparison = compareVideoAnalyses(inputs);
  const evidence_rules = compileEvidenceRules(comparison);
  return Object.freeze({ comparison, evidence_rules });
}

Object.defineProperty(window, "MASTERV_LOCAL_REFERENCE_COMPILER", {
  value: Object.freeze({ compareVideoAnalyses, compileEvidenceRules, compile }),
  enumerable: true,
  configurable: false,
  writable: false
});
