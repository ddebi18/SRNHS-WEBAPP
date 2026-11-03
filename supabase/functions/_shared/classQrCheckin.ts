export interface ClassQrCheckinInput {
  token: string;
  lrn: string;
  verifier: string;
}

export function parseClassQrCheckinInput(body: unknown): ClassQrCheckinInput | null {
  if (!body || typeof body !== 'object') return null;

  const input = body as Record<string, unknown>;
  const token = typeof input.token === 'string' ? input.token.trim() : '';
  const lrn = typeof input.lrn === 'string' ? input.lrn.trim() : '';
  const verifier = typeof input.birthdateOrLastName === 'string'
    ? input.birthdateOrLastName.trim()
    : '';

  if (!token || token.length > 256 || !/^\d{12}$/.test(lrn) || !verifier || verifier.length > 120) {
    return null;
  }

  return { token, lrn, verifier };
}

export function matchesClassQrIdentity(
  lastName: string | null,
  birthdate: string | null,
  verifier: string
): boolean {
  const normalizedVerifier = verifier.trim().toLocaleLowerCase();
  return Boolean(
    (lastName && lastName.trim().toLocaleLowerCase() === normalizedVerifier) ||
    (birthdate && birthdate === verifier.trim())
  );
}
