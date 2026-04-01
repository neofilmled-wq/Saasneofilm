import { z } from 'zod';

/**
 * Forbidden patterns matching the server-side SanitizePipe.
 * Rejects strings containing characters/patterns that could be used for
 * XSS, HTML injection, template injection, or script injection.
 */
const FORBIDDEN_REGEX = /[<>]|javascript:|on\w+\s*=|\{\{|\}\}|\$\{|\0/i;

const FORBIDDEN_MESSAGE = 'Ce champ contient des caractères interdits (< > ou code potentiellement dangereux)';

/** Zod refinement: rejects dangerous characters in a string */
export function safeString(schema: z.ZodString) {
  return schema.refine((val) => !FORBIDDEN_REGEX.test(val), { message: FORBIDDEN_MESSAGE });
}

/** Standalone check for non-Zod forms */
export function containsForbiddenChars(value: string): boolean {
  return FORBIDDEN_REGEX.test(value);
}

export const FORBIDDEN_CHARS_MESSAGE = FORBIDDEN_MESSAGE;
