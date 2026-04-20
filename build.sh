#!/bin/bash
# Sentrix Unified Build Script
# Builds the React frontend and copies it into backend/static/
# so FastAPI serves everything from a single URL.

set -e

echo "=== Sentrix Unified Build ==="

# Step 1: Build frontend
echo "[1/3] Building React frontend..."
cd frontend
npm install
npm run build
cd ..

# Step 2: Clean old static files
echo "[2/3] Cleaning backend/static/..."
rm -rf backend/static
mkdir -p backend/static

# Step 3: Copy built frontend into backend/static
echo "[3/3] Copying frontend build to backend/static/..."
cp -r frontend/dist/* backend/static/

echo "=== Build Complete! ==="
echo "Backend will now serve the frontend at /"
echo "API remains at /api/*"
echo "Dashboard at /dashboard"
