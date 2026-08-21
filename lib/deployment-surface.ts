export type MasterVDeploymentSurface = "gateway" | "web";

export function resolveMasterVDeploymentSurface(
  env: Readonly<Record<string, string | undefined>> = process.env
): MasterVDeploymentSurface {
  const configured = env.MASTERV_DEPLOYMENT_SURFACE?.trim().toLowerCase();
  if (configured) {
    if (configured === "gateway" || configured === "web") return configured;
    throw new Error(`Invalid MASTERV_DEPLOYMENT_SURFACE: ${configured}`);
  }

  return env.NODE_ENV === "production" ? "gateway" : "web";
}

export function legacyWebApiEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env
) {
  return resolveMasterVDeploymentSurface(env) === "web";
}
