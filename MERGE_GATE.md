# MERGE_GATE

Before merging to `main`, run:

```bash
scripts/check_wan_constitution.sh
```

Required result: `CLAUDE.md` WAN constitution version must equal the latest version in `wanjiaoben/wan-rules`. If the versions differ, reject the merge and sync from `wan-rules` first.

For CI or non-interactive environments, set `WAN_RULES_TOKEN` to a GitHub token that can read the private `wanjiaoben/wan-rules` repository. For local dry runs, set `WAN_RULES_LOCAL_PATH=/path/to/wan-rules`.
