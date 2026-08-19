import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { GatewayError } from "./errors";
import type { GatewayPrincipal } from "./contracts";

type CredentialKind = "device" | "session";

type CredentialClaims = {
  v: 1;
  kind: CredentialKind;
  sub: string;
  jti: string;
  device_id: string;
  customer_id: string;
  license_id: string;
  activation_id: string;
  iat: number;
  exp: number;
};

export type DeviceCredentialPrincipal = Readonly<{
  subject: string;
  credential_id: string;
  device_id: string;
  customer_id: string;
  license_id: string;
  activation_id: string;
}>;

export type GatewayCredentialCodecOptions = Readonly<{
  secret: string;
  device_ttl_seconds?: number;
  session_ttl_seconds?: number;
  now?: () => number;
}>;

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function positiveInteger(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function asClaims(value: unknown): CredentialClaims {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GatewayError(401, "GATEWAY_CREDENTIAL_INVALID", "Credential payload is invalid.");
  }
  const record = value as Record<string, unknown>;
  const kind = record.kind;
  if (record.v !== 1 || (kind !== "device" && kind !== "session")) {
    throw new GatewayError(401, "GATEWAY_CREDENTIAL_INVALID", "Credential version or kind is invalid.");
  }

  const requiredStrings = ["sub", "jti", "device_id", "customer_id", "license_id", "activation_id"] as const;
  for (const key of requiredStrings) {
    if (typeof record[key] !== "string" || !String(record[key]).trim()) {
      throw new GatewayError(401, "GATEWAY_CREDENTIAL_INVALID", `Credential field is invalid: ${key}`);
    }
  }
  if (!Number.isInteger(record.iat) || !Number.isInteger(record.exp)) {
    throw new GatewayError(401, "GATEWAY_CREDENTIAL_INVALID", "Credential timestamps are invalid.");
  }

  return record as CredentialClaims;
}

export class GatewayCredentialCodec {
  private readonly secret: Buffer;
  private readonly deviceTtlSeconds: number;
  private readonly sessionTtlSeconds: number;
  private readonly now: () => number;

  constructor(options: GatewayCredentialCodecOptions) {
    const secret = options.secret.trim();
    if (Buffer.byteLength(secret, "utf8") < 32) {
      throw new Error("Gateway credential signing secret must be at least 32 bytes.");
    }
    this.secret = Buffer.from(secret, "utf8");
    this.deviceTtlSeconds = positiveInteger(options.device_ttl_seconds, 30 * 24 * 60 * 60);
    this.sessionTtlSeconds = positiveInteger(options.session_ttl_seconds, 15 * 60);
    this.now = options.now ?? (() => Math.floor(Date.now() / 1000));
  }

  private signEncoded(encodedPayload: string) {
    return createHmac("sha256", this.secret).update(encodedPayload).digest("base64url");
  }

  private issue(kind: CredentialKind, principal: Omit<DeviceCredentialPrincipal, "credential_id">, ttlSeconds: number) {
    const issuedAt = this.now();
    const claims: CredentialClaims = {
      v: 1,
      kind,
      sub: principal.subject,
      jti: randomUUID(),
      device_id: principal.device_id,
      customer_id: principal.customer_id,
      license_id: principal.license_id,
      activation_id: principal.activation_id,
      iat: issuedAt,
      exp: issuedAt + ttlSeconds
    };
    const encodedPayload = encode(JSON.stringify(claims));
    return {
      credential: `${encodedPayload}.${this.signEncoded(encodedPayload)}`,
      expires_at: new Date(claims.exp * 1000).toISOString(),
      claims
    };
  }

  issueDevice(principal: Omit<DeviceCredentialPrincipal, "credential_id">) {
    return this.issue("device", principal, this.deviceTtlSeconds);
  }

  issueSession(principal: Omit<DeviceCredentialPrincipal, "credential_id">) {
    return this.issue("session", principal, this.sessionTtlSeconds);
  }

  private verifyRaw(credential: string, expectedKind: CredentialKind) {
    const [encodedPayload, signature, extra] = credential.trim().split(".");
    if (!encodedPayload || !signature || extra) {
      throw new GatewayError(401, "GATEWAY_CREDENTIAL_INVALID", "Credential format is invalid.");
    }
    const expected = Buffer.from(this.signEncoded(encodedPayload));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new GatewayError(401, "GATEWAY_CREDENTIAL_INVALID", "Credential signature is invalid.");
    }

    let claims: CredentialClaims;
    try {
      claims = asClaims(JSON.parse(decode(encodedPayload)));
    } catch (error) {
      if (error instanceof GatewayError) throw error;
      throw new GatewayError(401, "GATEWAY_CREDENTIAL_INVALID", "Credential payload is invalid.");
    }
    if (claims.kind !== expectedKind) {
      throw new GatewayError(401, "GATEWAY_CREDENTIAL_KIND_INVALID", `Expected ${expectedKind} credential.`);
    }
    if (claims.exp <= this.now()) {
      throw new GatewayError(401, "GATEWAY_CREDENTIAL_EXPIRED", "Credential has expired.");
    }
    return claims;
  }

  verifyDevice(credential: string): DeviceCredentialPrincipal {
    const claims = this.verifyRaw(credential, "device");
    return Object.freeze({
      subject: claims.sub,
      credential_id: claims.jti,
      device_id: claims.device_id,
      customer_id: claims.customer_id,
      license_id: claims.license_id,
      activation_id: claims.activation_id
    });
  }

  verifySession(credential: string): GatewayPrincipal {
    const claims = this.verifyRaw(credential, "session");
    return Object.freeze({
      subject: claims.sub,
      session_id: claims.jti,
      device_id: claims.device_id,
      customer_id: claims.customer_id,
      license_id: claims.license_id,
      activation_id: claims.activation_id
    });
  }
}
