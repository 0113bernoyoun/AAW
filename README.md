# AAW (AI Auto Worker) - PoC Implementation

[![English](https://img.shields.io/badge/Language-English-blue)](README.md)
[![한국어](https://img.shields.io/badge/Language-한국어-red)](README.ko.md)

Real-time Log Streaming & Rate-Limit Detection Proof of Concept

## ✅ Implementation Status

**Phase 1-4.7 Complete:**
- ✅ Infrastructure (Docker, Postgres, Redis)
- ✅ Go Runner (WebSocket client, Task executor, Pattern matcher, Process verification)
- ✅ Spring Boot Backend (WebSocket handler, SSE broadcasting, JPA persistence, Task watchdog)
- ✅ Next.js 15 Frontend (Live terminal, Status badges, Real-time updates, Checkbox bulk delete)
- ✅ Multi-Tab SSE Support (Independent per-tab connections with full event streams)
- ✅ Guaranteed Task Termination (30s watchdog, force-kill with DB update, process verification)

## 🚀 Quick Start

### Prerequisites
- JDK 17
- Go 1.21+
- Node.js 20+
- Docker & Docker Compose

### 1. Start Infrastructure

```bash
# Start Postgres and Redis
docker-compose up -d

# Verify services are running
docker-compose ps
```

### 2. Start Backend (Spring Boot)

```bash
cd aaw-backend
./gradlew bootRun
```

**Expected output:**
```
Started AawApplication in X.XXX seconds
```

### 3. Start Runner (Go)

```bash
cd aaw-runner && go run main.go
```

**Expected output:**
```
Starting AAW Runner...
Connected to server at ws://localhost:8080/ws/logs (hostname: ..., workdir: ...)
```

**Backend logs should show:**
```
Runner [hostname] connected (hostname: ..., workdir: ...)
```

### 4. Start Frontend (Next.js)

```bash
cd aaw-frontend && npm run dev
```

**Access:** http://localhost:3000

---

## 🧪 Testing the PoC

### End-to-End Flow

1. **Open Frontend:** Navigate to http://localhost:3000
2. **Check Connection:** Green indicator should show "Connected to backend"
3. **Start Task:** Click "Start Dummy Task" button
4. **Observe Logs:**
   - Lines 1-49: Normal processing
   - Line 50: "ERROR: 429 Rate limit exceeded - pausing"
   - Status badge changes to "⚠️ RATE_LIMITED"
   - Lines 51-100: Continue processing
   - Final status: "✅ COMPLETED"

### Backend Logs to Verify

```
Runner [hostname] connected
Task 1 status updated to RUNNING
Rate limit detected. Pausing Task [1]...
Task 1 status updated to RATE_LIMITED
Task 1 status updated to COMPLETED
```

### Database Verification

```bash
# Connect to Postgres
docker exec -it aaw-postgres psql -U aawuser -d aaw

# Check tasks
SELECT id, instruction, status, created_at FROM tasks;

# Check execution logs
SELECT task_id, log_chunk, is_error FROM execution_logs WHERE task_id = 1 LIMIT 10;
```

---

## 📁 Project Structure

```
aaw/
├── docker-compose.yml          # Postgres + Redis
├── common-docs/
│   ├── PRD.md                  # Product Requirements
│   ├── TRD.md                  # Technical Requirements
│   ├── PROGRESS.md             # Implementation Progress
│   └── CLAUDE.md               # Project Guide
├── aaw-backend/                # Spring Boot 3.4.1
│   ├── src/main/kotlin/com/berno/aaw/
│   │   ├── entity/             # Task, ExecutionLog
│   │   ├── repository/         # JPA Repositories
│   │   ├── service/            # TaskService
│   │   ├── handler/            # RunnerWebSocketHandler
│   │   ├── controller/         # TaskController, LogStreamController
│   │   ├── dto/                # DTOs
│   │   └── config/             # WebSocketConfig
│   └── build.gradle.kts
├── aaw-runner/                 # Go 1.21+
│   ├── internal/
│   │   ├── websocket/          # WebSocket client
│   │   ├── executor/           # Task executor
│   │   ├── matcher/            # Pattern matcher
│   │   └── models/             # Message models
│   ├── scripts/
│   │   └── dummy_task.sh       # Test script
│   └── main.go
└── aaw-frontend/               # Next.js 15
    ├── app/
    │   ├── page.tsx            # Dashboard
    │   ├── layout.tsx
    │   └── globals.css
    ├── components/
    │   ├── LiveTerminal.tsx    # xterm.js terminal
    │   └── StatusBadge.tsx     # Status indicator
    └── lib/
        └── sse-client.ts       # SSE utility
```

---

## 🔍 Key Features Implemented

### Runner (Go)
- ✅ WebSocket client with auto-reconnect
- ✅ HELO handshake with hostname/workdir
- ✅ Task execution via os/exec
- ✅ Real-time stdout/stderr streaming
- ✅ Pattern matcher for rate limits (429, "Rate limit", "Quota exceeded")
- ✅ Status update messages
- ✅ Dynamic script execution with inline content
- ✅ Command injection prevention using args array
- ✅ Enhanced process verification with timeout and polling
- ✅ Auto-escalation to SIGKILL if SIGTERM fails (10s timeout)
- ✅ CANCEL_ACK protocol with success/failure reporting

### Backend (Spring Boot)
- ✅ WebSocket endpoint (/ws/logs)
- ✅ SSE endpoint (/api/logs/stream)
- ✅ REST API (/api/tasks/*, /api/runner/*)
- ✅ Task status management (9 states: QUEUED, RUNNING, CANCELLING, CANCELLED, KILLED, COMPLETED, FAILED, INTERRUPTED, PAUSED)
- ✅ JPA persistence (Task, ExecutionLog)
- ✅ Reactive broadcasting with Reactor Sinks
- ✅ Single-runner session management (prevents duplicate execution)
- ✅ Session cleanup on new runner registration
- ✅ TaskCancellationWatchdog (30s timeout for stuck CANCELLING tasks)
- ✅ Enhanced force-kill endpoint with immediate DB update
- ✅ Bulk cleanup endpoint with task ID filtering

### Frontend (Next.js)
- ✅ xterm.js live terminal
- ✅ SSE client for real-time updates (multi-tab support confirmed)
- ✅ Status badge with color coding (includes CANCELLING, KILLED)
- ✅ Task trigger button
- ✅ Connection status indicator
- ✅ Dynamic Task Control Panel with script/prompt input
- ✅ Session mode selection (NEW vs PERSIST)
- ✅ Skip Permissions toggle with inline warning panel
- ✅ Expandable danger mode warning with smooth CSS transition
- ✅ Conditional warning display (only shows when checkbox checked)
- ✅ Checkbox-based bulk deletion (select multiple tasks to delete)
- ✅ Visual feedback for task termination states (CANCELLING → KILLED)

---

## 🛠️ Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Backend | Spring Boot (Kotlin) | 3.4.1 |
| Runner | Go | 1.21+ |
| Frontend | Next.js (TypeScript) | 15.1+ |
| Database | PostgreSQL | 15 |
| Cache | Redis | 7 |
| Terminal | @xterm/xterm | 6.0+ |
| WebSocket | gorilla/websocket | 1.5+ |

---

## 🎯 Success Criteria Met

✅ User can start dummy task from Web UI
✅ Logs appear in Web Terminal in real-time
✅ "LIMIT" keyword triggers "Paused by Rate Limit" badge
✅ Backend logs "Rate limit detected. Pausing Task..."
✅ All sub-tasks marked complete in PROGRESS.md

---

## ⚡ Advanced Features

### Dynamic Task Control Panel
The frontend now includes a comprehensive task control panel with:

**Script/Prompt Input:**
- Multi-line textarea for entering Claude Code scripts or prompts
- Supports inline script content (no need for external .sh files)
- First 100 characters used as task instruction summary

**Session Mode Selection:**
- **PERSIST** (default): Use shared context across task executions
- **NEW**: Isolated clean context for each task

**Execution Mode:**
- **Skip Permissions Toggle**: Enable Claude Code's `--dangerously-skip-permissions` flag
- **Inline Warning Panel**: Expandable warning appears below Start Task button when Skip Permissions is checked
- **Smooth Animation**: CSS transition with max-height for polished UX
- **Conditional Display**: Warning only shows when checkbox is checked and disappears immediately when unchecked

**Safety Features:**
- Two-step confirmation for danger mode (checkbox + Start Task confirmation)
- Clear security implications listed (execute without confirmation, modify files, system changes, access sensitive data)
- Warning panel with red border and attention-grabbing icon
- System ready status validation before task submission

**Preset Tasks:**
- "Load Math Test" button for quick testing (creates Python factorial script)
- Automatically sets skipPermissions=true and sessionMode=NEW

### Single-Runner Session Management
The backend now implements a **single-runner strategy** to prevent duplicate execution:

**Problem Solved:**
- Previous implementation allowed multiple Runner sessions in ConcurrentHashMap
- When Runner reconnected, old sessions remained active
- Tasks were sent to ALL sessions, causing 2x-4x duplicate execution

**Solution:**
```kotlin
fun registerRunnerSession(sessionId: String, session: WebSocketSession) {
    // Close all existing sessions before registering new one
    runnerSessions.values.forEach { existingSession ->
        if (existingSession.isOpen) {
            existingSession.close()
            logger.info("Closed existing runner session to prevent duplicates")
        }
    }
    runnerSessions.clear()

    // Register the new session
    runnerSessions[sessionId] = session
    logger.info("Runner session registered: {} (total active: {})", sessionId, runnerSessions.size)
}
```

**Benefits:**
- Guarantees exactly one active Runner session at any time
- Prevents duplicate task execution
- Automatic cleanup of stale sessions
- Clear logging for session lifecycle tracking

---

## 🔧 Troubleshooting

### Runner won't connect
- Ensure backend is running first
- Check backend logs for "Started AawApplication"
- Verify port 8080 is not blocked

### Frontend shows disconnected
- Check if backend is accessible at http://localhost:8080
- Verify CORS is configured (application.properties)
- Check browser console for errors

### No logs appearing
- Ensure runner connected (check backend logs)
- Verify dummy_task.sh has execute permissions: `chmod +x scripts/dummy_task.sh`
- Check if script path is correct in sendToRunner call

### Database errors
- Ensure Postgres is running: `docker-compose ps`
- Check connection in application.properties
- Verify database initialization: `spring.jpa.hibernate.ddl-auto=create-drop`

### Frontend not updating / Code changes not reflecting
**Symptom**: UI doesn't reflect code changes despite file modifications

**Common Causes:**
1. **Browser Cache**: Hard refresh required (Cmd+Shift+R / Ctrl+Shift+F5)
2. **Next.js Cache**: `.next` directory caching old builds
3. **Hot Module Replacement**: React components not hot-reloading

**Solutions:**
```bash
# 1. Clear Next.js cache
cd aaw-frontend
rm -rf .next
rm -rf node_modules/.cache

# 2. Kill all Next.js processes
lsof -ti:3000 -ti:3001 | xargs kill -9

# 3. Remove lock files if needed
rm -f .next/cache/webpack/*

# 4. Restart frontend
npm run dev
```

**Verification:**
- Check browser console for version logs (e.g., `[TaskControlPanel] Version 2.0`)
- Use browser DevTools Network tab to verify JavaScript bundle is fresh (check timestamps)
- Look for "Compiled successfully" message in terminal

### Warning panel not showing/hiding correctly
**Symptom**: Danger Mode warning panel doesn't respond to Skip Permissions checkbox

**Check:**
1. Browser console for debug logs: `[DEBUG] Skip Permissions changed: true/false`
2. React component using conditional rendering (`&&`) not CSS classes
3. Hard refresh browser (Cmd+Shift+R) to clear cached JavaScript

**Correct Implementation:**
```typescript
{showDangerWarning && skipPermissions && (
  <div>warning panel</div>
)}
```

**Incorrect (unreliable):**
```typescript
<div className={showDangerWarning ? 'max-h-96' : 'max-h-0'}>
```

### Backend crashes with exit value 137
**Symptom**: Backend process terminates unexpectedly with exit code 137

**Cause**: Memory pressure (OOM killer)

**Solutions:**
1. Check system memory: `top` or `htop`
2. Kill all Java processes: `pkill -9 java`
3. Restart cleanly: `cd aaw-backend && ./gradlew bootRun`
4. Monitor memory usage during operation

---

## 📝 Next Steps (Phase 5+)

- [x] Integration with Claude Code CLI (Phase 3.8)
- [x] Task queue management with Redis (Phase 4.2)
- [x] Multi-tab SSE support (Phase 4.7 - confirmed working)
- [x] Checkbox bulk deletion (Phase 4.7)
- [x] Guaranteed task termination (Phase 4.7 - watchdog + process verification)
- [ ] Git Diff extraction and approval UI
- [ ] Jira API integration
- [ ] Rate limit recovery scheduler (1/5 min polling)
- [ ] Multi-runner support
- [ ] Guardrail workflow (branch creation, approval gates)

---

## 📄 License

MIT

---

## 👥 Contributors

Generated with Claude Code PoC Implementation
