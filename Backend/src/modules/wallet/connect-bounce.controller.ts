import { Controller, Get, Header, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

/**
 * Stripe Connect `accountLinks.create` rejects `return_url` / `refresh_url`
 * with custom schemes (e.g. `cogo://`) — they must be http(s). These two
 * routes are the destinations Stripe redirects the driver back to. The
 * Expo `WebBrowser.openAuthSessionAsync` on the mobile side is configured
 * with the same URL prefix, so the in-app browser closes as soon as
 * Stripe navigates here and the wallet/payout screens refetch on focus.
 *
 * The HTML body is a courtesy in case anyone lands here outside the
 * in-app browser (e.g. desktop preview).
 */
const HTML = (heading: string, body: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>CoGo</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
         text-align: center; padding: 48px 24px; color: #1f2937; }
  h1 { font-size: 24px; margin-bottom: 8px; }
  p { color: #4b5563; }
</style>
</head>
<body>
<h1>${heading}</h1>
<p>${body}</p>
<p>You can close this window and return to the app.</p>
</body>
</html>`;

@ApiTags('Wallet')
@AllowAnonymous()
@Controller('wallet')
export class ConnectBounceController {
  @Get('connect-return')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({
    summary: 'Stripe Connect onboarding return target',
    description:
      'Public bounce page that Stripe Connect Express redirects the driver to after onboarding. The mobile in-app browser closes on URL match; the wallet refetches on focus.',
  })
  @ApiOkResponse({ description: 'HTML thank-you page.' })
  connectReturn(): string {
    return HTML('Onboarding complete', 'CoGo is updating your payout account.');
  }

  @Get('connect-refresh')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({
    summary: 'Stripe Connect onboarding refresh target',
    description:
      'Public bounce page Stripe Connect uses when an onboarding link expires. The driver re-launches onboarding from the app.',
  })
  @ApiOkResponse({ description: 'HTML expired-link page.' })
  connectRefresh(): string {
    return HTML(
      'Onboarding link expired',
      'Return to the app and tap the onboarding button again.',
    );
  }
}
