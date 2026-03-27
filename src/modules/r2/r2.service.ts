import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type DeleteObjectsCommandInput,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

type R2PutOptions = {
  contentType?: string;
  cacheControl?: string;
};

@Injectable()
export class R2Service {
  readonly client: S3Client;
  readonly bucket: string;
  readonly prefix: string;
  readonly signedGetTtlSec: number;
  readonly signedPutTtlSec: number;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('R2_BUCKET')!;
    this.prefix = (this.config.get<string>('R2_KEY_PREFIX') || 'uploads').replace(/\/+$/, '');
    this.signedGetTtlSec = Number(this.config.get<string>('R2_SIGNED_GET_TTL_SEC') || 600);
    this.signedPutTtlSec = Number(this.config.get<string>('R2_SIGNED_PUT_TTL_SEC') || 60);

    const endpoint = this.config.get<string>('R2_ENDPOINT');
    const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY');

    this.client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
    });
  }

  buildKey(parts: string[]) {
    const cleaned = parts
      .filter(Boolean)
      .map((p) => p.replace(/^\/+|\/+$/g, ''))
      .filter(Boolean);
    return [this.prefix, ...cleaned].join('/');
  }

  async presignPut(key: string, contentType?: string) {
    const input: PutObjectCommandInput = {
      Bucket: this.bucket,
      Key: key,
      ...(contentType ? { ContentType: contentType } : {}),
    };
    const cmd = new PutObjectCommand(input);
    const url = await getSignedUrl(this.client, cmd, { expiresIn: this.signedPutTtlSec });
    return { url, key, expiresInSec: this.signedPutTtlSec, method: 'PUT' as const, contentType: contentType ?? null };
  }

  async presignGet(key: string) {
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const url = await getSignedUrl(this.client, cmd, { expiresIn: this.signedGetTtlSec });
    return { url, key, expiresInSec: this.signedGetTtlSec, method: 'GET' as const };
  }

  async headObject(key: string) {
    const cmd = new HeadObjectCommand({ Bucket: this.bucket, Key: key });
    return this.client.send(cmd);
  }

  async getObjectBuffer(key: string) {
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const res = await this.client.send(cmd);
    const body = res.Body;
    if (!body) {
      throw new Error('R2_GET_OBJECT_EMPTY_BODY');
    }

    // AWS SDK v3 Body can be a stream with transformToByteArray()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyBody: any = body as any;
    if (typeof anyBody.transformToByteArray === 'function') {
      const bytes = await anyBody.transformToByteArray();
      return Buffer.from(bytes);
    }

    // Fallback for older runtimes: collect stream manually
    const chunks: Buffer[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const chunk of body as any) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async putObject(key: string, data: Buffer, options: R2PutOptions = {}) {
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: data,
      ...(options.contentType ? { ContentType: options.contentType } : {}),
      ...(options.cacheControl ? { CacheControl: options.cacheControl } : {}),
    });
    return this.client.send(cmd);
  }

  async deleteObjects(keys: string[]) {
    const unique = Array.from(new Set(keys.filter(Boolean)));
    if (unique.length === 0) {
      return;
    }

    const input: DeleteObjectsCommandInput = {
      Bucket: this.bucket,
      Delete: {
        Objects: unique.map((Key) => ({ Key })),
        Quiet: true,
      },
    };
    const cmd = new DeleteObjectsCommand(input);
    return this.client.send(cmd);
  }
}

