#!/usr/bin/env bash
# Runs the Playwright E2E suite with a Chromium installed into a temporary folder
# (no root, nothing installed system-wide). Works in restricted sandboxes where
# Playwright's own browser CDN is unreachable.
#
# Usage:
#   ./scripts/e2e-sandbox.sh [playwright test args...]     e.g. --grep "mission" --headed
#   npm run test:e2e:sandbox -- [playwright test args...]
#
# Browser resolution order:
#   1. $CHROMIUM_EXECUTABLE, if set (use an existing Chromium/Chrome binary)
#   2. cached browser from a previous run (in $E2E_CACHE_DIR)
#   3. `playwright install chromium` into $E2E_CACHE_DIR   (official CDN)
#   4. Chromium .deb from Debian (bookworm + security updates) extracted into
#      $E2E_CACHE_DIR; missing shared libraries are resolved from Debian too.
#
# Environment:
#   E2E_CACHE_DIR       cache folder      (default: ${TMPDIR:-/tmp}/physics-companion-e2e)
#   E2E_BROWSER_SOURCE  auto|playwright|debian            (default: auto)
#   E2E_PORT            port of the offline app server   (default: a free port)
#   E2E_ONLINE_PORT     port of the online app server    (default: a free port)
#   E2E_SERVER          preview (production build, default) or dev
#   DEBIAN_MIRROR       Debian mirror     (default: http://deb.debian.org)
#   CHROMIUM_EXECUTABLE path to an existing browser binary (skips installation)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE_DIR="${E2E_CACHE_DIR:-${TMPDIR:-/tmp}/physics-companion-e2e}"
SOURCE="${E2E_BROWSER_SOURCE:-auto}"
MIRROR="${DEBIAN_MIRROR:-http://deb.debian.org}"
DEBIAN_SUITE="bookworm" # glibc 2.36: runs on most current distros
EXEC_RECORD="$CACHE_DIR/chromium-executable"

log() { printf '\033[1;36m[e2e]\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m[e2e] error:\033[0m %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

mkdir -p "$CACHE_DIR"
cd "$ROOT_DIR"

# ---------------------------------------------------------------- node deps --
if [[ ! -x node_modules/.bin/playwright ]]; then
  log "Installing npm dependencies (npm ci)…"
  npm ci --no-audit --no-fund
fi

# ------------------------------------------------------------------ helpers --
browser_works() { # $1 = executable
  [[ -x "$1" ]] && "$1" --version >/dev/null 2>&1
}

deb_extract() { # $1 = .deb, $2 = destination
  mkdir -p "$2"
  if have dpkg-deb; then
    dpkg-deb -x "$1" "$2"
  else
    have ar || die "Need 'dpkg-deb' or 'ar' to unpack .deb files."
    local tmp
    tmp="$(mktemp -d)"
    (cd "$tmp" && ar x "$1")
    tar -xf "$tmp"/data.tar.* -C "$2"
    rm -rf "$tmp"
  fi
}

deb_list() { # $1 = .deb → file list
  if have dpkg-deb; then
    dpkg-deb -c "$1"
  else
    local tmp
    tmp="$(mktemp -d)"
    (cd "$tmp" && ar x "$1")
    tar -tvf "$tmp"/data.tar.*
    rm -rf "$tmp"
  fi
}

# ------------------------------------------------- source: playwright CDN ----
install_via_playwright() {
  log "Trying the official Playwright download…"
  export PLAYWRIGHT_BROWSERS_PATH="$CACHE_DIR/ms-playwright"
  if timeout 600 npx playwright install chromium >"$CACHE_DIR/playwright-install.log" 2>&1; then
    log "Installed via Playwright into $PLAYWRIGHT_BROWSERS_PATH"
    echo "playwright" >"$EXEC_RECORD"
    return 0
  fi
  unset PLAYWRIGHT_BROWSERS_PATH
  log "Playwright download unavailable (see $CACHE_DIR/playwright-install.log)."
  return 1
}

# ------------------------------------------------------ source: Debian -------
debian_arch() {
  case "$(uname -m)" in
    x86_64 | amd64) echo amd64 ;;
    aarch64 | arm64) echo arm64 ;;
    *) die "Unsupported CPU architecture for the Debian fallback: $(uname -m)" ;;
  esac
}

