export interface ImageStorage {
  upload(key: string, buffer: Buffer, contentType: string): Promise<void>;
  download(key: string): Promise<Buffer>;
  getPublicUrl(key: string): string;
  delete(key: string): Promise<void>;
}
