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
  uploadUrl: string;   // URL signée PUT — expire selon SIGNED_URL_TTL
  expiresIn: number;    // secondes
}

export interface PresignedDownload {
  url: string;         // URL signée GET — expire selon SIGNED_URL_TTL (défaut 60s)
  expiresIn: number;
}

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

  private get ttl(): number {
    return Number(process.env.SIGNED_URL_TTL ?? 60);
  }

  /**
   * Génère une clé d'objet unique pour un document KYC.
   * Format : kyc/{userId}/{docKind}/{uuid}.{ext}
   */
  buildKycKey(userId: string, docKind: string, ext: string): string {
    const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
    return `kyc/${userId}/${docKind}/${randomUUID()}.${safeExt || 'bin'}`;
  }

  /**
   * URL signée PUT — le client téléverse DIRECTEMENT vers R2 (privé).
   * Le serveur ne touche jamais le binaire : rapide + sécurisé.
   */
  async presignKycUpload(
    userId: string,
    docKind: string, // doc-front | doc-back | selfie
    contentType: string,
  ): Promise<PresignedUpload> {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(contentType)) {
      throw new Error(`Type MIME non autorisé : ${contentType}`);
    }
    const ext = contentType.split('/')[1];
    const objectKey = this.buildKycKey(userId, docKind, ext);

    const cmd = new PutObjectCommand({
      Bucket: this.kycBucket,
      Key: objectKey,
      ContentType: contentType,
      // Métadonnées : traçabilité côté stockage
      Metadata: { userid: userId, dockind: docKind },
    });

    const uploadUrl = await getSignedUrl(this.s3, cmd, { expiresIn: this.ttl });
    return { objectKey, uploadUrl, expiresIn: this.ttl };
  }

  /**
   * URL signée GET — accès temporaire (60s par défaut) à un document KYC.
   * Uniquement pour les personnes autorisées (revue admin/staff, §23).
   */
  async presignKycDownload(objectKey: string): Promise<PresignedDownload> {
    const cmd = new GetObjectCommand({ Bucket: this.kycBucket, Key: objectKey });
    const url = await getSignedUrl(this.s3, cmd, { expiresIn: this.ttl });
    return { url, expiresIn: this.ttl };
  }

  /**
   * Suppression d'un document KYC (ex : rejet + RGPD/purge).
   */
  async deleteKycObject(objectKey: string): Promise<void> {
    const cmd = new DeleteObjectCommand({ Bucket: this.kycBucket, Key: objectKey });
    await this.s3.send(cmd);
    this.logger.log(`KYC object deleted: ${objectKey}`);
  }
}
