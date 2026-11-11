#!/usr/bin/env bash
# Installs the system libraries a Playwright browser needs on a CI runner.
#
#   scripts/ci/system-libraries.sh <browser> [extra apt package ...]
#
# The packages come from Ubuntu's package servers, and when those cannot be reached
# every browser job fails before a single test has run. So the downloaded packages are
# kept in ~/system-libraries, which the workflow caches: a later run on the same runner
# image installs them from there and needs no network at all.
set -uo pipefail

browser=${1:?usage: system-libraries.sh <browser> [extra apt package ...]}
shift
store="$HOME/system-libraries"
mkdir -p "$store"

if [ -e "$store/complete" ]; then
  if ! compgen -G "$store/*.deb" > /dev/null; then
    echo "Kept from an earlier run: the runner image already has everything."
    exit 0
  fi
  if sudo dpkg --install --skip-same-version --refuse-downgrade "$store"/*.deb; then
    echo "Installed $(ls "$store"/*.deb | wc -l) packages kept from an earlier run, without the network."
    exit 0
  fi
  echo "::warning title=Kept system libraries did not install::Falling back to the package servers. The kept copy stays as it is until the runner image or Playwright version changes."
  sudo dpkg --configure -a || true
fi

# Fail in minutes, not in the quarter of an hour apt takes by default when a server is silent.
sudo tee /etc/apt/apt.conf.d/99-ci-downloads > /dev/null <<'CONF'
APT::Keep-Downloaded-Packages "true";
Acquire::Retries "3";
Acquire::http::Timeout "20";
Acquire::https::Timeout "20";
CONF
sudo apt-get clean

install() {
  # As root, so that a timeout can stop apt itself and not only the npx in front of it.
  sudo env "PATH=$PATH" timeout --kill-after=10 300 npx playwright install-deps "$browser" || return 1
  [ $# -eq 0 ] || sudo timeout --kill-after=10 120 apt-get install -y --no-install-recommends "$@"
}

for attempt in 1 2; do
  if install "$@"; then
    rm -f "$store"/*.deb "$store/complete"
    cp /var/cache/apt/archives/*.deb "$store"/ 2> /dev/null || true
    touch "$store/complete"
    echo "Installed from the package servers; kept $(find "$store" -name '*.deb' | wc -l) packages for later runs."
    exit 0
  fi
  echo "::warning title=System libraries did not install::Attempt $attempt of 2 for $browser failed."
  sudo dpkg --configure -a || true
  [ "$attempt" -eq 2 ] && break
  # The runner asks Azure's copy of the Ubuntu archive first. When that name does not
  # resolve, apt gives up without trying the others in its list, so take it off the list
  # and let the second attempt go to archive.ubuntu.com itself.
  if [ -f /etc/apt/apt-mirrors.txt ] && grep -q -v 'azure\.archive' /etc/apt/apt-mirrors.txt; then
    sudo sed -i '/azure\.archive/d' /etc/apt/apt-mirrors.txt
    echo "Second attempt without Azure's mirror: $(tr '\n' ' ' < /etc/apt/apt-mirrors.txt)"
  fi
  sleep 15
done

echo "::error title=System libraries did not install::The package servers could not be reached and no kept copy exists for this runner image. This is the runner's network, not the game: run the job again later."
exit 1
