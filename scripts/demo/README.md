# Demo photography and incident drill

Two unrelated things live here because both exist only for the evaluated demo.

## Photography

`make demo` calls `scripts/dev/fetch-demo-photos.sh`, which downloads 36 landscape photographs from
[Lorem Picsum](https://picsum.photos) (photographs served from [Unsplash](https://unsplash.com)) into
`/tmp/opencode/aether-demo-photos/`, then seeds them through the running API. On an **empty** archive
that is three six-photo dumps and 18 singles; running it again appends another batch, it never replaces
or deletes what is there:

```bash
make demo
# same, against a deployed origin:
BASE_URL=https://DOMAIN make demo
```

The download is idempotent: existing files are not fetched again. The script writes `ATTRIBUTION.tsv`
and a human-readable `README.md` beside the files; [`ATTRIBUTION.tsv`](ATTRIBUTION.tsv) in this
directory is the list from the recorded run (36 files, photographer and Unsplash source). No image
bytes are committed to the repository: the public demo seeds them on the host that runs it.

The images are used under the [Unsplash License](https://unsplash.com/license); attribution is
recorded even though the license does not require it. The demo archive is evaluation data, **not** the
owner's real archive. Replace it with your own photos in a local stack.

The three dumps are titled `Low tide`, `Green hours` and `After the rain`; their auras come from the
seed palette, with `#7d8a7a` as the first. The River shows one month and 21 entries (18 singles + 3
dumps) in the recorded run.

## Incident drill

The folder also contains the reproducible outage used for the observability and on-call evidence:

```bash
make observe-up
make oncall                       # host-side responder, second terminal
scripts/demo/incident-drill.sh    # stops PostgreSQL for real; waits for the alert and the record
```

`publish-load.sh` publishes six photos every five seconds. Reused photo ids return `400`/`409` while
the database is healthy; they are client errors and do not feed the 5xx alert. During the stop the same
request fails before validation and returns `500`, which is the signal `AetherPublish5xxRate` watches.

The recorded run and its screenshots are in
[`reports/observability-incident-drill-20261022.md`](../../reports/observability-incident-drill-20261022.md).
