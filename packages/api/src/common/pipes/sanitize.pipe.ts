import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

/**
 * Characters that are dangerous in HTML/JS/SQL contexts.
 * We reject any string field containing these to prevent XSS and injection.
 */
const FORBIDDEN_PATTERNS = [
  /</g,
  />/g,
  /javascript:/gi,
  /on\w+\s*=/gi,       // onclick=, onerror=, etc.
  /<script/gi,
  /<\/script/gi,
  /\{\{/g,             // template injection {{ }}
  /\}\}/g,
  /\$\{/g,             // template literal ${
  /\0/g,               // null byte
];

const FORBIDDEN_CHARS_REGEX = /[<>]/;

/**
 * Recursively sanitize and validate all string fields in an object.
 * Throws BadRequestException if dangerous characters are found.
 */
function validateObject(obj: any, path = ''): void {
  if (obj === null || obj === undefined) return;

  if (typeof obj === 'string') {
    // Check for forbidden characters
    if (FORBIDDEN_CHARS_REGEX.test(obj)) {
      throw new BadRequestException(
        `Le champ ${path || 'valeur'} contient des caractères interdits (< ou >)`,
      );
    }
    // Check for dangerous patterns
    for (const pattern of FORBIDDEN_PATTERNS) {
      pattern.lastIndex = 0; // reset regex state
      if (pattern.test(obj)) {
        throw new BadRequestException(
          `Le champ ${path || 'valeur'} contient du contenu non autorisé`,
        );
      }
    }
    return;
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      validateObject(obj[i], `${path}[${i}]`);
    }
    return;
  }

  if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      validateObject(obj[key], path ? `${path}.${key}` : key);
    }
  }
}

/**
 * NestJS pipe that validates all string fields in the request body
 * to prevent XSS, HTML injection, and script injection.
 *
 * Usage: @UsePipes(SanitizePipe) or @Body(SanitizePipe)
 */
@Injectable()
export class SanitizePipe implements PipeTransform {
  transform(value: any) {
    if (value && typeof value === 'object') {
      validateObject(value);
    }
    return value;
  }
}
