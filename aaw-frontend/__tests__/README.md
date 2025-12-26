# AAW Frontend Test Suite

## Overview
Comprehensive unit tests for AAW frontend Phase 4 components: TaskContext and RecoveryManager.

## Setup

### Install Dependencies
```bash
cd aaw-frontend
npm install
```

This will install:
- **Jest**: Testing framework
- **@testing-library/react**: React component testing utilities
- **@testing-library/user-event**: User interaction simulation
- **@testing-library/jest-dom**: Custom Jest matchers for DOM

### Configuration Files
- `jest.config.js`: Jest configuration for Next.js
- `jest.setup.js`: Test environment setup (DOM matchers, window.matchMedia mock)

## Running Tests

### All Tests
```bash
npm test
```

### Watch Mode (auto-rerun on changes)
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

Coverage thresholds set to 90% for branches, functions, lines, and statements.

### Run Specific Test File
```bash
npm test -- TaskContext.test.tsx
npm test -- RecoveryManager.test.tsx
```

## Test Structure

### TaskContext Tests (`__tests__/contexts/TaskContext.test.tsx`)

**Test Coverage:**
1. **retryTask**
   - ✓ Calls retry API endpoint
   - ✓ Refreshes task list after retry
   - ✓ Handles API failures gracefully

2. **skipTask**
   - ✓ Calls skip API endpoint
   - ✓ Refreshes task list after skip
   - ✓ Handles API failures gracefully

3. **restartRunner**
   - ✓ Calls restart API endpoint
   - ✓ Refreshes task list after restart
   - ✓ Logs restart initiation
   - ✓ Handles API failures gracefully

4. **Task List Management**
   - ✓ Fetches tasks on mount
   - ✓ Handles fetch failures gracefully

5. **Task Selection**
   - ✓ Selects and deselects tasks

6. **System Ready State**
   - ✓ Starts with system not ready

7. **cancelTask**
   - ✓ Cancels task and refreshes list

8. **createTask**
   - ✓ Creates task and refreshes list
   - ✓ Throws error on API failure

### RecoveryManager Tests (`__tests__/components/RecoveryManager.test.tsx`)

**Test Coverage:**
1. **Modal Visibility**
   - ✓ Shows modal when task is INTERRUPTED
   - ✓ Hides modal when no interrupted tasks
   - ✓ Hides modal when interrupted task is resolved

2. **Retry Task Action**
   - ✓ Calls retryTask when Retry Current clicked
   - ✓ Closes modal after retry completes
   - ✓ Handles retry API failure

3. **Skip Task Action**
   - ✓ Calls skipTask when Skip to Next clicked
   - ✓ Closes modal after skip completes
   - ✓ Handles skip API failure

4. **Restart Runner Action**
   - ✓ Calls restartRunner when Restart Session clicked
   - ✓ Closes modal after restart completes
   - ✓ Handles restart API failure

5. **Modal Close Behavior**
   - ✓ Allows manual modal close

6. **Multiple Interrupted Tasks**
   - ✓ Shows modal for first interrupted task only

## Test Patterns

### Mocking Fetch API
```typescript
(global.fetch as jest.Mock)
  .mockResolvedValueOnce({
    ok: true,
    json: async () => mockData,
  });
```

### Testing User Interactions
```typescript
const user = userEvent.setup();
await user.click(button);
```

### Waiting for Async Updates
```typescript
await waitFor(() => {
  expect(screen.getByText('Expected Text')).toBeInTheDocument();
});
```

### Testing Error Handling
```typescript
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
// ... perform action that logs error ...
expect(consoleErrorSpy).toHaveBeenCalledWith('Error message', expect.any(Error));
consoleErrorSpy.mockRestore();
```

## Best Practices Applied

1. **Role-based Queries**: Using `getByRole` for better accessibility testing
2. **User Event API**: Simulating realistic user interactions
3. **Async Handling**: Proper use of `waitFor` for async updates
4. **Mock Cleanup**: Clearing mocks between tests
5. **Provider Wrapping**: Testing components within TaskProvider context
6. **Error Case Coverage**: Testing both success and failure paths
7. **Type Safety**: Full TypeScript support with strict mode

## Troubleshooting

### Tests Fail with "Cannot find module"
```bash
npm install
```

### Tests Timeout
Increase timeout in test:
```typescript
it('should do something', async () => {
  // test code
}, 10000); // 10 second timeout
```

### Mock Not Working
Ensure mock is before component render:
```typescript
beforeEach(() => {
  (global.fetch as jest.Mock).mockReset();
});
```

## CI/CD Integration

Add to GitHub Actions workflow:
```yaml
- name: Run Tests
  run: npm test -- --ci --coverage --maxWorkers=2
```

## Future Enhancements

- [ ] Add integration tests with MSW for API mocking
- [ ] Add snapshot tests for UI components
- [ ] Add E2E tests with Playwright
- [ ] Add visual regression tests
- [ ] Add performance benchmarks
