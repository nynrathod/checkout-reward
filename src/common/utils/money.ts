// Always use cents. Floats cause rounding errors.
// Floor the discount so the total never goes negative.
export function discountCents(
  subtotalCents: number,
  percentOff: number,
): number {
  return Math.min(
    Math.floor((subtotalCents * percentOff) / 100),
    subtotalCents,
  );
}
