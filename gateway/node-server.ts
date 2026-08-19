import { createServer } from "node:http";
import { createGateway } from "./core";
import { createGatewayProviderRuntime } from "./runtime";

const gateway = createGateway(createGatewayProviderRuntime(process.env));
const host = process.env.MASTERV_GATEWAY_HOST?.trim() || "127.0.0.1";
const port = Number(process.env.PORT || process.env.MASTERV_GATEWAY_PORT || 8787);

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Gateway port is invalid");

const server = createServer(async (incoming, outgoing) => {
  const chunks: Buffer[] = [];
  for await (const chunk of incoming) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const origin = `http://${incoming.headers.host || `${host}:${port}`}`;
  const url = new URL(incoming.url || "/", origin);
  const method = incoming.method || "GET";
  const request = new Request(url, {
    method,
    headers: incoming.headers as HeadersInit,
    ...(["GET", "HEAD"].includes(method) ? {} : { body: Buffer.concat(chunks) })
  });
  const response = await gateway.handle(request);
  outgoing.statusCode = response.status;
  response.headers.forEach((value, key) => outgoing.setHeader(key, value));
  outgoing.end(Buffer.from(await response.arrayBuffer()));
});

server.listen(port, host, () => {
  console.log(JSON.stringify({
    status: "MASTERV_GATEWAY_LISTENING",
    host,
    port,
    contract_version: gateway.contract_version,
    architecture: gateway.architecture
  }));
});
