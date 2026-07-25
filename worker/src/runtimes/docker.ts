/**
 * Runtime "docker": `docker build` dari Dockerfile repo, lalu `docker run`
 * dengan port dinamis + inject env vars. Butuh Docker daemon aktif.
 */
import { promises as fs } from "node:fs";
import Docker from "dockerode";
import { prisma } from "@minipaas/db";
import type { Runtime, StartContext } from "../runtime.js";

const docker = new Docker(); // socket default: /var/run/docker.sock (atau named pipe di Windows)

export const dockerRuntime: Runtime = {
  name: "docker",

  async start(ctx: StartContext) {
    const { deploymentId, service, workDir, hostPort, containerPort, log } = ctx;

    // Tentukan image: pull dari registry (source=IMAGE) atau build dari repo.
    let imageTag: string;
    if (service.source === "IMAGE") {
      imageTag = service.image!;
      await log(`Menarik image ${imageTag} dari registry...`);
      await pullImage(imageTag, log);
    } else {
      imageTag = `minipaas/${service.id.toLowerCase()}:${deploymentId.slice(0, 12)}`;
      await log(`Membangun image ${imageTag}...`);
      await buildImage(workDir, imageTag, log);
    }
    await prisma.deployment
      .update({ where: { id: deploymentId }, data: { imageTag } })
      .catch(() => {});

    await stopPreviousContainer(service.id, log);

    const envList = service.envVars.map((e) => `${e.key}=${e.value}`);
    await log(`Starting container → host:${hostPort} -> container:${containerPort}`);
    const container = await docker.createContainer({
      Image: imageTag,
      name: `minipaas_${service.id}`.toLowerCase(),
      Env: envList,
      Labels: {
        "minipaas.serviceId": service.id,
        "minipaas.deploymentId": deploymentId,
      },
      ExposedPorts: { [`${containerPort}/tcp`]: {} },
      HostConfig: {
        PortBindings: {
          [`${containerPort}/tcp`]: [{ HostPort: String(hostPort) }],
        },
        RestartPolicy: { Name: "unless-stopped" },
      },
    });
    await container.start();
    void streamContainerLogs(container, log);

    // Image sudah self-contained → bersihkan direktori clone (bila ada).
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    return { handle: container.id };
  },

  async stop(serviceId: string) {
    for (const info of await containersFor(serviceId)) {
      await docker.getContainer(info.Id).stop().catch(() => {});
    }
    await prisma.service
      .update({ where: { id: serviceId }, data: { status: "STOPPED" } })
      .catch(() => {});
  },

  async restart(serviceId: string) {
    const list = await containersFor(serviceId);
    if (!list.length) throw new Error("Tidak ada container untuk service ini");
    for (const info of list) {
      await docker.getContainer(info.Id).restart().catch(() => {});
    }
    await prisma.service
      .update({ where: { id: serviceId }, data: { status: "RUNNING" } })
      .catch(() => {});
  },

  async cleanup(serviceId: string) {
    for (const info of await containersFor(serviceId)) {
      await docker.getContainer(info.Id).remove({ force: true }).catch(() => {});
    }
  },
};

function containersFor(serviceId: string) {
  return docker.listContainers({
    all: true,
    filters: { label: [`minipaas.serviceId=${serviceId}`] },
  });
}

/** Tarik image dari registry (mis. Docker Hub) + forward progress ke logger. */
function pullImage(
  image: string,
  log: (l: string) => Promise<void>,
): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    docker.pull(image, (err: unknown, stream: NodeJS.ReadableStream) => {
      if (err) return reject(err);
      docker.modem.followProgress(
        stream,
        (e) => (e ? reject(e) : resolvePromise()),
        (evt: any) => {
          const text = (evt.status ?? "").toString().trim();
          if (text) void log(text);
        },
      );
    });
  });
}

/** Bungkus docker build stream jadi promise + forward output ke logger. */
function buildImage(
  context: string,
  tag: string,
  log: (l: string) => Promise<void>,
): Promise<void> {
  return new Promise(async (resolvePromise, reject) => {
    const stream = await docker.buildImage(
      { context, src: ["."] },
      { t: tag, dockerfile: "Dockerfile" },
    );
    docker.modem.followProgress(
      stream,
      (err, res) => {
        const failed = res?.find((r: any) => r.error);
        if (err) return reject(err);
        if (failed) return reject(new Error(failed.error));
        resolvePromise();
      },
      (evt: any) => {
        const text = (evt.stream ?? evt.status ?? "").toString().trim();
        if (text) void log(text);
      },
    );
  });
}

async function streamContainerLogs(
  container: Docker.Container,
  log: (l: string) => Promise<void>,
): Promise<void> {
  const stream = await container.logs({
    follow: true,
    stdout: true,
    stderr: true,
    tail: 0,
  });
  (stream as NodeJS.ReadableStream).on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8").replace(/[\x00-\x08]/g, "").trim();
    if (text) void log(text);
  });
}

async function stopPreviousContainer(
  serviceId: string,
  log: (l: string) => Promise<void>,
): Promise<void> {
  for (const info of await containersFor(serviceId)) {
    await log(`Menghentikan container lama ${info.Id.slice(0, 12)}...`);
    await docker.getContainer(info.Id).remove({ force: true }).catch(() => {});
  }
}
