export type MasterVDeploymentSurface = "gateway" | "web";

export function resolveMasterVDeploymentSurface(
  env: Readonly<Record<string, string | undefined>> = process.env
): MasterVDeploymentSurface {
  const configured = env.MASTERV_DEPLOYMENT_SURFACE?.trim().toLowerCase();

  if (env.NODE_ENV === "production") {
    if (configured && configured !== "gateway") {
      throw new Error("MasterV production deployment surface must be gateway");
    }
    return "gateway";
  }

  if (!configured) return "web";
  if (configured === "gateway" || configured === "web") return configured;
  throw new Error(`Invalid MASTERV_DEPLOYMENT_SURFACE: ${configured}`);
}

export function legacyWebApiEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env
) {
  return resolveMasterVDeploymentSurface(env) === "web";
}
