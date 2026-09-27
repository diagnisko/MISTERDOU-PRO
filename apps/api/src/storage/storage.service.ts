import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

export interface PresignedUpload {
  objectKey: string;
  uploadUrl: string;
  publicUrl?: string;
  expiresIn: number;
}

export interface PresignedDownload {
  url: string;
  expiresIn: number;
}

// Limites strictes côté serveur — le client n'a jamais le dernier mot
const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_VIDEO_MIME = ['video/mp4', 'video/webm'];

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client;

  constructor() {
    this.s3 = new S3Client({
      region: process.env.S3_REGION ?? 'auto',
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: true, // requis par R2
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? '',
        secretAccessKey: process.env.S3_SECRET_KEY ?? '',
      },
    });
  }

  private get kycBucket(): string {
    return process.env.S3_BUCKET_KYC ?? 'misterdou-kyc';
  }

  private get mediaBucket(): string {
    return process.env.S3_BUCKET_MEDIA ?? 'misterdou-media';
  }

  private get mediaPublicBaseUrl(): string {
    return (process.env.S3_BUCKET_MEDIA_PUBLIC_URL ?? '').replace(/\/$/, '');
  }

  private get ttl(): number {
    return Number(process.env.SIGNED_URL_TTL ?? 60);
  }

  // ============ KYC — bucket PRIVÉ ============

  /** Clé unique : kyc/{userId}/{docKind}/{uuid}.{ext} */
  buildKycKey(userId: string, docKind: string, ext: string): string {
    const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
    return `kyc/${userId}/${docKind}/${randomUUID()}.${safeExt || 'bin'}`;
  }

  /** URL signée PUT — upload direct client → R2 privé. */
  async presignKycUpload(
    userId: string,
    docKind: string,
    contentType: string,
  ): Promise<PresignedUpload> {
    if (!ALLOWED_IMAGE_MIME.includes(contentType)) {
      throw new Error(`Type MIME non autorisé : ${contentType}`);
    }
    const ext = contentType.split('/')[1];
    const objectKey = this.buildKycKey(userId, docKind, ext);

    const cmd = new PutObjectCommand({
      Bucket: this.kycBucket,
      Key: objectKey,
      ContentType: contentType,
      Metadata: { userid: userId, dockind: docKind },
    });

    const uploadUrl = await getSignedUrl(this.s3, cmd, { expiresIn: this.ttl });
    return { objectKey, uploadUrl, expiresIn: this.ttl };
  }

  /** URL signée GET 60 s — accès temporaire aux documents KYC. */
  async presignKycDownload(objectKey: string): Promise<PresignedDownload> {
    const cmd = new GetObjectCommand({ Bucket: this.kycBucket, Key: objectKey });
    const url = await getSignedUrl(this.s3, cmd, { expiresIn: this.ttl });
    return { url, expiresIn: this.ttl };
  }

  async deleteKycObject(objectKey: string): Promise<void> {
    const cmd = new DeleteObjectCommand({ Bucket: this.kycBucket, Key: objectKey });
    await this.s3.send(cmd);
    this.logger.log(`KYC object deleted: ${objectKey}`);
  }

  // ============ MÉDIAS OFFRES — bucket PUBLIC ============

  /**
   * URL signée PUT pour un média d'offre (image ou vidéo).
   * Validation STRICTE serveur : MIME dans la liste + taille max.
   * Le média est ensuite servi via l'URL publique R2.
   */
  async presignMediaUpload(
    productId: string,
    contentType: string,
    contentLength: number,
  ): Promise<PresignedUpload> {
    const maxImage = Number(process.env.MEDIA_MAX_IMAGE_MB ?? 5) * 1024 * 1024;
    const maxVideo = Number(process.env.MEDIA_MAX_VIDEO_MB ?? 50) * 1024 * 1024;

    let ext: string;
    if (ALLOWED_IMAGE_MIME.includes(contentType)) {
      if (contentLength > maxImage) {
        throw new Error(`Image trop volumineuse (max ${maxImage / 1024 / 1024} Mo).`);
      }
      ext = contentType.split('/')[1];
    } else if (ALLOWED_VIDEO_MIME.includes(contentType)) {
      if (contentLength > maxVideo) {
        throw new Error(`Vidéo trop volumineuse (max ${maxVideo / 1024 / 1024} Mo).`);
      }
      ext = contentType.split('/')[1];
    } else {
      throw new Error(`Type MIME non autorisé : ${contentType}`);
    }

    const objectKey = `media/products/${productId}/${randomUUID()}.${ext}`;

    const cmd = new PutObjectCommand({
      Bucket: this.mediaBucket,
      Key: objectKey,
      ContentType: contentType,
      Metadata: { productid: productId },
    });

    const uploadUrl = await getSignedUrl(this.s3, cmd, { expiresIn: 300 }); // 5 min pour les gros fichiers
    const publicUrl = this.mediaPublicBaseUrl
      ? `${this.mediaPublicBaseUrl}/${objectKey}`
      : undefined;

    return { objectKey, uploadUrl, publicUrl, expiresIn: 300 };
  }

  /** URL publique d'un média (bucket public). */
  mediaPublicUrl(objectKey: string): string {
    if (!this.mediaPublicBaseUrl) {
      throw new Error('S3_BUCKET_MEDIA_PUBLIC_URL non configurée.');
    }
    return `${this.mediaPublicBaseUrl}/${objectKey}`;
  }

  async deleteMediaObject(objectKey: string): Promise<void> {
    const cmd = new DeleteObjectCommand({ Bucket: this.mediaBucket, Key: objectKey });
    await this.s3.send(cmd);
    this.logger.log(`Media object deleted: ${objectKey}`);
  }
}
