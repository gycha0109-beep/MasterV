import { createGateway } from "./core";
import { createGatewayProviderRuntime } from "./runtime";

type DenoServeRuntime = Readonly<{
  env: Readonly<{
    toObject(): Record<string, string>;
  }>;
  serve(handler: (request: Request) => Response | Promise<Response>): unknown;
}>;

const deno = (globalThis as typeof globalThis & { Deno?: DenoServeRuntime }).Deno;
if (!deno) throw new Error("DENO_RUNTIME_REQUIRED");

const gateway = createGateway(createGatewayProviderRuntime(deno.env.toObject()));

deno.serve((request) => gateway.handle(request));
