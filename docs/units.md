# Units and conversion

[Back to API](api.md)

Units are arbitrary, case-sensitive identifiers such as `USD`, `EUR`, `kg` or `MWh`. The library does not fetch exchange rates. Supply two distinct kinds of rate: the **actual transfer rate on each link**, and **graph reference rates** for widths and combined node totals.

```ts
const graph: SankeyGraph = {
  defaultUnit: 'USD',
  conversionRates: [{ from: 'USD', to: 'COP', rate: 4000 }],
  stages: ['accounts', 'payments'],
  nodes: [
    {
      key: 'wallet',
      title: 'Wallet',
      placement: { stage: 'accounts' },
      totals: { USD: 150 },
    },
    { key: 'supplier', title: 'Supplier', placement: { stage: 'payments' } },
  ],
  links: [
    {
      key: 'payment',
      from: 'wallet',
      to: 'supplier',
      amount: 100,
      inputUnit: 'USD',
      outputUnit: 'COP',
      conversionRate: 3900,
    },
  ],
};
```

The wallet sends **100 USD** and the supplier receives **390,000 COP**. At the graph's illustrative reference rate of 4,000 COP/USD, the link starts at a width representing **100 USD** and ends at **97.50 USD**. It narrows by 2.5%, rather than growing 3,900 times wider. A transfer rate of 4,000 gives equal widths. A difference in reference value does not tell the component whether it represents fees, a spread or something else.

## Link endpoints

- `amount` is the positive amount leaving the source.
- `inputUnit` and `outputUnit` must both be explicit for named-unit transfers. The graph default never fills either field. Omit both for entirely unitless graphs, which retain their existing behavior.
- `conversionRate` is output units delivered per input unit. Output equals `amount * conversionRate`. The rate is required when units differ; otherwise it defaults to 1. A rate other than 1 in the same unit can represent a change in quantity.
- The source records outgoing amounts in `inputUnit`; the destination records incoming amounts in `outputUnit`. The destination does not also receive the input balance.
- Rates on different transfers may differ. They do not change the graph's reference rates and need not agree with them.

## Reference valuation and widths

`graph.conversionRates` contains `{ from, to, rate }` entries. One EUR valued at 1.1 USD is `{ from: 'EUR', to: 'USD', rate: 1.1 }`. Inverse and chained reference conversions are supported. Reference paths must agree; conflicting rates and inconsistent cycles are rejected (relative tolerance `1e-9`).

`graph.defaultUnit` determines the unit for **all quantitative widths and combined node totals**. Both link endpoints are independently valued in that unit. Equivalent values retain a constant-width ribbon; unequal values produce a smooth taper. All bars and both ends of every ribbon share one scale. A transfer's rate never substitutes for missing reference conversions.

The optional component prop `minLinkWidth` applies a visual floor after reference conversion. It never changes amounts or rates. Both endpoints are clamped independently; small transfers may therefore have equal displayed thickness despite different values. Node bars reserve room for the displayed port stacks. Leave it at its default of 0 for proportional widths.

Without a default, widths use the first encountered named unit and combined totals are hidden. Multiple named units still need consistent reference conversions. Unitless and named amounts cannot be mixed. Entirely unitless graphs need no rate table.

Rates and endpoint amounts must be finite and positive. Missing reference paths, invalid rates, overflow and underflow turning a positive amount into zero raise `SankeyInputError`.

## Node balances

- `node.totals` maps units to non-negative numbers or `'auto'`. These are **separate balances**, not alternative representations of the same money. Numeric entries declare a balance. Omitted units and `'auto'` derive `max(incoming, outgoing)` within that unit.
- A declared balance must cover incoming and outgoing independently. Extra value in another unit cannot compensate for an undersized declaration.
- Use either `total` or `totals`. Scalar `total` declares a balance in `defaultUnit`, or a unitless balance in unitless data.
- The combined total and bar size sum converted per-unit balances. This can exceed `max(combined incoming, combined outgoing)` when the incoming and outgoing currency mixes differ. Separate currencies are not netted or exchanged inside a node; represent an actual conversion on a link.
- A relay counts incoming and outgoing only once within each unit: 100 EUR incoming and 80 EUR outgoing derive 100 EUR, not 180 EUR.

## Callback and presentation fields

Node facts expose the original `node`, `totals` per unit, optional default-unit `converted` summary, and scalar `total`, `incoming`, `outgoing` in the layout `unit`. Each balance records declared/derived status; the combined `totalSource` may be `mixed`.

Link facts expose the original `link`, `fromNode`, `toNode`, resolved `input` and `output` quantities (`{ amount, unit }`), actual `conversionRate`, `layoutInputAmount`, `layoutOutputAmount`, optional `converted: { unit, inputAmount, outputAmount }`, and graph `referenceRates` used for valuation. Endpoint nodes remain original inputs, not nested resolved facts. Original data is never rewritten.

Formatted node fields are `text.total`, `incoming`, `outgoing`, per-unit `totals`, and optional `converted`. Link text exposes `amount` (input), `outputAmount`, optional `convertedAmount` and `convertedOutputAmount`, optional transfer-rate equation `conversionRate`, and `referenceRates` equations.

`formatAmount` receives `field` (`amount` or `outputAmount` for links), `unit`, `isConverted`, `surface`, and subject facts. A custom formatter owns the whole string including unit suffixes. Rate equations are independent of amount formatting.

Node labels list balances plus a combined `Σ` line when useful. Link labels show `input → output` when the unit or amount changes; unchanged transfers show one amount. Tooltips distinguish actual endpoints and the transfer rate from default-unit valuations and reference rates.

The directional interface replaces the unreleased branch's single `link.unit` and link-level `conversionRates`: provide both endpoint units, move reference rates to the graph, and specify `conversionRate` for actual cross-unit transfers. Published unitless inputs are unchanged.
