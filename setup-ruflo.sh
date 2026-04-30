#!/bin/bash
# Ruflo setup for Lumen — yellowHEAD AI Dashboard
# Run this once from the Lumen folder: bash setup-ruflo.sh

echo "🌊 Installing Ruflo for Claude Code..."

# Initialize Ruflo in this project
npx ruflo@latest init

echo ""
echo "✅ Done. Now run these Claude Code slash commands in Cursor:"
echo ""
echo "  /plugin marketplace add ruvnet/ruflo"
echo "  /plugin install ruflo-core@ruflo"
echo "  /plugin install ruflo-sparc@ruflo"
echo "  /plugin install ruflo-rvf@ruflo"
echo "  /plugin install ruflo-intelligence@ruflo"
echo ""
echo "Then run: npm install && npm run dev"
