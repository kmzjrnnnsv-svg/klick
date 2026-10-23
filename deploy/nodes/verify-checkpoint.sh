#!/usr/bin/env bash
# Prüft den finalisierten Checkpoint des eigenen Lighthouse gegen zwei
# unabhängige öffentliche Quellen (Plan Wallet H8: Checkpoint nie nur einer
# Quelle glauben). Gleiche Epoche → gleicher Root, sonst Exit 1.
#
#   SOURCES="https://quelle-1 https://quelle-2" ./verify-checkpoint.sh
#
# PRÜFEN: Quellen aus der Liste unter eth-clients.github.io/checkpoint-sync-endpoints
# wählen (zwei verschiedene Betreiber).
set -euo pipefail
. /etc/ethereum/node.env
LOCAL="${LOCAL:-http://127.0.0.1:5052}"
: "${SOURCES:?SOURCES mit zwei Beacon-API-URLs setzen}"

finalized() {
  curl -fsS "$1/eth/v1/beacon/states/finalized/finality_checkpoints" |
    python3 -c 'import json,sys; d=json.load(sys.stdin)["data"]["finalized"]; print(d["epoch"], d["root"])'
}

read -r EPOCH ROOT < <(finalized "$LOCAL")
echo "lokal: Epoche $EPOCH, Root $ROOT"
FAIL=0
for s in $SOURCES; do
  # Root derselben Epoche bei der Quelle (Header des ersten Slots der Epoche)
  read -r E R < <(finalized "$s")
  if [ "$E" = "$EPOCH" ] && [ "$R" = "$ROOT" ]; then
    echo "✔ $s stimmt überein"
  elif [ "$E" != "$EPOCH" ]; then
    echo "… $s ist bei Epoche $E — in einer Minute erneut prüfen"; FAIL=1
  else
    echo "✘ $s meldet anderen Root $R — Knoten NICHT verwenden"; FAIL=1
  fi
done
exit $FAIL
