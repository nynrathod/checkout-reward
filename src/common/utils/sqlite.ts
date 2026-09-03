export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}
