# AAW (AI Auto Worker) - PoC 구현

[![English](https://img.shields.io/badge/Language-English-blue)](README.md)
[![한국어](https://img.shields.io/badge/Language-한국어-red)](README.ko.md)

실시간 로그 스트리밍 & Rate Limit 감지 개념 증명 (PoC)

## ✅ 구현 상태

**Phase 1-3 완료:**
- ✅ 인프라 (Docker, Postgres, Redis)
- ✅ Go Runner (WebSocket 클라이언트, 태스크 실행기, 패턴 매처)
- ✅ Spring Boot 백엔드 (WebSocket 핸들러, SSE 브로드캐스팅, JPA 영속성)
- ✅ Next.js 15 프론트엔드 (실시간 터미널, 상태 배지, 실시간 업데이트)

## 🚀 빠른 시작

### 사전 요구사항
- JDK 17
- Go 1.21+
- Node.js 20+
- Docker & Docker Compose

### 1. 인프라 시작

```bash
# Postgres와 Redis 시작
docker-compose up -d

# 서비스가 실행 중인지 확인
docker-compose ps
```

### 2. 백엔드 시작 (Spring Boot)

```bash
cd aaw-backend
./gradlew bootRun
```

**예상 출력:**
```
Started AawApplication in X.XXX seconds
```

### 3. Runner 시작 (Go)

```bash
cd aaw-runner && go run main.go
```

**예상 출력:**
```
Starting AAW Runner...
Connected to server at ws://localhost:8080/ws/logs (hostname: ..., workdir: ...)
```

**백엔드 로그에 표시되어야 함:**
```
Runner [hostname] connected (hostname: ..., workdir: ...)
```

### 4. 프론트엔드 시작 (Next.js)

```bash
cd aaw-frontend && npm run dev
```

**접속:** http://localhost:3000

---

## 🧪 PoC 테스트

### End-to-End 플로우

1. **프론트엔드 열기:** http://localhost:3000 로 이동
2. **연결 확인:** 녹색 표시등이 "Connected to backend" 표시
3. **태스크 시작:** "Start Dummy Task" 버튼 클릭
4. **로그 관찰:**
   - 1-49번 라인: 정상 처리
   - 50번 라인: "ERROR: 429 Rate limit exceeded - pausing"
   - 상태 배지가 "⚠️ RATE_LIMITED"로 변경
   - 51-100번 라인: 처리 계속
   - 최종 상태: "✅ COMPLETED"

### 백엔드 로그 확인

```
Runner [hostname] connected
Task 1 status updated to RUNNING
Rate limit detected. Pausing Task [1]...
Task 1 status updated to RATE_LIMITED
Task 1 status updated to COMPLETED
```

### 데이터베이스 확인

```bash
# Postgres 접속
docker exec -it aaw-postgres psql -U aawuser -d aaw

# 태스크 확인
SELECT id, instruction, status, created_at FROM tasks;

# 실행 로그 확인
SELECT task_id, log_chunk, is_error FROM execution_logs WHERE task_id = 1 LIMIT 10;
```

---

## 📁 프로젝트 구조

```
aaw/
├── docker-compose.yml          # Postgres + Redis
├── common-docs/
│   ├── PRD.md                  # 제품 요구사항
│   ├── TRD.md                  # 기술 요구사항
│   ├── PROGRESS.md             # 구현 진행상황
│   └── CLAUDE.md               # 프로젝트 가이드
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
│   │   ├── websocket/          # WebSocket 클라이언트
│   │   ├── executor/           # 태스크 실행기
│   │   ├── matcher/            # 패턴 매처
│   │   └── models/             # 메시지 모델
│   ├── scripts/
│   │   └── dummy_task.sh       # 테스트 스크립트
│   └── main.go
└── aaw-frontend/               # Next.js 15
    ├── app/
    │   ├── page.tsx            # 대시보드
    │   ├── layout.tsx
    │   └── globals.css
    ├── components/
    │   ├── LiveTerminal.tsx    # xterm.js 터미널
    │   └── StatusBadge.tsx     # 상태 표시기
    └── lib/
        └── sse-client.ts       # SSE 유틸리티
```

---

## 🔍 구현된 주요 기능

### Runner (Go)
- ✅ 자동 재연결 기능이 있는 WebSocket 클라이언트
- ✅ hostname/workdir와 HELO 핸드셰이크
- ✅ os/exec를 통한 태스크 실행
- ✅ 실시간 stdout/stderr 스트리밍
- ✅ Rate limit 패턴 매처 (429, "Rate limit", "Quota exceeded")
- ✅ 상태 업데이트 메시지
- ✅ 인라인 콘텐츠를 사용한 동적 스크립트 실행
- ✅ args 배열을 사용한 명령어 주입 방지

### 백엔드 (Spring Boot)
- ✅ WebSocket 엔드포인트 (/ws/logs)
- ✅ SSE 엔드포인트 (/api/logs/stream)
- ✅ REST API (/api/tasks/start-dummy, /api/tasks/{id}, /api/tasks/create-dynamic)
- ✅ 태스크 상태 관리 (6가지 상태)
- ✅ JPA 영속성 (Task, ExecutionLog)
- ✅ Reactor Sinks를 사용한 리액티브 브로드캐스팅
- ✅ 단일 Runner 세션 관리 (중복 실행 방지)
- ✅ 새 Runner 등록 시 세션 정리

### 프론트엔드 (Next.js)
- ✅ xterm.js 라이브 터미널
- ✅ 실시간 업데이트를 위한 SSE 클라이언트
- ✅ 색상 코딩이 있는 상태 배지
- ✅ 태스크 트리거 버튼
- ✅ 연결 상태 표시기
- ✅ 스크립트/프롬프트 입력이 있는 동적 태스크 제어 패널
- ✅ 세션 모드 선택 (NEW vs PERSIST)
- ✅ 인라인 경고 패널이 있는 Skip Permissions 토글
- ✅ 부드러운 CSS 전환이 있는 확장 가능한 위험 모드 경고
- ✅ 조건부 경고 표시 (체크박스 선택 시에만 표시)

---

## 🛠️ 기술 스택

| 컴포넌트 | 기술 | 버전 |
|-----------|-----------|---------|
| 백엔드 | Spring Boot (Kotlin) | 3.4.1 |
| Runner | Go | 1.21+ |
| 프론트엔드 | Next.js (TypeScript) | 15.1+ |
| 데이터베이스 | PostgreSQL | 15 |
| 캐시 | Redis | 7 |
| 터미널 | @xterm/xterm | 6.0+ |
| WebSocket | gorilla/websocket | 1.5+ |

---

## 🎯 달성된 성공 기준

✅ 사용자가 웹 UI에서 더미 태스크를 시작할 수 있음
✅ 로그가 웹 터미널에 실시간으로 표시됨
✅ "LIMIT" 키워드가 "Paused by Rate Limit" 배지를 트리거함
✅ 백엔드가 "Rate limit detected. Pausing Task..."를 로그함
✅ 모든 하위 태스크가 PROGRESS.md에 완료로 표시됨

---

## ⚡ 고급 기능

### 동적 태스크 제어 패널
프론트엔드에 다음과 같은 포괄적인 태스크 제어 패널이 포함되어 있습니다:

**스크립트/프롬프트 입력:**
- Claude Code 스크립트 또는 프롬프트 입력을 위한 다중 라인 텍스트 영역
- 인라인 스크립트 콘텐츠 지원 (외부 .sh 파일 불필요)
- 처음 100자를 태스크 지시 요약으로 사용

**세션 모드 선택:**
- **PERSIST** (기본값): 태스크 실행 간 공유 컨텍스트 사용
- **NEW**: 각 태스크에 대한 독립적이고 깨끗한 컨텍스트

**실행 모드:**
- **Skip Permissions 토글**: Claude Code의 `--dangerously-skip-permissions` 플래그 활성화
- **인라인 경고 패널**: Skip Permissions 체크 시 Start Task 버튼 아래에 확장 가능한 경고 표시
- **부드러운 애니메이션**: 세련된 UX를 위한 max-height CSS 전환
- **조건부 표시**: 체크박스 선택 시에만 경고 표시, 선택 해제 시 즉시 사라짐

**안전 기능:**
- 위험 모드를 위한 2단계 확인 (체크박스 + Start Task 확인)
- 명확한 보안 영향 나열 (확인 없이 실행, 파일 수정, 시스템 변경, 민감한 데이터 접근)
- 빨간색 테두리와 주의를 끄는 아이콘이 있는 경고 패널
- 태스크 제출 전 시스템 준비 상태 검증

**프리셋 태스크:**
- 빠른 테스트를 위한 "Load Math Test" 버튼 (Python factorial 스크립트 생성)
- 자동으로 skipPermissions=true 및 sessionMode=NEW 설정

### 단일 Runner 세션 관리
백엔드에서 중복 실행을 방지하기 위해 **단일 Runner 전략**을 구현했습니다:

**해결된 문제:**
- 이전 구현에서는 ConcurrentHashMap에 여러 Runner 세션 허용
- Runner 재연결 시 이전 세션이 활성 상태로 유지
- 태스크가 모든 세션으로 전송되어 2x-4x 중복 실행 발생

**솔루션:**
```kotlin
fun registerRunnerSession(sessionId: String, session: WebSocketSession) {
    // 새 세션을 등록하기 전에 모든 기존 세션 닫기
    runnerSessions.values.forEach { existingSession ->
        if (existingSession.isOpen) {
            existingSession.close()
            logger.info("Closed existing runner session to prevent duplicates")
        }
    }
    runnerSessions.clear()

    // 새 세션 등록
    runnerSessions[sessionId] = session
    logger.info("Runner session registered: {} (total active: {})", sessionId, runnerSessions.size)
}
```

**장점:**
- 언제든지 정확히 하나의 활성 Runner 세션 보장
- 중복 태스크 실행 방지
- 오래된 세션 자동 정리
- 세션 라이프사이클 추적을 위한 명확한 로깅

---

## 🔧 문제 해결

### Runner가 연결되지 않음
- 먼저 백엔드가 실행 중인지 확인
- "Started AawApplication" 백엔드 로그 확인
- 포트 8080이 차단되지 않았는지 확인

### 프론트엔드가 연결 끊김 표시
- 백엔드가 http://localhost:8080 에서 접근 가능한지 확인
- CORS가 구성되었는지 확인 (application.properties)
- 브라우저 콘솔에서 오류 확인

### 로그가 표시되지 않음
- Runner가 연결되었는지 확인 (백엔드 로그 확인)
- dummy_task.sh에 실행 권한이 있는지 확인: `chmod +x scripts/dummy_task.sh`
- sendToRunner 호출에서 스크립트 경로가 올바른지 확인

### 데이터베이스 오류
- Postgres가 실행 중인지 확인: `docker-compose ps`
- application.properties에서 연결 확인
- 데이터베이스 초기화 확인: `spring.jpa.hibernate.ddl-auto=create-drop`

### 프론트엔드가 업데이트되지 않음 / 코드 변경사항이 반영되지 않음
**증상**: 파일 수정에도 불구하고 UI가 코드 변경사항을 반영하지 않음

**일반적인 원인:**
1. **브라우저 캐시**: 하드 새로고침 필요 (Cmd+Shift+R / Ctrl+Shift+F5)
2. **Next.js 캐시**: `.next` 디렉토리가 이전 빌드를 캐싱
3. **Hot Module Replacement**: React 컴포넌트가 핫 리로드되지 않음

**솔루션:**
```bash
# 1. Next.js 캐시 지우기
cd aaw-frontend
rm -rf .next
rm -rf node_modules/.cache

# 2. 모든 Next.js 프로세스 종료
lsof -ti:3000 -ti:3001 | xargs kill -9

# 3. 필요한 경우 lock 파일 제거
rm -f .next/cache/webpack/*

# 4. 프론트엔드 재시작
npm run dev
```

**확인:**
- 브라우저 콘솔에서 버전 로그 확인 (예: `[TaskControlPanel] Version 2.0`)
- 브라우저 DevTools 네트워크 탭을 사용하여 JavaScript 번들이 최신인지 확인 (타임스탬프 확인)
- 터미널에서 "Compiled successfully" 메시지 찾기

### 경고 패널이 올바르게 표시/숨겨지지 않음
**증상**: Danger Mode 경고 패널이 Skip Permissions 체크박스에 반응하지 않음

**확인:**
1. 브라우저 콘솔에서 디버그 로그: `[DEBUG] Skip Permissions changed: true/false`
2. CSS 클래스가 아닌 조건부 렌더링(`&&`)을 사용하는 React 컴포넌트
3. 캐시된 JavaScript를 지우기 위해 브라우저 하드 새로고침 (Cmd+Shift+R)

**올바른 구현:**
```typescript
{showDangerWarning && skipPermissions && (
  <div>경고 패널</div>
)}
```

**잘못된 구현 (신뢰할 수 없음):**
```typescript
<div className={showDangerWarning ? 'max-h-96' : 'max-h-0'}>
```

### 백엔드가 exit value 137로 충돌
**증상**: 백엔드 프로세스가 종료 코드 137로 예기치 않게 종료됨

**원인**: 메모리 부족 (OOM killer)

**솔루션:**
1. 시스템 메모리 확인: `top` 또는 `htop`
2. 모든 Java 프로세스 종료: `pkill -9 java`
3. 깨끗하게 재시작: `cd aaw-backend && ./gradlew bootRun`
4. 작업 중 메모리 사용량 모니터링

---

## 📝 다음 단계 (Phase 4+)

- [ ] Claude Code CLI와 통합
- [ ] Git Diff 추출 및 다양한 형식으로 내보내기
- [ ] Jira API 통합
- [ ] Rate limit 복구 스케줄러 (1/5분 폴링)
- [ ] Redis를 사용한 태스크 큐 관리
- [ ] 다중 Runner 지원
- [ ] Guardrail 워크플로우 (브랜치 생성, 승인 게이트)

---

## 📄 라이선스

MIT

---

## 👥 기여자

Claude Code PoC 구현으로 생성됨
