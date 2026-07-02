#!/usr/bin/env bash
set -euo pipefail

# folio CLI install script
#   curl -fsSL https://raw.githubusercontent.com/bytebroshq/folio/main/packages/cli/install.sh | bash

REPO="bytebroshq/folio"
BRANCH="main"
FOLIO_HOME="$HOME/.config/folio"
TARGET="$FOLIO_HOME/bin/folio"
DOWNLOAD="$FOLIO_HOME/lib/folio.js"

detect_rc() {
  case "${SHELL:-}" in
    */zsh) echo "$HOME/.zshrc" ;;
    */bash) echo "$HOME/.bashrc" ;;
    *) return 1 ;;
  esac
}

echo "folio: installing to $FOLIO_HOME/bin"
mkdir -p "$FOLIO_HOME/bin" "$FOLIO_HOME/lib"

# Check for Node.js
if ! command -v node &> /dev/null; then
  echo "folio: Node.js is required but not found."
  echo "       Install from https://nodejs.org (v22+) and re-run this script."
  exit 1
fi

# Download pre-built JS
echo "folio: downloading..."
curl -fsSL "https://raw.githubusercontent.com/$REPO/$BRANCH/packages/cli/dist/folio.js" -o "$DOWNLOAD"
chmod +x "$DOWNLOAD"

# Create wrapper
cat > "$TARGET" << WRAPPER
#!/usr/bin/env bash
exec node "$DOWNLOAD" "\$@"
WRAPPER
chmod +x "$TARGET"

# Ensure on PATH
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
echo "folio installed. Next step:"
echo ""
echo "  folio bind <ns/repo>   # bind to a knowledge repo (one-time setup)"
echo "  folio status            # then check state anytime"
echo ""
echo "Commands:"
echo "  folio bind <ns/repo> [--web]   # bind to a knowledge repo"
echo "  folio switch [-c <topic>]      # list or create amendments"
echo "  folio sync [-m \"msg\"]          # submit/update draft PR"
echo "  folio list                      # list all amendments"
echo "  folio status                    # current state"
echo "  folio web                       # open review surface"
echo "  folio config                    # show/set config"
echo ""
