#!/usr/bin/env bash
set -euo pipefail

# folio CLI installer. Installs an immutable GitHub Release artifact.
#   curl -fsSL https://raw.githubusercontent.com/bytebroshq/folio/main/packages/cli/install.sh | bash
# Pin a release with FOLIO_VERSION=vX.Y.Z.

REPO="bytebroshq/folio"
BIN_DIR="${FOLIO_BIN_DIR:-$HOME/.local/bin}"
TARGET="$BIN_DIR/folio"
VERSION="${FOLIO_VERSION:-}"

api_url="https://api.github.com/repos/$REPO/releases/latest"
if [[ -n "$VERSION" ]]; then
  [[ "$VERSION" == v* ]] || VERSION="v$VERSION"
  api_url="https://api.github.com/repos/$REPO/releases/tags/$VERSION"
fi

command -v node >/dev/null || { echo "folio: Node.js v22+ is required."; exit 1; }
release="$(curl -fsSL -H 'Accept: application/vnd.github+json' "$api_url")" || { echo "folio: could not find the requested stable release."; exit 1; }
metadata="$(node -e '
let r="";process.stdin.on("data",c=>r+=c).on("end",()=>{const x=JSON.parse(r);const asset=n=>x.assets.find(a=>a.name===n)?.browser_download_url;if(x.draft||x.prerelease||!asset("folio.js")||!asset("SHA256SUMS"))process.exit(1);console.log(x.tag_name);console.log(asset("folio.js"));console.log(asset("SHA256SUMS"));})
' <<<"$release")" || { echo "folio: release is missing required assets."; exit 1; }
TAG="$(printf '%s\n' "$metadata" | sed -n '1p')"
ASSET_URL="$(printf '%s\n' "$metadata" | sed -n '2p')"
SUMS_URL="$(printf '%s\n' "$metadata" | sed -n '3p')"

mkdir -p "$BIN_DIR"
tmp="$(mktemp "$BIN_DIR/.folio.XXXXXX")"
sums="$(mktemp "$BIN_DIR/.folio-sums.XXXXXX")"
trap 'rm -f "$tmp" "$sums"' EXIT
curl -fsSL "$ASSET_URL" -o "$tmp"
curl -fsSL "$SUMS_URL" -o "$sums"
expected="$(awk '$2 == "folio.js" { print $1 }' "$sums")"
[[ "$expected" =~ ^[[:xdigit:]]{64}$ ]] || { echo "folio: invalid SHA256SUMS release asset."; exit 1; }
if command -v sha256sum >/dev/null; then actual="$(sha256sum "$tmp" | awk '{print $1}')"; else actual="$(shasum -a 256 "$tmp" | awk '{print $1}')"; fi
[[ "$actual" == "$expected" ]] || { echo "folio: checksum verification failed."; exit 1; }
chmod +x "$tmp"
mv -f "$tmp" "$TARGET"
printf 'folio %s installed at %s\n' "$TAG" "$TARGET"

case ":$PATH:" in *":$BIN_DIR:"*) ;; *) echo "folio: add $BIN_DIR to PATH to use it.";; esac
