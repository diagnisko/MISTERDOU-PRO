import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

/**
 * E-mails transactionnels — Nodemailer (SMTP).
 * Désactivé proprement si SMTP_URL absent (dev) : les e-mails sont loggés.
 * Toutes les notifications e-mail sont BEST-EFFORT : un échec d'envoi
 * ne bloque JAMAIS le flux métier (l'in-app reste la source de vérité).
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transporter?: nodemailer.Transporter;
  private from: string;

  onModuleInit() {
    const smtpUrl = process.env.SMTP_URL;
    this.from = process.env.SMTP_FROM ?? 'MISTERDOU <no-reply@misterdou.pro>';

    if (!smtpUrl) {
      this.logger.warn('SMTP_URL absent — e-mails en mode log (dev).');
      return;
    }
    this.transporter = nodemailer.createTransport(smtpUrl);
  }

  /** Envoi générique — best effort, erreurs avalées (loggées). */
  private async send(to: string, subject: string, html: string, text: string) {
    if (!this.transporter) {
      this.logger.log(`[DEV MAIL] to=${to} subject="${subject}"`);
      return;
    }
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html, text });
    } catch (e) {
      this.logger.error(`Envoi e-mail échoué (${subject}) : ${(e as Error).message}`);
    }
  }

  /** Vérification d'e-mail — token à usage unique. */
  async sendEmailVerification(to: string, token: string) {
    const url = `${process.env.WEB_URL ?? 'http://localhost:3000'}/verify-email?token=${token}`;
    await this.send(
      to,
      'Confirmez votre e-mail MISTERDOU',
      `<p>Bienvenue sur MISTERDOU !</p>
       <p>Cliquez pour confirmer votre e-mail (valide 24 h) :</p>
       <p><a href="${url}">Confirmer mon e-mail</a></p>`,
      `Confirmez votre e-mail : ${url}`,
    );
  }

  /** Bienvenue post-vérification. */
  async sendWelcome(to: string, firstName?: string | null) {
    await this.send(
      to,
      'Bienvenue sur MISTERDOU 🎮',
      `<p>Bonjour ${firstName ?? ''},</p>
       <p>Votre compte MISTERDOU est actif. Bonnes découvertes !</p>`,
      `Bonjour ${firstName ?? ''}, votre compte est actif.`,
    );
  }

  /** Alerte de sécurité — nouvelle connexion. */
  async sendLoginAlert(to: string, ip: string, userAgent?: string) {
    await this.send(
      to,
      'Nouvelle connexion à votre compte',
      `<p>Une nouvelle connexion a été détectée.</p>
       <p><strong>IP :</strong> ${ip}<br/>
       <strong>Appareil :</strong> ${userAgent ?? 'inconnu'}</p>
       <p>Si ce n'était pas vous, changez votre mot de passe immédiatement.</p>`,
      `Nouvelle connexion depuis ${ip}. Si ce n'était pas vous, sécurisez votre compte.`,
    );
  }

  /** Réinitialisation de mot de passe. */
  async sendPasswordReset(to: string, token: string) {
    const url = `${process.env.WEB_URL ?? 'http://localhost:3000'}/reset-password?token=${token}`;
    await this.send(
      to,
      'Réinitialisation de votre mot de passe',
      `<p>Cliquez pour définir un nouveau mot de passe (valide 1 h) :</p>
       <p><a href="${url}">Réinitialiser</a></p>
       <p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>`,
      `Réinitialiser votre mot de passe : ${url}`,
    );
  }

  /** Échéance de financement à venir. */
  async sendInstallmentDue(to: string, amount: number, dueDate: Date) {
    await this.send(
      to,
      `Rappel : mensualité de ${amount} FCFA à venir`,
      `<p>Votre mensualité de <strong>${amount} FCFA</strong> arrive à échéance le
       <strong>${dueDate.toLocaleDateString('fr-FR')}</strong>.</p>
       <p>Connectez-vous pour la régler et éviter les retards.</p>`,
      `Mensualité de ${amount} FCFA à échéance le ${dueDate.toLocaleDateString('fr-FR')}.`,
    );
  }

  /** Code 2FA — authentification admin/staff (transport e-mail). */
  async sendTwoFactorCode(to: string, code: string) {
    await this.send(
      to,
      'Votre code de connexion MISTERDOU',
      `<p>Votre code de sécurité : <strong style="font-size:1.4em">${code}</strong></p>
       <p>Il expire dans 10 minutes. Ne le partagez jamais.</p>`,
      `Code : ${code} (expire dans 10 min)`,
    );
  }
}
