/** Shared demo formatter so fixtures and views show identical numeric units. */
export const formatValue = (value: number, unit?: string) =>
  `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit ?? 'units'}`;

export const formatQuantity = (
  value: number,
  context?: { readonly unit?: string },
) => formatValue(value, context?.unit);
