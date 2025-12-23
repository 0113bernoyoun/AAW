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
    val createdAt: LocalDateTime = LocalDateTime.now()
)

enum class TaskStatus {
    PENDING,
    RUNNING,
    PAUSED,
    RATE_LIMITED,
    COMPLETED,
    FAILED
}

enum class SessionMode {
    NEW,
    PERSIST
}
