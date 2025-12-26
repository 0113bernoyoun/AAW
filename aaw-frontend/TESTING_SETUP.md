# Testing Setup Guide

## Installation

### Step 1: Install Test Dependencies
```bash
cd /Users/bernocrest/Desktop/dev/projects/aaw/aaw-frontend
npm install --save-dev \
  @testing-library/jest-dom@^6.6.3 \
  @testing-library/react@^16.1.0 \
  @testing-library/user-event@^14.5.2 \
  @types/jest@^29.5.14 \
  jest@^29.7.0 \
  jest-environment-jsdom@^29.7.0
```

### Step 2: Verify Installation
```bash
npm test -- --version
```

Expected output: `Jest 29.7.0` (or similar)

### Step 3: Run Tests
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

## What's Included

### Configuration Files
- ✅ `jest.config.js` - Jest configuration for Next.js
- ✅ `jest.setup.js` - Test environment setup
- ✅ `package.json` - Updated with test scripts

### Test Files
- ✅ `__tests__/contexts/TaskContext.test.tsx` - 10 test cases
- ✅ `__tests__/components/RecoveryManager.test.tsx` - 15 test cases

### Documentation
- ✅ `__tests__/README.md` - Comprehensive test documentation
- ✅ `TESTING_SETUP.md` - This setup guide

## Test Coverage Summary

### TaskContext (10 test cases)
- ✓ Retry task with API success
- ✓ Retry task with API failure
- ✓ Skip task with API success
- ✓ Skip task with API failure
- ✓ Restart runner with API success
- ✓ Restart runner with API failure
- ✓ Fetch tasks on mount
- ✓ Handle fetch failures
- ✓ Task selection
- ✓ Create task

### RecoveryManager (15 test cases)
- ✓ Show modal for INTERRUPTED task
- ✓ Hide modal when no interrupted tasks
- ✓ Hide modal when task resolved
- ✓ Retry current task action
- ✓ Retry closes modal
- ✓ Retry handles API failure
- ✓ Skip to next task action
- ✓ Skip closes modal
- ✓ Skip handles API failure
- ✓ Restart session action
- ✓ Restart closes modal
- ✓ Restart handles API failure
- ✓ Manual modal close
- ✓ Multiple interrupted tasks

## Expected Test Results

All 25 tests should pass:
```
PASS  __tests__/contexts/TaskContext.test.tsx
PASS  __tests__/components/RecoveryManager.test.tsx

Test Suites: 2 passed, 2 total
Tests:       25 passed, 25 total
```

## Troubleshooting

### Issue: "Cannot find module @testing-library/react"
**Solution:** Run `npm install` to install dependencies

### Issue: "Jest encountered an unexpected token"
**Solution:** Ensure `jest.config.js` is properly configured for Next.js

### Issue: Tests timeout
**Solution:** API mocks might not be set up correctly. Check `global.fetch` mocks.

### Issue: "ReferenceError: React is not defined"
**Solution:** Add `import React from 'react'` to test file (should already be there)

## Next Steps

1. Install dependencies: `npm install`
2. Run tests: `npm test`
3. Check coverage: `npm run test:coverage`
4. Set up CI/CD pipeline with tests
5. Add more test cases as features grow

## Integration with CI/CD

### GitHub Actions Example
```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test -- --ci --coverage
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

## Quality Metrics

- **Test Coverage Target:** 90%+ (configured in jest.config.js)
- **Total Test Cases:** 25
- **Test Execution Time:** ~2-5 seconds
- **Framework:** Jest 29 + React Testing Library 16
- **Type Safety:** Full TypeScript support
