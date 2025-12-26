package com.berno.aaw.entity

import jakarta.persistence.*
import java.time.LocalDateTime

@Entity
@Table(name = "tasks")
data class Task(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long = 0,

    @Column(nullable = false)
    val instruction: String,

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    var status: TaskStatus = TaskStatus.PENDING,

    @Column(name = "current_branch")
    val currentBranch: String? = null,

    @Column(name = "base_branch")
    val baseBranch: String? = null,

    @Column(name = "jira_key")
    val jiraKey: String? = null,

    @Column(name = "script_content", columnDefinition = "TEXT")
    val scriptContent: String? = null,

    @Column(name = "skip_permissions", nullable = false)
    val skipPermissions: Boolean = false,

    @Enumerated(EnumType.STRING)
    @Column(name = "session_mode", nullable = false)
    val sessionMode: SessionMode = SessionMode.PERSIST,

    @Column(name = "created_at", nullable = false)
    val createdAt: LocalDateTime = LocalDateTime.now(),

    // Phase 4.1: Queue management fields
    @Column(nullable = false)
    val priority: Int = 0,

    @Column(name = "queued_at")
    var queuedAt: LocalDateTime? = null,

    @Column(name = "started_at")
    var startedAt: LocalDateTime? = null,

    @Column(name = "completed_at")
    var completedAt: LocalDateTime? = null,

    @Column(name = "error_summary", length = 1000)
    var errorSummary: String? = null,

    @Enumerated(EnumType.STRING)
    @Column(name = "execution_mode", nullable = false, length = 20)
    val executionMode: ExecutionMode = ExecutionMode.QUEUED,

    @Column(name = "failure_reason", length = 50)
    var failureReason: String? = null,

    @Column(name = "retry_count", nullable = false)
    var retryCount: Int = 0,

    @Column(name = "cancelled_at")
    var cancelledAt: LocalDateTime? = null
)

enum class TaskStatus {
    PENDING,
    QUEUED,
    RUNNING,
    PAUSED,
    RATE_LIMITED,
    COMPLETED,
    FAILED,
    PAUSED_BY_LIMIT,
    INTERRUPTED,
    CANCELLED,
    CANCELLING,  // SIGTERM sent, waiting for graceful shutdown
    KILLED       // Force killed with SIGKILL
}

enum class ExecutionMode {
    QUEUED,
    DIRECT
}

enum class SessionMode {
    NEW,
    PERSIST
}
