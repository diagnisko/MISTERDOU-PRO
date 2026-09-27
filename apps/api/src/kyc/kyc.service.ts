import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { SubmitKycDto } from './dto/kyc.dto';

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** URL signée PUT pour téléverser directement vers R2 (bucket privé KYC). */
  async presignUpload(userId: string, docKind: string, contentType: string) {
    const kyc = await this.prisma.client.identityVerification.findUnique({
      where: { userId },
    });

    if (kyc?.status === 'APPROVED') {
      throw new BadRequestException('Votre identité est déjà vérifiée.');
    }
    if (kyc?.status === 'SUBMITTED' || kyc?.status === 'UNDER_REVIEW') {
      throw new BadRequestException(
        'Votre dossier est en cours de traitement. Patientez la décision.',
      );
    }

    return this.storage.presignKycUpload(userId, docKind, contentType);
  }

  /** Soumission du dossier — exige les 3 documents déjà téléversés. */
  async submit(userId: string, dto: SubmitKycDto) {
    const kyc = await this.prisma.client.identityVerification.upsert({
      where: { userId },
      update: {
        docType: dto.docType,
        docNumber: dto.docNumber,
        status: 'SUBMITTED',
        submittedAt: new Date(),
        rejectionReason: null,
      },
      create: {
        userId,
        docType: dto.docType,
        docNumber: dto.docNumber,
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
    });

    if (!kyc.docFrontKey || !kyc.docBackKey || !kyc.selfieKey) {
      throw new BadRequestException(
        'Documents incomplets : recto, verso et selfie sont obligatoires.',
      );
    }

    return { status: kyc.status, submittedAt: kyc.submittedAt };
  }

  /** Enregistre la clé d'un document effectivement téléversé (confirmation client). */
  async confirmUpload(
    userId: string,
    docKind: string,
    objectKey: string,
  ) {
    if (kycKeySecurity(userId, objectKey) === false) {
      throw new ForbiddenException('Clé objet invalide.');
    }

    const data =
      docKind === 'doc-front'
        ? { docFrontKey: objectKey }
        : docKind === 'doc-back'
          ? { docBackKey: objectKey }
          : { selfieKey: objectKey };

    return this.prisma.client.identityVerification.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
  }

  /** Statut du dossier (vue client). */
  async myStatus(userId: string) {
    const kyc = await this.prisma.client.identityVerification.findUnique({
      where: { userId },
      select: {
        status: true,
        docType: true,
        submittedAt: true,
        rejectionReason: true,
        reviewedAt: true,
      },
    });
    if (!kyc) return { status: 'PENDING', submitted: false };
    return kyc;
  }

  /** Liste des dossiers en attente (revue admin/staff). */
  async listPending(page = 1, perPage = 20) {
    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.identityVerification.findMany({
        where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
        include: {
          user: { select: { email: true, firstName: true, lastName: true } },
        },
        orderBy: { submittedAt: 'asc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.client.identityVerification.count({
        where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
      }),
    ]);
    return { items, total, page, perPage };
  }

  /**
   * URL signée GET pour consulter un document (revue admin/staff).
   * §23 : l'accès aux pièces sensibles est journalisé dans l'AuditLog.
   */
  async viewDocument(
    reviewerId: string,
    verificationId: string,
    docKind: 'doc-front' | 'doc-back' | 'selfie',
  ) {
    const kyc = await this.prisma.client.identityVerification.findUnique({
      where: { id: verificationId },
    });
    if (!kyc) throw new NotFoundException('Dossier introuvable.');

    const objectKey =
      docKind === 'doc-front'
        ? kyc.docFrontKey
        : docKind === 'doc-back'
          ? kyc.docBackKey
          : kyc.selfieKey;

    if (!objectKey) throw new NotFoundException('Document indisponible.');

    // Audit : qui consulte quel document sensible, et quand (§23/§24)
    await this.prisma.client.auditLog.create({
      data: {
        actorId: reviewerId,
        action: 'KYC_DOCUMENT_VIEWED',
        entity: 'IdentityVerification',
        entityId: verificationId,
        metadata: { docKind },
      },
    });

    return this.storage.presignKycDownload(objectKey);
  }

  /** Décision admin : approbation ou rejet + historique + audit. */
  async review(
    reviewerId: string,
    verificationId: string,
    decision: 'APPROVED' | 'REJECTED',
    comment?: string,
  ) {
    const kyc = await this.prisma.client.identityVerification.findUnique({
      where: { id: verificationId },
    });
    if (!kyc) throw new NotFoundException('Dossier introuvable.');

    const updated = await this.prisma.client.$transaction(async (tx) => {
      const newStatus =
        decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';

      const result = await tx.identityVerification.update({
        where: { id: verificationId },
        data: {
          status: newStatus,
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
          rejectionReason: decision === 'REJECTED' ? (comment ?? 'Non conforme') : null,
        },
      });

      await tx.verificationHistory.create({
        data: {
          verificationId,
          previousStatus: kyc.status,
          newStatus,
          comment: comment ?? null,
          actorId: reviewerId,
        },
      });

      // AuditLog §24 — action administrative sensible
      await tx.auditLog.create({
        data: {
          actorId: reviewerId,
          action: `KYC_${decision}`,
          entity: 'IdentityVerification',
          entityId: verificationId,
          metadata: { comment: comment ?? null },
        },
      });

      // Approbation → l'utilisateur peut acheter / vendre (user ACTIVE)
      if (decision === 'APPROVED') {
        await tx.user.update({
          where: { id: kyc.userId },
          data: { status: 'ACTIVE' },
        });
      }

      return result;
    });

    this.logger.log(`KYC ${decision} — dossier ${verificationId} par ${reviewerId}`);
    return { status: updated.status, reviewedAt: updated.reviewedAt };
  }
}

/** Le client ne peut confirmer que ses propres clés (préfixe kyc/{userId}/). */
function kycKeySecurity(userId: string, objectKey: string): boolean {
  return objectKey.startsWith(`kyc/${userId}/`);
}
