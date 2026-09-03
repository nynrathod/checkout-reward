export function discountCents(
  subtotalCents: number,
  percentOff: number,
): number {
  return Math.min(
    Math.floor((subtotalCents * percentOff) / 100),
    subtotalCents,
  );
}
