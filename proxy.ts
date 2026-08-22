import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolveMasterVDeploymentSurface } from "./lib/deployment-surface";

export function proxy(request: NextRequest) {
  if (resolveMasterVDeploymentSurface() !== "gateway") return NextResponse.next();

  const pathname = request.nextUrl.pathname;
  if (pathname === "/v1" || pathname.startsWith("/v1/")) return NextResponse.next();

  return NextResponse.json(
    {
      service: "masterv-gateway",
      contract_version: "mv-gateway-v1",
      error: "Gateway route not found.",
      code: "GATEWAY_ROUTE_NOT_FOUND"
    },
    {
      status: 404,
      headers: { "Cache-Control": "no-store" }
    }
  );
}

export const config = {
  matcher: "/:path*"
};
