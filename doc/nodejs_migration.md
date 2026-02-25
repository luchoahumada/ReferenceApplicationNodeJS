# Node.js migration guide

## Run

- Install dependencies: `npm install`
- Start server: `npm start`
- Default URL: `http://127.0.0.1:8000`

## Endpoint mapping

| Legacy PHP | Node route |
|---|---|
| `/catalogue/index.php` | `/catalogue/index` |
| `/catalogue/index_html5.php` | `/catalogue/index-html5` |
| `/catalogue/index_oipf.php` | `/catalogue/index-oipf` |
| `/catalogue/index_mse-eme.php` | `/catalogue/index-mse-eme` |
| `/getSubs.php?file=...` | `/api/subs?file=...` |
| `/getAds.php?...` | `/api/ads?...` |
| `/log.php?type=...` | `/api/log?type=...` |
| `/catalogue/log/save.php` | `/api/catalogue/log/save` |
| `/tools/editor/saveConfig.php` | `/api/editor/config` |
| `/tools/test/laurl_pr.php` | `/api/test/laurl-pr` |
| `/tools/test/laurl_pr_persist.php` | `/api/test/laurl-pr-persist` |
| `/tools/test/laurl_ck.php` | `/api/test/laurl-ck` |
| `/tools/test/laurl_wv.php` | `/api/test/laurl-wv` |
| `/tools/test/multiperiod_v8.php` | `/api/test/multiperiod` |

## Notes

- Front-end UI/CSS/JS behavior was kept, with endpoint URL references updated to Node routes.
- Dynamic multiperiod output is served by proxying the public reference multiperiod generator.
- `config.json` remains ignored by git; update it locally as needed.
