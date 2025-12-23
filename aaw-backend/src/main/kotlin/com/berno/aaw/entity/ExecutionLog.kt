package com.berno.aaw.entity

import jakarta.persistence.*
import java.time.LocalDateTime

@Entity
@Table(name = "execution_logs")
data class ExecutionLog(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long = 0,

    @Column(name = "task_id", nullable = false)
    val taskId: Long,

    @Column(name = "log_chunk", columnDefinition = "TEXT", nullable = false)
    val logChunk: String,

    @Column(name = "is_error", nullable = false)
    val isError: Boolean = false,

    @Column(name = "created_at", nullable = false)
    val createdAt: LocalDateTime = LocalDateTime.now()
)
