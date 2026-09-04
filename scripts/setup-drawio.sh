#!/bin/bash
set -e

# Change directory to the repository root
cd "$(dirname "$0")/.."

echo "Preparing public/drawio directory..."
rm -rf public/drawio
mkdir -p public/drawio

echo "Cloning jgraph/drawio sparsely to retrieve client webapp files..."
# Create a temporary directory inside the workspace
mkdir -p tmp
cd tmp
rm -rf drawio-src

git clone --depth 1 --filter=blob:none --sparse https://github.com/jgraph/drawio.git drawio-src
cd drawio-src
git sparse-checkout set src/main/webapp
cd ../..

echo "Copying webapp assets to public/drawio..."
cp -R tmp/drawio-src/src/main/webapp/* public/drawio/

echo "Cleaning up temporary files..."
rm -rf tmp/drawio-src

echo "Draw.io assets successfully set up offline in public/drawio."
