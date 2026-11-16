#!/usr/bin/env bash
# A stand-in agent for the demo. It prints each task file that Yreview writes for a send.
dir="$(git rev-parse --git-dir)/y-review"
root="$(git rev-parse --show-toplevel)/"
bold=$'\e[1m' dim=$'\e[2m' cyan=$'\e[36m' yellow=$'\e[33m' reset=$'\e[0m'
printf '%sreview-agent%s prints the task file of each send\n' "$bold" "$reset"
printf '%sWaiting for .git/y-review/<window>/tasks.json%s\n\n' "$dim" "$reset"
seen=""
while sleep 0.3; do
  file=$(ls -t "$dir"/*/tasks.json 2>/dev/null | head -n 1)
  [ -n "$file" ] || continue
  stamp=$(stat -c %Y%s "$file")
  [ "$stamp" = "$seen" ] && continue
  seen=$stamp
  printf '%sReceived %s%s\n' "$bold" "${file#"$root"}" "$reset"
  jq -r --arg c "$cyan" --arg y "$yellow" --arg r "$reset" \
    '.tasks[] | "\($y)\(.kind | ascii_upcase)\($r) \($c)\(.path):\(.startLine)\($r)  \(.text | gsub("\n"; " "))"' \
    "$file"
  echo
done
