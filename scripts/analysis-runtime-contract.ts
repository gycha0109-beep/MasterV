import { canonicalizeYouTubeSource } from "../lib/source-identity";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const source = canonicalizeYouTubeSource("https://youtu.be/T9Kc4GT8vGA?t=3");
assert(source.source_id === "yt:T9Kc4GT8vGA", "canonical source_id must be stable");
assert(source.canonical_url === "https://www.youtube.com/watch?v=T9Kc4GT8vGA", "canonical URL must be stable");

console.log("ANALYSIS_RUNTIME_CONTRACT_PASS");
