import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST', 'localhost'),
      port: this.configService.get<number>('SMTP_PORT', 1025),
      secure: false,
      ignoreTLS: true,
    });
  }

  async sendVerificationEmail(email: string, token: string, firstName: string) {
    const apiUrl = this.configService.get<string>('API_BASE_URL', 'http://localhost:3001');
    const verifyUrl = `${apiUrl}/api/v1/auth/email/verify?token=${token}`;

    try {
      await this.transporter.sendMail({
        from: this.configService.get<string>('SMTP_FROM', 'noreply@neofilm.io'),
        to: email,
        subject: 'NeoFilm — Vérifiez votre adresse email',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Bienvenue sur NeoFilm, ${firstName} !</h2>
            <p>Merci de vous être inscrit. Veuillez vérifier votre adresse email en cliquant sur le bouton ci-dessous :</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verifyUrl}" style="background-color: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                Vérifier mon email
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">Ce lien expire dans 24 heures.</p>
            <p style="color: #666; font-size: 14px;">Si vous n'avez pas créé de compte, ignorez cet email.</p>
          </div>
        `,
      });
      this.logger.log(`Verification email sent to ${email}`);
    } catch (err) {
      this.logger.error(`Failed to send verification email to ${email}: ${err}`);
    }
  }

  async sendWelcomeEmail(email: string, firstName: string) {
    try {
      await this.transporter.sendMail({
        from: this.configService.get<string>('SMTP_FROM', 'noreply@neofilm.io'),
        to: email,
        subject: 'NeoFilm — Bienvenue !',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Bienvenue, ${firstName} !</h2>
            <p>Votre adresse email a été vérifiée avec succès. Vous pouvez maintenant vous connecter à NeoFilm.</p>
          </div>
        `,
      });
    } catch (err) {
      this.logger.error(`Failed to send welcome email to ${email}: ${err}`);
    }
  }
}
