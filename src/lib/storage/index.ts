import { S3Client } from "@aws-sdk/client-s3";
import type { ImageStorage } from "./types";
import { MinioStorage } from "./minio-storage";

export function getStorage(): ImageStorage {
  const provider = process.env.STORAGE_PROVIDER ?? "minio";

  if (provider === "minio") {
    const client = new S3Client({
      endpoint: process.env.MINIO_ENDPOINT,
      region: "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY ?? "",
        secretAccessKey: process.env.MINIO_SECRET_KEY ?? "",
      },
    });
    return new MinioStorage(client, process.env.MINIO_BUCKET ?? "avatars", process.env.MINIO_PUBLIC_URL ?? "http://localhost:9000");
  }

  throw new Error(`Unknown STORAGE_PROVIDER: ${provider}`);
}
