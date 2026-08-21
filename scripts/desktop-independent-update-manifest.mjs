import fs from "node:fs";
import path from "node:path";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assertVersion(version) {
  if (!/^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error("MASTERV_UPDATE_VERSION must be a valid SemVer value");
  }
}

function assertHttpsUrl(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") throw new Error("MASTERV_UPDATE_INSTALLER_URL must use HTTPS");
  return parsed.toString();
}

const version = required("MASTERV_UPDATE_VERSION");
const installerUrl = assertHttpsUrl(required("MASTERV_UPDATE_INSTALLER_URL"));
const signaturePath = path.resolve(required("MASTERV_UPDATE_SIGNATURE_PATH"));
const outputPath = path.resolve(process.env.MASTERV_UPDATE_MANIFEST_PATH || "artifacts/desktop-independent-updater/latest.json");
const notes = String(process.env.MASTERV_UPDATE_NOTES || "").trim();
const pubDate = String(process.env.MASTERV_UPDATE_PUB_DATE || "").trim();

assertVersion(version);
if (!fs.existsSync(signaturePath)) throw new Error(`signature file not found: ${signaturePath}`);
const signature = fs.readFileSync(signaturePath, "utf8").trim();
if (!signature) throw new Error("signature file is empty");
if (pubDate && Number.isNaN(Date.parse(pubDate))) throw new Error("MASTERV_UPDATE_PUB_DATE must be RFC3339-compatible");

const manifest = {
  version,
  ...(notes ? { notes } : {}),
  ...(pubDate ? { pub_date: pubDate } : {}),
  platforms: {
    "windows-x86_64": {
      signature,
      url: installerUrl
    }
  }
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  status: "MASTERV_INDEPENDENT_UPDATE_MANIFEST_PASS",
  version,
  target: "windows-x86_64",
  signature_embedded: true,
  installer_https: true,
  output: path.relative(process.cwd(), outputPath).replaceAll(path.sep, "/")
}));
