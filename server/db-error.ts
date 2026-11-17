/**
 * Message Postgres d'une erreur DB. Depuis drizzle-orm 0.44, l'erreur levée est un
 * DrizzleQueryError dont `message` contient la requête SQL complète ; le message
 * Postgres d'origine est dans `cause`.
 */
export function dbErrorMessage(err: unknown): string {
  const e = err as any;
  return String(e?.cause?.message || e?.message || e || "");
}
