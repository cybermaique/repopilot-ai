import {
  ArgumentsHost,
  CanActivate,
  Catch,
  ExceptionFilter,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CONFIG, type AppConfig } from '../config.js';

@Injectable()
export class LocalIdentityGuard implements CanActivate {
  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const origin = request.headers.origin;
    if (origin && origin !== this.config.LOCAL_ORIGIN)
      throw new ForbiddenException('Origin not allowed.');
    // Block cross-site mutations, including simple form requests. API clients without browser headers are local CLI use.
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      request.headers['sec-fetch-site'] === 'cross-site'
    )
      throw new ForbiddenException('Cross-site mutation not allowed.');
    return true;
  }
}

@Catch()
export class SafeErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (response.headersSent) {
      response.end();
      return;
    }
    const status = error instanceof HttpException ? error.getStatus() : 500;
    let message =
      'Internal error. Check local database and service availability.';
    if (error instanceof HttpException) {
      const body = error.getResponse();
      const value =
        typeof body === 'object' && body !== null && 'message' in body
          ? body.message
          : body;
      message = Array.isArray(value) ? value.join('; ') : String(value);
    }
    response.status(status).json({ statusCode: status, message });
  }
}
