# Units and conversion

[Back to API](api.md)

Units are arbitrary, case-sensitive identifiers such as `USD`, `EUR`, `kg` or `MWh`. The library does not fetch exchange rates or infer which units are compatible. Supply the rates appropriate to your data.

```ts
const graph: SankeyGraph = {
  defaultUnit: 'USD',
  stages: ['accounts', 'payments'],
  nodes: [
    {
      key: 'wallet', title: 'Wallet', placement: { stage: 'accounts' },
      totals: { EUR: 200, USD: 'auto' },
    },
    { key: 'supplier', title: 'Supplier', placement: { stage: 'payments' } },
  ],
  links: [
    {
      key: 'eur', from: 'wallet', to: 'supplier', amount: 100, unit: 'EUR',
      conversionRates: [{ from: 'EUR', to: 'USD', rate: 1.1 }],
    },
    { key: 'usd', from: 'wallet', to: 'supplier', amount: 50 },
  ],
};
```

The wallet holds **200 EUR plus 50 USD**, with a combined total of **270 USD**. Its EUR link transfers only 100 EUR (equivalent to 110 USD), so it is partially allocated. The supplier derives 100 EUR plus 50 USD, or 160 USD combined. The two ribbons have a width ratio of 110:50, not 100:50.

## Balances

- `graph.defaultUnit` supplies the unit for links without `unit` and for scalar `node.total`. It also selects the combined display and width basis.
- `node.totals` is a map from unit to a non-negative number or `'auto'`. These are **separate balances**, not multiple valuations of one amount. A numeric entry declares that unit's total. `'auto'` and omitted units derive `max(incoming, outgoing)` **within that unit**. There is no double-counting of a relay's incoming and outgoing links.
- A declared balance must cover both its incoming and outgoing amounts independently. A larger balance in another unit cannot compensate for an undersized declaration.
- Use either `total` or `totals` on a node. Scalar `total` declares the default-unit balance; any other incident units still derive separately. For an explicit all-currency declaration use `totals`.
- The combined total is the sum of converted **per-unit totals**, not `max(sum(incoming), sum(outgoing))`. The distinction matters when incoming and outgoing unit mixes differ: those are still separate balances, not an implicit currency exchange.
- A link retains one original amount/unit at both ends. Conversion rates express equivalence; they do not change the destination unit, add balances, execute trades, or model fees. Model those separately.

## Rates and widths

`{ from: 'EUR', to: 'USD', rate: 1.1 }` means **1 EUR = 1.1 USD**. A rate must be finite and positive. Reverse conversion and chained paths are supported automatically. A graph may provide shared `conversionRates`, including for declared balances on isolated nodes. Rates on links and on the graph form one consistent conversion table for the entire diagram. A link's explicit rates and any additional rates used for its width conversion are available in its tooltip context.

Conflicting rates or inconsistent cycles are rejected (relative tolerance `1e-9`). This interface models one valuation basis. Different transaction-time exchange rates for the same unit pair require separate graphs or pre-normalized data; the component never silently picks a favorable path or averages conflicting rates.

Every used unit needs a conversion path to the width basis. Missing conversions, overflow or underflow producing a zero link width raise an input error. One common scale applies to node bars and links, including top/bottom nodes.

Without `defaultUnit`, a single explicitly named unit works directly. A multi-unit graph still needs rates: the first encountered unit is used internally for widths, while labels/tooltips omit the combined total. Choosing another basis in a consistent rate table changes absolute numbers but not width ratios. Unitless and named amounts cannot be mixed without an explicit default. Existing entirely unitless graphs retain their behavior.

## Context and presentation

`SankeyNodeFacts.totals` lists each unit's numeric total, incoming, outgoing and `totalSource`. `converted` contains the combined summary when a graph default exists. The existing scalar `total`, `incoming`, `outgoing` fields use the common layout `unit`; `totalSource` can be `mixed` if some balances are declared and others derived.

`SankeyLinkFacts` retains `link`, `fromNode`, `toNode` and adds resolved `unit`, `layoutAmount`, optional default-unit `converted` amount, and `conversionRates`. Original graph objects are never rewritten. Link endpoint nodes remain original inputs, not resolved nested facts.

Presentation adds `text.totals` and optional `text.converted` for nodes; links have `text.amount`, optional `text.convertedAmount` and `text.conversionRates`. `formatAmount` receives `context.unit` and `context.isConverted` alongside the existing field/surface and facts. A custom formatter owns the whole formatted string, including unit suffixes. Conversion-rate equations use the supplied rates independently of amount formatting.

```tsx
formatAmount={(value, context) =>
  `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}${context.unit ? ` ${context.unit}` : ''}`
}
```

Node labels list balances individually and add a combined `Σ` line when useful. Default tooltips list the same balances with incoming/outgoing amounts and the combined summary. Single default-unit balances avoid a redundant combined line. Links show their native amount and, when different, its default-unit equivalent; tooltips also show conversion-rate equations. Custom label/tooltip callbacks can use the structured fields to choose their own presentation.
