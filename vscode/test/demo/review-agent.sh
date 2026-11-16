#!/usr/bin/env bash
# A stand-in agent for the demo. It prints each task file that Yreview writes for a send.
dir="$(git rev-parse --git-dir)/y-review"
root="$(git rev-parse --show-toplevel)/"
bold=$'\e[1m' dim=$'\e[2m' cyan=$'\e[36m' yellow=$'\e[33m' reset=$'\e[0m'
title() { printf '%sreview-agent%s prints the task file of each send\n' "$bold" "$reset"; }
title
printf '%sWaiting for .git/y-review/<window>/tasks.json%s\n' "$dim" "$reset"
seen=""
while sleep 0.3; do
  file=$(ls -t "$dir"/*/tasks.json 2>/dev/null | head -n 1)
  [ -n "$file" ] || continue
  stamp=$(stat -c %Y%s "$file")
  [ "$stamp" = "$seen" ] && continue
  seen=$stamp
  printf '\e[2J\e[H'
  title
  printf '%sReceived %s%s\n' "$dim" "${file#"$root"}" "$reset"
  jq -r --arg c "$cyan" --arg y "$yellow" --arg r "$reset" --argjson w "$(($(tput cols) - 2))" \
    '.tasks[] | "\(.kind | ascii_upcase) \(.path):\(.startLine)" as $head
      | (.text | gsub("\n"; " ")) as $text
      | ($w - ($head | length) - 2) as $room
      | "\($y)\(.kind | ascii_upcase)\($r) \($c)\(.path):\(.startLine)\($r)  \(if ($text | length) > $room then $text[:$room - 3] + "..." else $text end)"' \
    "$file"
done
