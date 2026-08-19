export class GatewayError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

export function asGatewayError(error: unknown) {
  if (error instanceof GatewayError) return error;
  return new GatewayError(500, "GATEWAY_INTERNAL_ERROR", "Gateway request failed.");
}
