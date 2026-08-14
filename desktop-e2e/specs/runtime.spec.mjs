import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function required(name) {
  const value = process.env[name]?.trim() || "";
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const evidenceDir = path.resolve(process.cwd(), "artifacts", "desktop-windows-runtime");

describe("MasterV Windows native runtime", () => {
  it("authenticates in the real Tauri WebView2 and reaches the hosted JWT boundary", async () => {
    fs.mkdirSync(evidenceDir, { recursive: true });

    const email = await $("#email");
    const password = await $("#password");
    const loginButton = await $("#login-button");

    await email.setValue(required("SUPABASE_TEST_EMAIL"));
    await password.setValue(required("SUPABASE_TEST_PASSWORD"));
    await loginButton.click();

    await browser.waitUntil(async () => {
      const auth = await $("#auth-status").getText();
      const api = await $("#api-status").getText();
      return auth === "AUTHENTICATED" && api === "CONNECTED";
    }, {
      timeout: 45_000,
      timeoutMsg: "MasterV native desktop did not reach authenticated hosted API state"
    });

    const authStatus = await $("#auth-status").getText();
    const apiStatus = await $("#api-status").getText();
    const boundary = await $("#cap-boundary").getText();
    const analyze = await $("#cap-analyze").getText();
    const youtube = await $("#cap-youtube").getText();
    const productTruth = await $("#cap-product-truth").getText();
    const surface = await $("#surface-badge").getText();

    assert.equal(surface, "desktop");
    assert.equal(authStatus, "AUTHENTICATED");
    assert.equal(apiStatus, "CONNECTED");
    assert.equal(boundary, "READY");
    assert.equal(analyze, "PENDING");
    assert.equal(youtube, "PENDING");
    assert.equal(productTruth, "PENDING");

    await email.setValue("");
    await password.setValue("");
    const screenshotPath = path.join(evidenceDir, "native-connected.png");
    await browser.saveScreenshot(screenshotPath);

    const evidence = {
      status: "MASTERV_WINDOWS_NATIVE_RUNTIME_PASS",
      surface: "desktop",
      auth_status: authStatus,
      hosted_api_status: apiStatus,
      boundary_probe: true,
      analyze_migrated: false,
      youtube_discovery_migrated: false,
      product_truth_migrated: false,
      local_next_api_required: false,
      provider_credentials_in_desktop_job: false,
      screenshot: "native-connected.png"
    };
    fs.writeFileSync(path.join(evidenceDir, "runtime-evidence.json"), JSON.stringify(evidence, null, 2));

    await $("#logout-button").click();
    await browser.waitUntil(async () => (await $("#auth-status").getText()) === "SIGNED OUT", {
      timeout: 10_000,
      timeoutMsg: "desktop in-memory logout did not clear the session"
    });
  });
});
