#!/usr/bin/env bash
# The system packages Chrome's headless shell needs, for the Redraws workflow
# (.github/workflows/redraws.yml): playwright-core's list, as
# `playwright-core install --with-deps` has it, installed from
# ~/.cache/shell-packages, which the workflow keeps between runs (main's
# caches job fills it). GitHub's image has all but the fonts (nine packages,
# 21 MB), and Ubuntu's mirror crawls now and then: 13 kB/s on 5 November 2026,
# 11 minutes for them, and two jobs ran out of time. So the mirror is asked
# only when the cache can't do, each try there gets three minutes, and there
# are three.
#
#   bash scripts/shell-packages.sh   # in CI, after npm ci

set -euo pipefail
dir="$HOME/.cache/shell-packages"

list=$(npx playwright-core install-deps --dry-run chromium-headless-shell | sed -n 's/.*--no-install-recommends \([^"]*\)".*/\1/p')
if [ -z "$list" ]; then
  echo "playwright-core install-deps --dry-run gave no package list."
  exit 1
fi

# Whether the runner has every one, installed (dpkg-query skips a package it has never heard of; one
# installed for two architectures counts once, and one held, "hi", is as installed as "ii").
all_there() { [ "$(dpkg-query -W -f='${db:Status-Abbrev}${Package}\n' $list 2> /dev/null | sed -n 's/^.i.//p' | sort -u | wc -l)" -eq "$(wc -w <<< "$list")" ]; }

# A command as root, three tries of three minutes each.
tries() {
  for n in 1 2 3; do
    if sudo timeout 180 "$@"; then return 0; fi
    echo "Try $n of 3 failed or took over three minutes: $*"
  done
  return 1
}

if all_there; then
  echo "The runner has every package the headless shell needs."
  exit 0
fi

# (A package from the cache whose own needs this image hasn't, or one the image has stopped having: the mirror's turn.
# One this image has newer than the cache, kept from an older image's, stays as the image has it: -G.)
if compgen -G "$dir/*.deb" > /dev/null; then
  if sudo dpkg -G -i "$dir"/*.deb > /dev/null && all_there; then
    echo "The headless shell's packages from the cache ($(compgen -G "$dir/*.deb" | wc -l)), without Ubuntu's mirror."
    exit 0
  fi
  echo "The cached packages weren't enough: from Ubuntu's mirror."
fi

mkdir -p "$dir"
sudo apt-get clean
tries apt-get update
tries apt-get install -f -y --no-install-recommends --download-only $list
cp /var/cache/apt/archives/*.deb "$dir"/ 2> /dev/null || true
sudo apt-get install -f -y --no-install-recommends $list
if ! all_there; then
  echo "Not every package the headless shell needs is installed, even from Ubuntu's mirror:"
  dpkg-query -W -f='${db:Status-Abbrev}${Package}\n' $list 2>&1 | grep -v '^.i.' || true
  exit 1
fi
# Kept for the next runs: each package at the version installed now, the mirror's or the cache's. apt
# fetches none that dpkg set up or only unpacked from the cache, so a cache emptied first would keep
# only the rest, and the next run, finding its key, saves nothing better; a version since replaced goes.
for deb in "$dir"/*.deb; do
  name=$(dpkg-deb -f "$deb" Package) && version=$(dpkg-deb -f "$deb" Version) && [ "$(dpkg-query -W -f='${Version}' "$name" 2> /dev/null)" = "$version" ] || rm -f "$deb"
done
echo "The headless shell's packages from Ubuntu's mirror ($(compgen -G "$dir/*.deb" | wc -l)), kept for the next runs."
