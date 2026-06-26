#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_DIR="$HOME/rover"
echo "=== Rover Setup ==="
echo "Repo:    $REPO_DIR"
echo "Deploy:  $DEPLOY_DIR"

# 1. System packages
echo "[1/7] Installing system packages..."
sudo apt-get update -qq
sudo apt-get install -y -qq python3-venv python3-pip

# 2. Directory structure
echo "[2/7] Creating transcript directories..."
mkdir -p "$HOME/transcripts/inbox" "$HOME/transcripts/agendas" "$HOME/transcripts/archive"

# 3. Deploy rover files to ~/rover/
echo "[3/7] Deploying rover files to $DEPLOY_DIR..."
mkdir -p "$DEPLOY_DIR"
cp "$REPO_DIR/schemas.py" "$DEPLOY_DIR/"
cp "$REPO_DIR/harvest_pipeline.py" "$DEPLOY_DIR/"
cp "$REPO_DIR/requirements.txt" "$DEPLOY_DIR/"
cp "$REPO_DIR/watch_transcripts.sh" "$DEPLOY_DIR/"
chmod +x "$DEPLOY_DIR/watch_transcripts.sh"

# 4. Python virtual environment
echo "[4/7] Creating Python virtual environment in $DEPLOY_DIR/.venv..."
python3 -m venv "$DEPLOY_DIR/.venv"
source "$DEPLOY_DIR/.venv/bin/activate"
pip install --quiet --upgrade pip
pip install --quiet -r "$DEPLOY_DIR/requirements.txt"

# 5. Check and configure swap
echo "[5/7] Checking swap space..."
# Use free(1) for robust cross-distro swap detection
swap_kb=$(free -k | awk '/^Swap:/ {print $2}')
if [ -z "$swap_kb" ] || [ "$swap_kb" -lt $((8 * 1024 * 1024)) ]; then
    echo "Swap is insufficient (<8GB, current: $((swap_kb / 1024 / 1024))GB). Creating 8G swap file..."
    sudo fallocate -l 8G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    if ! grep -q '/swapfile' /etc/fstab; then
        echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    fi
    echo "Swap configured."
else
    echo "Swap sufficient ($((swap_kb / 1024 / 1024))GB)."
fi

# 6. Ollama systemd override
echo "[6/7] Installing Ollama systemd override..."
OVERRIDE_DIR="/etc/systemd/system/ollama.service.d"
sudo mkdir -p "$OVERRIDE_DIR"
sudo cp "$REPO_DIR/ollama-service-override.conf" "$OVERRIDE_DIR/override.conf"
sudo systemctl daemon-reload
if systemctl is-active --quiet ollama; then
    sudo systemctl restart ollama
    echo "Ollama restarted with new config."
else
    echo "Ollama not running — start it with: sudo systemctl start ollama"
fi

# 7. Pull model
echo "[7/7] Pulling Qwen3.5:4b model..."
ollama pull qwen3.5:4b

echo ""
echo "=== Setup complete ==="
echo ""
echo "Quick test:"
echo "  cd $DEPLOY_DIR"
echo "  source .venv/bin/activate"
echo "  python3 harvest_pipeline.py --input test.html --output test_agenda.md"
echo ""
echo "To start the watcher:"
echo "  screen -S rover"
echo "  $DEPLOY_DIR/watch_transcripts.sh"
echo ""
echo "File transfer patterns:"
echo "  # Push transcripts:"
echo "    rsync -avz --remove-source-files ~/staged/ user@host:~/transcripts/inbox/"
echo "  # Pull agendas:"
echo "    rsync -avz --remove-source-files user@host:~/transcripts/agendas/ ~/agendas/"
