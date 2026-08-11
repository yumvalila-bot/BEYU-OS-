/**
 * Domain-level error helpers.
 *
 * Every domain service throws these rather than raw NestJS exceptions, so the
 * message wording, the shape of the response and — most importantly — what is
 * *not* said stay consistent. A 404 must not confirm that a record exists in
 * another tenant, and a conflict must not echo internal column names.
 */

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { assertOrganizationNameAllowed, ForbiddenOrganizationNameError } from '@beyu/types';

/**
 * Not found, or not visible to this caller. The two are deliberately the same
 * response: distinguishing them would let a caller probe for the existence of
 * records in tenants they cannot read.
 */
export function notFound(resource: string, id?: string): never {
  throw new NotFoundException(
    id ? `No ${resource} with id ${id} is visible to you.` : `No such ${resource}.`,
  );
}

/** A state transition the domain forbids. */
export function invalidTransition(
  resource: string,
  from: string,
  to: string,
  because?: string,
): never {
  const base = `A ${resource} in state ${from} cannot move to ${to}.`;
  throw new ConflictException(because ? `${base} ${because}` : base);
}

/** A rule violation in the request itself. */
export function invalidRequest(message: string): never {
  throw new BadRequestException(message);
}

/**
 * Rejects a forbidden organization name as a 400 rather than a 500.
 *
 * `@beyu/types` is framework-free and throws a plain Error, which the exception
 * filter would otherwise report as an internal error. A caller supplying a
 * forbidden name made a bad request, and the response must say so.
 */
export function assertNameAllowed(...names: (string | null | undefined)[]): void {
  for (const name of names) {
    if (!name) continue;
    try {
      assertOrganizationNameAllowed(name);
    } catch (error) {
      if (error instanceof ForbiddenOrganizationNameError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}

/** True when a Postgres error is a unique-constraint violation. */
export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string })?.code === '23505';
}

/** True when a Postgres error is a check-constraint violation. */
export function isCheckViolation(error: unknown): boolean {
  return (error as { code?: string })?.code === '23514';
}

/** True when a Postgres error is a foreign-key violation. */
export function isForeignKeyViolation(error: unknown): boolean {
  return (error as { code?: string })?.code === '23503';
}

/**
 * Names the constraint a Postgres error violated, when it reports one.
 *
 * Used to turn a database invariant into a readable message. The constraint
 * name is an internal detail, so callers map it to their own wording rather
 * than passing it through to the client.
 */
export function constraintName(error: unknown): string | null {
  const name = (error as { constraint?: string })?.constraint;
  return typeof name === 'string' ? name : null;
}
