import { GatewayError } from "../errors";

export type PolarFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type PolarLicenseKey = Readonly<{
  id: string;
  customer_id: string;
  benefit_id: string;
  status: string;
  key?: string;
  display_key?: string;
  limit_activations: number | null;
  usage: number;
  limit_usage: number | null;
  expires_at: string | null;
}>;

export type PolarActivation = Readonly<{
  id: string;
  license_key_id: string;
  label: string;
  meta: Record<string, unknown>;
  license_key?: PolarLicenseKey;
}>;

export type PolarCustomerState = Readonly<{
  id: string;
  active_subscriptions: ReadonlyArray<{
    id: string;
    status: string;
    product_id: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
  }>;
  granted_benefits: ReadonlyArray<{
    benefit_id: string;
    benefit_type: string;
    benefit_metadata: Record<string, unknown>;
  }>;
  active_meters: ReadonlyArray<{
    id: string;
    meter_id: string;
    consumed_units: number;
    credited_units: number;
    balance: number;
  }>;
}>;

type PolarClientOptions = Readonly<{
  access_token: string;
  organization_id: string;
  base_url?: string;
  fetcher?: PolarFetch;
}>;

function normalizedBaseUrl(value: string | undefined) {
  return (value?.trim() || "https://api.polar.sh").replace(/\/+$/, "");
}

async function responseDetail(response: Response) {
  try {
    const body = await response.json() as Record<string, unknown>;
    const detail = body.detail ?? body.error ?? body.message;
    if (typeof detail === "string" && detail.trim()) return detail.trim();
  } catch {
    // Ignore non-JSON error bodies.
  }
  return `${response.status} ${response.statusText}`.trim();
}

function polarStatus(status: number) {
  if (status === 401 || status === 403) return 503;
  if (status === 404) return 404;
  if (status === 409) return 409;
  if (status === 422) return 400;
  if (status === 429) return 429;
  return status >= 500 ? 502 : 400;
}

export class PolarHttpClient {
  readonly organizationId: string;
  private readonly accessToken: string;
  private readonly baseUrl: string;
  private readonly fetcher: PolarFetch;

  constructor(options: PolarClientOptions) {
    this.accessToken = options.access_token.trim();
    this.organizationId = options.organization_id.trim();
    if (!this.accessToken) throw new Error("POLAR_ACCESS_TOKEN is required.");
    if (!this.organizationId) throw new Error("POLAR_ORGANIZATION_ID is required.");
    this.baseUrl = normalizedBaseUrl(options.base_url);
    this.fetcher = options.fetcher ?? fetch;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/json",
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(init.headers ?? {})
      }
    });
    if (!response.ok) {
      throw new GatewayError(
        polarStatus(response.status),
        "POLAR_UPSTREAM_ERROR",
        `Polar request failed: ${await responseDetail(response)}`
      );
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  }

  async activateLicense(input: {
    product_key: string;
    device_label: string;
    install_id: string;
  }): Promise<PolarActivation> {
    return await this.request<PolarActivation>("/v1/license-keys/activate", {
      method: "POST",
      body: JSON.stringify({
        key: input.product_key,
        organization_id: this.organizationId,
        label: input.device_label,
        meta: {
          masterv_install_id: input.install_id
        }
      })
    });
  }

  async getLicenseKey(licenseId: string): Promise<PolarLicenseKey> {
    return await this.request<PolarLicenseKey>(`/v1/license-keys/${encodeURIComponent(licenseId)}`);
  }

  async getActivation(licenseId: string, activationId: string): Promise<PolarActivation> {
    return await this.request<PolarActivation>(
      `/v1/license-keys/${encodeURIComponent(licenseId)}/activations/${encodeURIComponent(activationId)}`
    );
  }

  async getCustomerState(customerId: string): Promise<PolarCustomerState> {
    return await this.request<PolarCustomerState>(`/v1/customers/${encodeURIComponent(customerId)}/state`);
  }

  async ingestUsage(input: {
    external_id: string;
    customer_id: string;
    event_name: string;
    units: number;
    capability: string;
    device_id: string;
    session_id: string;
  }): Promise<{ inserted: number; duplicates: number }> {
    return await this.request<{ inserted: number; duplicates: number }>("/v1/events/ingest", {
      method: "POST",
      body: JSON.stringify({
        events: [{
          external_id: input.external_id,
          name: input.event_name,
          customer_id: input.customer_id,
          metadata: {
            units: input.units,
            capability: input.capability,
            device_id: input.device_id,
            session_id: input.session_id
          }
        }]
      })
    });
  }
}
