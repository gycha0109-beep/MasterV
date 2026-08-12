import assert from "node:assert/strict";
import { analyzeYouTubeVideo } from "../lib/gemini";

const url = process.env.GEMINI_SMOKE_YOUTUBE_URL || "https://www.youtube.com/watch?v=9hE5-98ZeCg";

async function main() {
  const result = await analyzeYouTubeVideo(url);

  assert.equal(typeof result.structure_label, "string");
  assert.ok(result.structure_label.length > 0, "structure_label is empty");
  assert.ok(Array.isArray(result.scenes), "scenes is not an array");
  assert.ok(Array.isArray(result.confidence_notes), "confidence_notes is not an array");

  console.log("Gemini runtime smoke: PASS");
  console.log(`structure_label=${result.structure_label}`);
  console.log(`scenes=${result.scenes.length}`);
  console.log(`confidence_notes=${result.confidence_notes.length}`);
}

main().catch((error) => {
  console.error("Gemini runtime smoke: FAIL");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
