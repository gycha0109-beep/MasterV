import { createGateway } from "@/gateway/core";
import { createGatewayProviderRuntime } from "@/gateway/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const gateway = createGateway(createGatewayProviderRuntime(process.env));

async function handle(request: Request) {
  return gateway.handle(request);
}

export { handle as GET, handle as POST, handle as OPTIONS };
