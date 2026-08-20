# Fix: "Recent Trades" card counts funding rates as trades

**Symptom:** the card shows rows with an `F` badge and tiny negatives (−$0.93, −$0.40,
−$0.89, −$0.00). Those are **funding-fee** ledger entries, not trades. Real trades are
the `A`/`D` rows (+$258.30, +$21.50).

**Root cause:** the feed is reading raw OKX *bills* and rendering every row. In OKX's
bill ledger, `type = '8'` is a funding fee and `type = '2'` is an actual trade.

## Preferred fix — read closed positions, not raw bills

Point the Recent Trades card at `okx_positions_history` (one row per *closed position*,
fee-inclusive `realized_pnl`). Funding never appears there, and each row is a real trade:

```js
const { data: recentTrades } = await supabase
  .from('okx_positions_history')
  .select('inst_id, pos_side, realized_pnl, close_time, server_day')
  .eq('account', account)
  .order('close_time', { ascending: false })
  .limit(20);
```

## Alternative — if you must render from `okx_bills`

Filter to trade rows and drop funding/fees explicitly:

```js
const { data } = await supabase
  .from('okx_bills')
  .select('*')
  .eq('account', account)
  .eq('type', '2')            // 2 = Trade only; excludes 8 = funding fee
  .order('ts', { ascending: false })
  .limit(20);
```

Keep funding out of the P&L-by-trade view, but note it's still stored in `okx_bills`
(tagged by `type`) so you can show *total* funding cost as its own stat if you want —
the same way the cTrader design keeps swap/commission separate from net P&L.