fetch_indexes() { # → $CACHE_DIR/debian/Packages (security first, so newest wins)
  local arch="$1" out="$CACHE_DIR/debian/Packages"
  [[ -s "$out" && -n "$(find "$out" -mmin -1440 2>/dev/null)" ]] && return 0
  log "Downloading Debian package indexes ($DEBIAN_SUITE, $arch)…"
  : >"$out.tmp"
  curl -fsSL --retry 2 "$MIRROR/debian-security/dists/$DEBIAN_SUITE-security/main/binary-$arch/Packages.xz" |
    xz -dc | sed 's#^Filename: #Filename: debian-security/#' >>"$out.tmp"
  for comp in main contrib; do
    curl -fsSL --retry 2 "$MIRROR/debian/dists/$DEBIAN_SUITE/$comp/binary-$arch/Packages.xz" |
      xz -dc | sed 's#^Filename: #Filename: debian/#' >>"$out.tmp"
  done
  mv "$out.tmp" "$out"
}

pkg_field() { # $1 = package, $2 = field → first match (security index comes first)
  awk -v P="$1" -v F="$2:" '$0 == "Package: " P { f = 1 } f && $1 == F { sub(F " ", ""); print; exit }' \
    "$CACHE_DIR/debian/Packages"
}

pkg_download() { # $1 = package → path of the cached .deb
  local file url dest
  file="$(pkg_field "$1" Filename)"
  [[ -n "$file" ]] || return 1
  dest="$CACHE_DIR/debian/debs/$(basename "$file")"
  if [[ ! -s "$dest" ]]; then
    mkdir -p "$(dirname "$dest")"
    url="$MIRROR/$file"
    log "  downloading $1 ($(basename "$file"))"
    curl -fsSL --retry 2 -o "$dest.part" "$url" && mv "$dest.part" "$dest"
  fi
  echo "$dest"
}

