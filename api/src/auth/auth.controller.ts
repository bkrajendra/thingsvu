import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import type { Client } from 'openid-client';
import { AuthService } from './auth.service';
import { OIDC_CLIENT } from './oidc-client.provider';
import { Inject } from '@nestjs/common';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
    @Inject(OIDC_CLIENT) private readonly client: Client,
  ) {}

  @Get('login')
  login(@Req() req: Request, @Res() res: Response): void {
    const { url, codeVerifier, state } =
      this.authService.buildAuthorizationRequest(this.client);
    req.session.pkceVerifier = codeVerifier;
    req.session.oauthState = state;
    res.redirect(url);
  }

  @Get('callback')
  async callback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const { code, state, iss } = req.query as {
      code?: string;
      state?: string;
      iss?: string;
    };
    if (
      !code ||
      !state ||
      !req.session.pkceVerifier ||
      !req.session.oauthState
    ) {
      throw new UnauthorizedException('Missing OAuth callback parameters');
    }

    const tokenSet = await this.authService.exchangeCode(
      this.client,
      { code, state, iss },
      { codeVerifier: req.session.pkceVerifier, state: req.session.oauthState },
    );
    const sessionUser = this.authService.toSessionUser(tokenSet);

    // Regenerate the session on successful login (new session ID) rather than
    // reusing the pre-auth session — prevents session fixation, where an
    // attacker who planted a known session ID before login would otherwise
    // inherit the now-authenticated session.
    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });
    req.session.user = sessionUser;

    const csrfToken = randomBytes(24).toString('hex');
    res.cookie('csrf_token', csrfToken, {
      httpOnly: false,
      sameSite: 'lax',
      secure: this.config.get<string>('NODE_ENV') === 'production',
    });

    res.redirect(this.config.get<string>('WEB_BASE_URL')!);
  }

  @Post('logout')
  logout(@Req() req: Request, @Res() res: Response): void {
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    req.session.destroy(() => {
      res.clearCookie(this.config.get<string>('SESSION_COOKIE_NAME')!, {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction,
      });
      res.clearCookie('csrf_token', {
        httpOnly: false,
        sameSite: 'lax',
        secure: isProduction,
      });
      res.status(204).send();
    });
  }

  @Get('me')
  me(@Req() req: Request): { user: Request['session']['user'] } {
    if (!req.session?.user) {
      throw new UnauthorizedException();
    }
    return { user: req.session.user };
  }
}
