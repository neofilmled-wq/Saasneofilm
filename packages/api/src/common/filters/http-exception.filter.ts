import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Erreurs d'INPUT Prisma → 4xx, pas 500. Un client qui envoie un
    // `limit=abc`, un id mal formé, etc. provoque une PrismaClientValidationError :
    // c'est une faute de requête (400), pas un bug serveur. Détection par nom de
    // classe (évite un import couplé au runtime Prisma). Messages génériques →
    // aucune fuite de détail interne au client.
    const exName =
      (exception as any)?.constructor?.name ?? (exception as any)?.name;
    let prismaStatus: number | null = null;
    let prismaMessage: string | null = null;
    if (!(exception instanceof HttpException)) {
      if (exName === 'PrismaClientValidationError') {
        prismaStatus = HttpStatus.BAD_REQUEST;
        prismaMessage = 'Requête invalide (paramètres incorrects)';
      } else if (exName === 'PrismaClientKnownRequestError') {
        const code = (exception as any)?.code;
        if (code === 'P2025') {
          prismaStatus = HttpStatus.NOT_FOUND;
          prismaMessage = 'Ressource introuvable';
        } else if (code === 'P2002') {
          prismaStatus = HttpStatus.CONFLICT;
          prismaMessage = 'Conflit : cette ressource existe déjà';
        }
      }
    }

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : prismaStatus ?? HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : prismaMessage ?? 'Internal server error';

    const messageObj = typeof message === 'object' && message !== null ? (message as any) : null;
    const errorResponse: Record<string, any> = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message: typeof message === 'string' ? message : messageObj?.message || message,
    };
    if (messageObj?.errors) {
      errorResponse.errors = messageObj.errors;
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} ${status}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json(errorResponse);
  }
}
