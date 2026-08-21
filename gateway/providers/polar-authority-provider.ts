import type {
  GatewayCapability,
  GatewayCredentialProvider,
  GatewayEntitlement,
  GatewayEntitlementProvider,
  GatewayLicenseProvider,
  GatewayPrincipal,
  GatewayUsageProvider
} from "../contracts";
import { GatewayCredentialCodec } from "../credentials";
import { GatewayError } from "../errors";
import {
  PolarHttpClient,
  type PolarCustomerState,
  type PolarLicenseKey
} from "./polar-http-client";

type PolarAuthorityOptions = Readonly<{
  client: PolarHttpClient;
  credentials: GatewayCredentialCodec;
  ai_meter_id?: string;
  usage_event_name?: string;
  plan_metadata_key?: string;
}>;

function stringField(record: Record<string, unknown>, key: string, maxLength: number) {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new GatewayError(400, "GATEWAY_INVALID_REQUEST", `${key} must be a non-empty string.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new GatewayError(400, "GATEWAY_INVALID_REQUEST", `${key} is too long.`);
  }
  return normalized;
}

function activationInput(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new GatewayError(400, "GATEWAY_INVALID_REQUEST", "Activation body must be an object.");
  }
  const record = input as Record<string, unknown>;
  const productKey = stringField(record, "product_key", 256);
  const installId = stringField(record, "install_id", 128);
  const deviceLabel = typeof record.device_label === "string" && record.device_label.trim()
    ? record.device_label.trim().slice(0, 120)
    : `MasterV ${installId.slice(0, 12)}`;
  return { product_key: productKey, install_id: installId, device_label: deviceLabel };
}

function sessionInput(input: unknown) {
  if (input === undefined || input === null) return {};
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new GatewayError(400, "GATEWAY_INVALID_REQUEST", "Session body must be an object.");
  }
  const record = input as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== "install_id") {
      throw new GatewayError(400, "GATEWAY_INVALID_REQUEST", `Unsupported session field: ${key}`);
    }
  }
  return {
    install_id: typeof record.install_id === "string" ? record.install_id.trim() : ""
  };
}

function licenseStatus(license: PolarLicenseKey) {
  if (license.expires_at && Date.parse(license.expires_at) <= Date.now()) return "expired" as const;
  if (license.status === "granted") return "active" as const;
  if (license.status === "disabled") return "suspended" as const;
  return "inactive" as const;
}

function selectSubscription(state: PolarCustomerState) {
  const priority = new Map([
    ["trialing", 5],
    ["active", 4],
    ["past_due", 3],
    ["incomplete", 2],
    ["unpaid", 1],
    ["canceled", 0],
    ["incomplete_expired", 0]
  ]);
  return [...state.active_subscriptions].sort(
    (left, right) => (priority.get(right.status) ?? -1) - (priority.get(left.status) ?? -1)
  )[0] ?? null;
}

function mapSubscription(subscription: ReturnType<typeof selectSubscription>, owner: boolean) {
  if (owner) {
    return { status: "active" as const, grace_active: false, current_period_end: null };
  }
  if (!subscription) {
    return { status: "none" as const, grace_active: false, current_period_end: null };
  }
  if (subscription.status === "trialing") {
    return { status: "trial" as const, grace_active: false, current_period_end: subscription.current_period_end };
  }
  if (subscription.status === "active" && subscription.cancel_at_period_end) {
    return { status: "cancel_at_period_end" as const, grace_active: false, current_period_end: subscription.current_period_end };
  }
  if (subscription.status === "active") {
    return { status: "active" as const, grace_active: false, current_period_end: subscription.current_period_end };
  }
  if (subscription.status === "past_due") {
    return { status: "past_due" as const, grace_active: true, current_period_end: subscription.current_period_end };
  }
  if (subscription.status === "canceled" || subscription.status === "unpaid" || subscription.status === "incomplete_expired") {
    return { status: "expired" as const, grace_active: false, current_period_end: subscription.current_period_end };
  }
  return { status: "inactive" as const, grace_active: false, current_period_end: subscription.current_period_end };
}

export class PolarGatewayAuthorityProvider implements
  GatewayLicenseProvider,
  GatewayCredentialProvider,
  GatewayEntitlementProvider,
  GatewayUsageProvider {
  private readonly client: PolarHttpClient;
  private readonly credentials: GatewayCredentialCodec;
  private readonly aiMeterId: string;
  private readonly usageEventName: string;
  private readonly planMetadataKey: string;

  constructor(options: PolarAuthorityOptions) {
    this.client = options.client;
    this.credentials = options.credentials;
    this.aiMeterId = options.ai_meter_id?.trim() || "";
    this.usageEventName = options.usage_event_name?.trim() || "masterv_ai_usage";
    this.planMetadataKey = options.plan_metadata_key?.trim() || "masterv_plan";
  }

  private async loadAuthority(principal: Pick<GatewayPrincipal, "device_id" | "customer_id" | "license_id" | "activation_id">) {
    const [license, activation, state] = await Promise.all([
      this.client.getLicenseKey(principal.license_id),
      this.client.getActivation(principal.license_id, principal.activation_id),
      this.client.getCustomerState(principal.customer_id)
    ]);
    if (license.customer_id !== principal.customer_id) {
      throw new GatewayError(403, "GATEWAY_LICENSE_SUBJECT_MISMATCH", "License customer does not match the credential.");
    }
    if (activation.license_key_id !== principal.license_id) {
      throw new GatewayError(403, "GATEWAY_ACTIVATION_MISMATCH", "Device activation does not match the license.");
    }
    const activationInstallId = activation.meta?.masterv_install_id;
    if (typeof activationInstallId === "string" && activationInstallId && activationInstallId !== principal.device_id) {
      throw new GatewayError(403, "GATEWAY_DEVICE_MISMATCH", "Device activation does not match this installation.");
    }
    return { license, activation, state };
  }

  private deriveEntitlement(license: PolarLicenseKey, state: PolarCustomerState): GatewayEntitlement {
    const status = licenseStatus(license);
    const grant = state.granted_benefits.find((item) => item.benefit_id === license.benefit_id);
    const metadataPlan = grant?.benefit_metadata?.[this.planMetadataKey];
    const plan = typeof metadataPlan === "string" && metadataPlan.trim() ? metadataPlan.trim().toUpperCase() : null;
    const owner = plan === "OWNER";
    const subscription = mapSubscription(selectSubscription(state), owner);
    const meter = this.aiMeterId
      ? state.active_meters.find((item) => item.meter_id === this.aiMeterId) ?? null
      : null;
    const usageRemaining = owner ? null : meter ? Math.max(0, Number(meter.balance) || 0) : null;
    const authorityActive = status === "active" && Boolean(grant);
    const capabilities = Object.freeze({
      discovery: authorityActive,
      analyze: authorityActive,
      guidance: authorityActive
    });

    return Object.freeze({
      license_status: status,
      subscription_status: subscription.status,
      grace_active: subscription.grace_active,
      plan,
      owner,
      current_period_end: subscription.current_period_end,
      device_limit: license.limit_activations,
      usage_remaining: usageRemaining,
      capabilities
    });
  }

  private assertUsable(entitlement: GatewayEntitlement) {
    if (entitlement.license_status !== "active") {
      throw new GatewayError(403, "GATEWAY_LICENSE_INACTIVE", "The Polar license is not active.");
    }
    if (!entitlement.plan) {
      throw new GatewayError(503, "GATEWAY_PLAN_NOT_CONFIGURED", `Polar benefit metadata '${this.planMetadataKey}' is required.`);
    }
    if (!entitlement.owner && !this.aiMeterId) {
      throw new GatewayError(503, "GATEWAY_USAGE_METER_NOT_CONFIGURED", "Polar AI usage meter is not configured.");
    }
  }

  async activate(input: unknown) {
    const normalized = activationInput(input);
    const activation = await this.client.activateLicense(normalized);
    const license = activation.license_key;
    if (!license?.id || !license.customer_id || !activation.id) {
      throw new GatewayError(502, "POLAR_ACTIVATION_INVALID", "Polar activation response is incomplete.");
    }

    const principalBase = {
      subject: `polar:${license.customer_id}`,
      device_id: normalized.install_id,
      customer_id: license.customer_id,
      license_id: license.id,
      activation_id: activation.id
    };
    const state = await this.client.getCustomerState(license.customer_id);
    const entitlement = this.deriveEntitlement(license, state);
    this.assertUsable(entitlement);

    const device = this.credentials.issueDevice(principalBase);
    const session = this.credentials.issueSession(principalBase);
    return Object.freeze({
      activation_id: activation.id,
      device_id: normalized.install_id,
      device_credential: device.credential,
      device_credential_expires_at: device.expires_at,
      session_credential: session.credential,
      session_credential_expires_at: session.expires_at,
      entitlement
    });
  }

  async createSession(input: unknown, deviceCredential: string) {
    const normalized = sessionInput(input);
    const device = this.credentials.verifyDevice(deviceCredential);
    if (normalized.install_id && normalized.install_id !== device.device_id) {
      throw new GatewayError(403, "GATEWAY_DEVICE_MISMATCH", "Requested installation does not match the device credential.");
    }
    const authority = await this.loadAuthority({
      device_id: device.device_id,
      customer_id: device.customer_id,
      license_id: device.license_id,
      activation_id: device.activation_id
    });
    const entitlement = this.deriveEntitlement(authority.license, authority.state);
    this.assertUsable(entitlement);
    const session = this.credentials.issueSession({
      subject: device.subject,
      device_id: device.device_id,
      customer_id: device.customer_id,
      license_id: device.license_id,
      activation_id: device.activation_id
    });
    return Object.freeze({
      session_credential: session.credential,
      session_credential_expires_at: session.expires_at,
      entitlement
    });
  }

  async verifySession(credential: string): Promise<GatewayPrincipal> {
    return this.credentials.verifySession(credential);
  }

  async getEntitlement(principal: GatewayPrincipal): Promise<GatewayEntitlement> {
    const authority = await this.loadAuthority(principal);
    return this.deriveEntitlement(authority.license, authority.state);
  }

  async authorize(input: {
    principal: GatewayPrincipal;
    entitlement: GatewayEntitlement;
    capability: GatewayCapability;
    required_units: number;
  }) {
    if (input.required_units <= 0 || input.entitlement.owner) {
      return Object.freeze({ allowed: true, remaining: input.entitlement.usage_remaining, required_units: input.required_units });
    }
    if (!this.aiMeterId) {
      return Object.freeze({ allowed: false, reason: "Polar AI usage meter is not configured.", remaining: null, required_units: input.required_units });
    }
    const state = await this.client.getCustomerState(input.principal.customer_id);
    const meter = state.active_meters.find((item) => item.meter_id === this.aiMeterId);
    const remaining = meter ? Math.max(0, Number(meter.balance) || 0) : 0;
    return Object.freeze({
      allowed: remaining >= input.required_units,
      reason: remaining >= input.required_units ? undefined : "AI credit balance is insufficient.",
      remaining,
      required_units: input.required_units
    });
  }

  async record(input: {
    principal: GatewayPrincipal;
    entitlement: GatewayEntitlement;
    capability: GatewayCapability;
    charged_units: number;
    operation_id: string;
  }) {
    if (input.charged_units <= 0 || input.entitlement.owner) {
      return Object.freeze({ capability: input.capability, charged_units: 0 });
    }
    const externalId = `masterv:${input.operation_id}:${input.capability}`;
    await this.client.ingestUsage({
      external_id: externalId,
      customer_id: input.principal.customer_id,
      event_name: this.usageEventName,
      units: input.charged_units,
      capability: input.capability,
      device_id: input.principal.device_id,
      session_id: input.principal.session_id
    });
    return Object.freeze({
      capability: input.capability,
      charged_units: input.charged_units,
      external_id: externalId
    });
  }
}
