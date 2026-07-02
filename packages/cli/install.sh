#!/usr/bin/env bash
set -euo pipefail

# folio CLI install script
#   curl -fsSL https://raw.githubusercontent.com/bytebroshq/folio/main/packages/cli/install.sh | bash

REPO="bytebroshq/folio"
BRANCH="main"
FOLIO_HOME="$HOME/.config/folio"
TARGET="$FOLIO_HOME/bin/folio"

detect_rc() {
  case "${SHELL:-}" in
    */zsh) echo "$HOME/.zshrc" ;;
    */bash) echo "$HOME/.bashrc" ;;
    *) return 1 ;;
  esac
}

echo "folio: installing to $TARGET"
mkdir -p "$FOLIO_HOME/bin"

# --- Install Bun if missing ---
if ! command -v bun &> /dev/null; then
  echo "folio: installing bun (JavaScript runtime)..."
  curl -fsSL https://bun.sh/install | bash
  # bun install adds to ~/.bun/bin; source it for this script
  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi

# --- Clone repo shallowly into a cache dir ---
CACHE_DIR="$FOLIO_HOME/lib/cli"
if [[ -d "$CACHE_DIR/.git" ]]; then
  echo "folio: updating CLI source..."
  git -C "$CACHE_DIR" fetch origin "$BRANCH" --depth=1 --quiet
  git -C "$CACHE_DIR" reset --hard "origin/$BRANCH" --quiet
else
  echo "folio: downloading CLI source..."
  rm -rf "$CACHE_DIR"
  git clone --depth=1 --branch "$BRANCH" "https://github.com/$REPO.git" "$CACHE_DIR" --quiet
fi

# --- Install dependencies ---
echo "folio: installing dependencies..."
bun install --cwd "$CACHE_DIR" --frozen-lockfile --quiet 2>/dev/null || bun install --cwd "$CACHE_DIR" --quiet

# --- Build standalone binary ---
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT

echo "folio: building binary..."
bun build --compile "$CACHE_DIR/packages/cli/src/index.ts" --outfile="$BUILD_DIR/folio"
mv "$BUILD_DIR/folio" "$TARGET"
chmod +x "$TARGET"

# --- Ensure on PATH ---
if command -v folio &> /dev/null; then
  echo "folio: already on PATH ($(which folio))"
else
  rc="$(detect_rc || true)"
  if [[ -n "$rc" ]] && ! grep -q '\.config/folio/bin' "$rc" 2>/dev/null; then
    echo "" >> "$rc"
    echo 'export PATH="$HOME/.config/folio/bin:$PATH"' >> "$rc"
    echo "folio: added \$HOME/.config/folio/bin to PATH in $rc"
    echo "       source $rc or open a new terminal"
  else
    echo "folio: installed at $TARGET"
    echo "       add to PATH: export PATH=\"\$HOME/.config/folio/bin:\$PATH\""
  fi
fi

echo ""
folio status 2>/dev/null || echo "folio — knowledge management CLI"
echo ""
echo "  folio bind <ns/repo> [--web]   # bind to a knowledge repo"
echo "  folio switch [-c <topic>]      # list or create amendments"
echo "  folio sync [-m \"msg\"]          # submit/update draft PR"
echo "  folio list                      # list all amendments"
echo "  folio status                    # current state"
echo "  folio web                       # open review surface"
echo "  folio config                    # show/set config"
echo ""
