/**
 * Dispatch pekerjaan ke AGENT di node terpilih (lewat WebSocket).
 * Eksekusi terjadi di VPS, bukan di control plane.
 */
import { dispatchDeployment, dispatchAction } from "../agent-server.js";

export type ServiceAction = "stop" | "restart" | "cleanup";

export function enqueueDeployment(deploymentId: string): Promise<unknown> {
  // Jalan async supaya response HTTP tidak menunggu build.
  setImmediate(() =>
    dispatchDeployment(deploymentId).catch((e) =>
      console.error("[dispatch]", e instanceof Error ? e.message : e),
    ),
  );
  return Promise.resolve();
}

export function enqueueAction(
  action: ServiceAction,
  serviceId: string,
): Promise<unknown> {
  setImmediate(() =>
    dispatchAction(serviceId, action).catch((e) =>
      console.error("[action]", e instanceof Error ? e.message : e),
    ),
  );
  return Promise.resolve();
}
