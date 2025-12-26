#!/bin/bash
# Quick Test Commands Reference for AAW Frontend
# Location: /Users/bernocrest/Desktop/dev/projects/aaw/aaw-frontend/

# Navigate to frontend directory
cd "$(dirname "$0")"

echo "🧪 AAW Frontend Test Commands"
echo "================================"
echo ""

# Parse command line argument
COMMAND=${1:-help}

case "$COMMAND" in
  install)
    echo "📦 Installing test dependencies..."
    npm install --save-dev \
      @testing-library/jest-dom@^6.6.3 \
      @testing-library/react@^16.1.0 \
      @testing-library/user-event@^14.5.2 \
      @types/jest@^29.5.14 \
      jest@^29.7.0 \
      jest-environment-jsdom@^29.7.0
    ;;

  all)
    echo "🏃 Running all tests..."
    npm test
    ;;

  watch)
    echo "👀 Running tests in watch mode..."
    npm run test:watch
    ;;

  coverage)
    echo "📊 Running tests with coverage report..."
    npm run test:coverage
    ;;

  context)
    echo "🧩 Running TaskContext tests only..."
    npm test -- TaskContext.test.tsx
    ;;

  recovery)
    echo "🔄 Running RecoveryManager tests only..."
    npm test -- RecoveryManager.test.tsx
    ;;

  verbose)
    echo "🔍 Running tests with verbose output..."
    npm test -- --verbose
    ;;

  debug)
    echo "🐛 Running tests in debug mode..."
    node --inspect-brk node_modules/.bin/jest --runInBand
    ;;

  clean)
    echo "🧹 Cleaning test cache..."
    npm test -- --clearCache
    ;;

  help|*)
    echo "Usage: ./.test-commands.sh [command]"
    echo ""
    echo "Commands:"
    echo "  install   - Install test dependencies"
    echo "  all       - Run all tests"
    echo "  watch     - Run tests in watch mode (auto-rerun on changes)"
    echo "  coverage  - Run tests with coverage report"
    echo "  context   - Run TaskContext tests only"
    echo "  recovery  - Run RecoveryManager tests only"
    echo "  verbose   - Run tests with detailed output"
    echo "  debug     - Run tests in debug mode"
    echo "  clean     - Clear Jest cache"
    echo "  help      - Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./.test-commands.sh install"
    echo "  ./.test-commands.sh all"
    echo "  ./.test-commands.sh coverage"
    ;;
esac
