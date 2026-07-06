#!/usr/bin/env bash
set -euo pipefail

# folio CLI install script
#   curl -fsSL https://raw.githubusercontent.com/bytebroshq/folio/main/packages/cli/install.sh | bash
#
# Custom bin dir:
#   FOLIO_BIN_DIR="$HOME/bin" curl -fsSL https://raw.githubusercontent.com/bytebroshq/folio/main/packages/cli/install.sh | bash

REPO="bytebroshq/folio"
BRANCH="main"
BIN_DIR="${FOLIO_BIN_DIR:-$HOME/.local/bin}"
TARGET="$BIN_DIR/folio"

detect_rc() {
  case "${SHELL:-}" in
    */zsh) echo "$HOME/.zshrc" ;;
    */bash) echo "$HOME/.bashrc" ;;
    *) return 1 ;;
  esac
}

path_contains() {
  case ":$PATH:" in
    *":$1:"*) return 0 ;;
    *) return 1 ;;
  esac
}

quote_for_rc() {
  if [[ "$1" == "$HOME"* ]]; then
    printf '$HOME%s' "${1#"$HOME"}"
  else
    printf '%s' "$1"
  fi
}

echo "folio: installing to $TARGET"
mkdir -p "$BIN_DIR"

# Check for Node.js
if ! command -v node &> /dev/null; then
  echo "folio: Node.js is required but not found."
  echo "       Install from https://nodejs.org (v22+) and re-run this script."
  exit 1
fi

# Download pre-built JS directly as the executable. It has a Node shebang,
# so normal invocations do not go through a bash wrapper.
echo "folio: downloading..."
curl -fsSL "https://raw.githubusercontent.com/$REPO/$BRANCH/packages/cli/dist/folio.js" -o "$TARGET"
chmod +x "$TARGET"

# Ensure on PATH
if path_contains "$BIN_DIR"; then
  echo "folio: installed and available on PATH"
else
  rc="$(detect_rc || true)"
  rc_path="$(quote_for_rc "$BIN_DIR")"
  if [[ -n "$rc" ]] && ! grep -Fq "$BIN_DIR" "$rc" 2>/dev/null && ! grep -Fq "$rc_path" "$rc" 2>/dev/null; then
    echo "" >> "$rc"
    echo "export PATH=\"$rc_path:\$PATH\"" >> "$rc"
    echo "folio: added $rc_path to PATH in $rc"
  else
    echo "folio: installed, but $BIN_DIR is not on PATH"
  fi
  echo ""
  echo "To use folio in this terminal now, run:"
  echo ""
  echo "  export PATH=\"$rc_path:\$PATH\""
  echo ""
  echo "Or open a new terminal."
fi

echo ""
echo "folio installed. Next step:"
echo ""
echo "  folio bind <ns/repo>   # bind to a knowledge repo (one-time setup)"
echo "  folio status            # then check state anytime"
echo ""
echo "Commands:"
echo "  folio bind <ns/repo> [--web]        # bind to a knowledge repo"
echo "  folio draft <topic>                 # start or resume a draft"
echo "  folio save <topic> -m \"msg\"         # save changes in a draft"
echo "  folio proof <topic>                 # lint, rebase, open/update draft PR"
echo "  folio publish <topic>               # merge the draft in (once PR is ready)"
echo "  folio list                          # list all amendments"
echo "  folio status                        # fleet dashboard — current state"
echo "  folio web                           # open review surface"
echo "  folio config                        # show/set config"
echo ""
