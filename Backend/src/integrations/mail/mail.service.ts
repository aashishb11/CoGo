import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '@core/database/database.module';
import type * as schema from '@core/database/schema';
import { resolveLocale } from '@shared/i18n/locale';
import type { Brand } from './templates/layout';
import { renderVerification } from './templates/verification';
import { renderResetPassword } from './templates/reset-password';
import {
  renderIncidentAlert,
  type IncidentAlertPayload,
} from './templates/incident-alert';

// Preserves the existing import path used by `incidents.service.ts` and the
// e2e harness; the type now lives with its renderer.
export type { IncidentAlertPayload };

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(DB) private readonly db: PostgresJsDatabase<typeof schema>,
  ) {}

  async sendVerificationEmail({
    userId,
    email,
    url,
  }: {
    userId: string;
    email: string;
    url: string;
  }): Promise<void> {
    const locale = await resolveLocale(this.db, userId);
    const { subject, html } = renderVerification(locale, {
      brand: this.brand(),
      url,
    });
    await this.send({ email, subject, htmlContent: html });
    this.logger.log(`Verification email sent to ${email} (${locale})`);
  }

  async sendResetPasswordEmail({
    userId,
    email,
    url,
  }: {
    userId: string;
    email: string;
    url: string;
  }): Promise<void> {
    const locale = await resolveLocale(this.db, userId);
    const { subject, html } = renderResetPassword(locale, {
      brand: this.brand(),
      url,
    });
    await this.send({ email, subject, htmlContent: html });
    this.logger.log(`Password reset email sent to ${email} (${locale})`);
  }

  /**
   * Safety-incident alert (US-06). Sent to the reporter's trusted contact
   * after the incident row commits. The other-party block depends on who
   * filed the report:
   *  - passenger reporter → driver name + car make/model/plate.
   *  - driver reporter → list of every accepted passenger on the ride
   *    (name + phone).
   *
   * Locale is resolved off the reporter's profile, mirroring every other
   * MailService method.
   */
  async sendIncidentAlertEmail(payload: IncidentAlertPayload): Promise<void> {
    const locale = await resolveLocale(this.db, payload.reporterId);
    const { subject, html } = renderIncidentAlert(locale, {
      brand: this.brand(),
      payload,
    });
    await this.send({
      email: payload.trustedContact.email,
      subject,
      htmlContent: html,
    });
    this.logger.log(
      `Incident alert email sent to ${payload.trustedContact.email} (${locale}, reporter=${payload.reporterRole})`,
    );
  }

  private brand(): Brand {
    // Logo is served by this backend from `public/cogo-logo.png` at
    // `/static/cogo-logo.png` (mounted in main.ts via useStaticAssets).
    const baseUrl = this.config.getOrThrow<string>('BETTER_AUTH_URL');
    return {
      productName: this.config.getOrThrow<string>('MAIL_FROM_NAME'),
      supportEmail: this.config.getOrThrow<string>('MAIL_FROM_EMAIL'),
      logoUrl: `${baseUrl.replace(/\/$/, '')}/static/cogo-logo.png`,
    };
  }

  private async send({
    email,
    subject,
    htmlContent,
  }: {
    email: string;
    subject: string;
    htmlContent: string;
  }): Promise<void> {
    const response = await fetch(
      this.config.getOrThrow<string>('BREVO_API_URL'),
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'api-key': this.config.getOrThrow<string>('BREVO_API_KEY'),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: {
            name: this.config.getOrThrow<string>('MAIL_FROM_NAME'),
            email: this.config.getOrThrow<string>('MAIL_FROM_EMAIL'),
          },
          to: [{ email }],
          subject,
          htmlContent,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to send email: ${error}`);
    }
  }
}
