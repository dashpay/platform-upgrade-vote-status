# Platform Upgrade Vote Status

Live dashboard of Dash Platform evonode protocol-version upgrade progress: how many
evonodes have upgraded their software, what protocol version each has signaled
on-chain, and an estimate of when each node will next propose a block (and
therefore flip its vote).

**Live site:** https://dashpay.github.io/platform-upgrade-vote-status/

## What it shows

- **Software versions** per evonode (`driveVersion`/`dapiVersion`) from the
  `quorums.<network>.networks.dash.org/masternodes` endpoint.
- **On-chain protocol-version votes** per masternode, proof-verified via
  [`@dashevo/evo-sdk`](https://www.npmjs.com/package/@dashevo/evo-sdk)
  (`getProtocolVersionUpgradeVoteStatus`). A node's vote updates only when it
  proposes a block, and votes are tallied at the epoch boundary (67% of active
  evonodes required).
- **Next-proposal estimates**: `getCurrentQuorumsInfo` exposes the ordered
  quorum list, the active validator set, its member lists, and the last block
  proposer. Tenderdash walks proposers within the active quorum in ascending
  proTxHash order and rotates to the next quorum when the last member has
  proposed (see `validator_set_update_v2` in
  [`rs-drive-abci`](https://github.com/dashpay/platform/blob/master/packages/rs-drive-abci/src/execution/platform_events/block_end/validator_set_update/v2/mod.rs)).
  The dashboard simulates that walk and multiplies by the epoch-average block
  time. Estimates drift with quorum churn at DKG boundaries and missed rounds —
  they are estimates, not commitments.

Everything runs client-side in the browser against public DAPI endpoints; there
is no backend.

## Development

```sh
npm install
npm run dev     # local dev server
npm run build   # type-check + production build to dist/
```

Deployed to GitHub Pages by `.github/workflows/deploy.yml` on push to `main`.

## Notes

- The proved queries go through the WASM SDK (inlined in the bundle — hence the
  large JS asset). The one unproved query (`getCurrentQuorumsInfo`) uses a
  minimal hand-rolled gRPC-Web call directly to evonode IPs.
- "Active evonodes" (the 67% denominator) counts `ENABLED` nodes from the
  masternode endpoint.
