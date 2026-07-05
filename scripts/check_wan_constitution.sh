#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLAUDE="${ROOT}/CLAUDE.md"
TMP_DIR=""

cleanup() {
  if [[ -n "${TMP_DIR}" && -d "${TMP_DIR}" ]]; then
    rm -rf "${TMP_DIR}"
  fi
}
trap cleanup EXIT

fail() {
  echo "FAIL wan constitution: $*" >&2
  exit 1
}

if [[ ! -f "${CLAUDE}" ]]; then
  fail "CLAUDE.md missing"
fi

local_version="$(sed -nE 's/^<!--WAN-CONSTITUTION-START version=(v[0-9]+(\.[0-9]+)*)-->$/\1/p' "${CLAUDE}" | head -n 1)"
if [[ -z "${local_version}" ]]; then
  fail "version marker missing in CLAUDE.md"
fi

latest_version=""
if [[ -n "${WAN_RULES_LOCAL_PATH:-}" ]]; then
  constitution="${WAN_RULES_LOCAL_PATH}/CONSTITUTION.md"
  [[ -f "${constitution}" ]] || fail "WAN_RULES_LOCAL_PATH does not contain CONSTITUTION.md"
  latest_version="$(sed -nE 's/^# WAN Constitution (v[0-9]+(\.[0-9]+)*)$/\1/p' "${constitution}" | head -n 1)"
else
  if [[ -n "${WAN_RULES_TOKEN:-}" ]]; then
    constitution="$(curl -fsSL \
      -H "Authorization: Bearer ${WAN_RULES_TOKEN}" \
      -H "Accept: application/vnd.github.raw" \
      "https://api.github.com/repos/wanjiaoben/wan-rules/contents/CONSTITUTION.md?ref=main")" \
      || fail "cannot read wanjiaoben/wan-rules via GitHub API; check WAN_RULES_TOKEN"
    latest_version="$(printf '%s\n' "${constitution}" | sed -nE 's/^# WAN Constitution (v[0-9]+(\.[0-9]+)*)$/\1/p' | head -n 1)"
  else
    TMP_DIR="$(mktemp -d)"
    if ! git -c advice.detachedHead=false clone --depth 1 https://github.com/wanjiaoben/wan-rules.git "${TMP_DIR}/wan-rules" >/dev/null 2>&1; then
      fail "cannot read wanjiaoben/wan-rules; set WAN_RULES_TOKEN or WAN_RULES_LOCAL_PATH"
    fi
    latest_version="$(sed -nE 's/^# WAN Constitution (v[0-9]+(\.[0-9]+)*)$/\1/p' "${TMP_DIR}/wan-rules/CONSTITUTION.md" | head -n 1)"
  fi
fi

if [[ -z "${latest_version}" ]]; then
  fail "cannot parse latest version from wan-rules"
fi

if [[ "${local_version}" != "${latest_version}" ]]; then
  fail "CLAUDE.md has ${local_version}, wan-rules has ${latest_version}"
fi

echo "PASS wan constitution ${local_version}"