missing_libs() { # $1 = chromium dir, $2 = extra lib dir
  local f
  {
    for f in "$1/chromium" "$1"/*.so; do
      [[ -f "$f" ]] || continue
      LD_LIBRARY_PATH="$2" ldd "$f" 2>/dev/null | awk '/not found/ { print $1 }'
    done
  } | sort -u
}

candidates_for() { # $1 = soname, e.g. libjpeg.so.62 → likely Debian package names
  local soname="$1" stem ver
  stem="$(echo "${soname%%.so*}" | tr '[:upper:]' '[:lower:]')"
  ver="${soname##*.so.}"
  ver="${ver%%.*}"
  awk -v a="$stem$ver" -v b="$stem-$ver" '
    /^Package: / { p = $2; if (p == a || p == b || index(p, a "-") == 1 || index(p, b "-") == 1) print p }
  ' "$CACHE_DIR/debian/Packages" | awk '!seen[$0]++'
}

install_via_debian() {
  have curl || die "curl is required."
  have xz || die "xz is required."
  have ldd || die "ldd is required."
  local arch glibc root libs chromium_dir version
  arch="$(debian_arch)"
  glibc="$(ldd --version 2>/dev/null | awk 'NR == 1 { print $NF }')"
  if [[ -n "$glibc" ]] && ! printf '2.36\n%s\n' "$glibc" | sort -V -C; then
    die "Host glibc $glibc is older than 2.36 (Debian $DEBIAN_SUITE); use CHROMIUM_EXECUTABLE instead."
  fi
  mkdir -p "$CACHE_DIR/debian"
  fetch_indexes "$arch"

  version="$(pkg_field chromium Version)"
  [[ -n "$version" ]] || die "No chromium package found in the Debian index."
  log "Installing Chromium $version from Debian into $CACHE_DIR/debian…"
  root="$CACHE_DIR/debian/root"
  libs="$CACHE_DIR/debian/libs"
  rm -rf "$root" "$libs"
  for pkg in chromium chromium-common; do
    deb_extract "$(pkg_download "$pkg")" "$root"
  done
  chromium_dir="$root/usr/lib/chromium"
  [[ -x "$chromium_dir/chromium" ]] || die "Chromium binary not found after extraction."

  # Resolve shared libraries that the host does not provide (a few rounds for transitive deps).
  local round missing soname pkg deb found
  local libdir="$libs/usr/lib/$(uname -m)-linux-gnu"
  mkdir -p "$libdir"
  for round in 1 2 3 4; do
    missing="$(missing_libs "$chromium_dir" "$libdir")"
    [[ -z "$missing" ]] && break
    log "Round $round: resolving missing libraries: $(echo "$missing" | paste -sd' ')"
    for soname in $missing; do
      found=""
      for pkg in $(candidates_for "$soname"); do
        deb="$(pkg_download "$pkg")" || continue
        if deb_list "$deb" | grep -q "/$soname\( \|$\)"; then
          deb_extract "$deb" "$libs"
          found="$pkg"
          break
        fi
      done
      [[ -n "$found" ]] || log "  ! no Debian package found for $soname"
    done
  done
  missing="$(missing_libs "$chromium_dir" "$libdir")"
  if [[ -n "$missing" ]]; then
    die "Chromium still misses: $(echo "$missing" | paste -sd' '). Install them with your package manager."
  fi

  # Wrapper: extra libraries are visible to Chromium only (not to Node/Vite).
  local wrapper="$CACHE_DIR/debian/chromium"
  cat >"$wrapper" <<EOF
#!/usr/bin/env bash
export LD_LIBRARY_PATH="$libdir\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}"
exec "$chromium_dir/chromium" "\$@"
EOF
  chmod +x "$wrapper"
  browser_works "$wrapper" || die "Installed Chromium does not start. Try: $wrapper --version"
  echo "$wrapper" >"$EXEC_RECORD"
  log "Ready: $("$wrapper" --version 2>/dev/null)"
}

# -------------------------------------------------------- resolve browser ----
resolve_browser() {
  if [[ -n "${CHROMIUM_EXECUTABLE:-}" ]]; then
    browser_works "$CHROMIUM_EXECUTABLE" || die "CHROMIUM_EXECUTABLE=$CHROMIUM_EXECUTABLE does not run."
    export E2E_CHROMIUM_EXECUTABLE="$CHROMIUM_EXECUTABLE"
    return
  fi

  if [[ -s "$EXEC_RECORD" ]]; then
    local cached
    cached="$(cat "$EXEC_RECORD")"
    if [[ "$cached" == "playwright" && -d "$CACHE_DIR/ms-playwright" && "$SOURCE" != "debian" ]]; then
      export PLAYWRIGHT_BROWSERS_PATH="$CACHE_DIR/ms-playwright"
      log "Using cached Playwright browsers ($PLAYWRIGHT_BROWSERS_PATH)"
      return
    fi
    if [[ "$cached" != "playwright" && "$SOURCE" != "playwright" ]] && browser_works "$cached"; then
      export E2E_CHROMIUM_EXECUTABLE="$cached"
      log "Using cached Chromium: $("$cached" --version 2>/dev/null)"
      return
    fi
  fi

  case "$SOURCE" in
    playwright) install_via_playwright || die "Playwright browser download failed." ;;
    debian) install_via_debian ;;
    auto) install_via_playwright || install_via_debian ;;
    *) die "E2E_BROWSER_SOURCE must be auto, playwright or debian (got '$SOURCE')." ;;
  esac
  if [[ "$(cat "$EXEC_RECORD")" != "playwright" ]]; then
    export E2E_CHROMIUM_EXECUTABLE="$(cat "$EXEC_RECORD")"
  fi
}

resolve_browser

free_port() {
  node -e 'const s = require("net").createServer(); s.listen(0, "127.0.0.1", () => { console.log(s.address().port); s.close(); });'
}
# Free ports by default, so a leftover or unrelated server can never collide with (or be reused by) the tests.
export E2E_PORT="${E2E_PORT:-$(free_port)}"
export E2E_ONLINE_PORT="${E2E_ONLINE_PORT:-$(free_port)}"
if [[ "$E2E_ONLINE_PORT" == "$E2E_PORT" ]]; then E2E_ONLINE_PORT=$((E2E_PORT + 1)); fi
log "Running Playwright tests (app servers on ports $E2E_PORT and $E2E_ONLINE_PORT)…"
exec npx playwright test "$@"
