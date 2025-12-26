package com.berno.aaw.dto

import com.berno.aaw.entity.Task
import com.berno.aaw.entity.TaskStatus
import com.berno.aaw.entity.SessionMode
import com.berno.aaw.entity.ExecutionMode
import java.time.LocalDateTime

data class TaskDTO(
    val id: Long,
    val instruction: String,
    val status: TaskStatus,
    val currentBranch: String?,
    val baseBranch: String?,
    val jiraKey: String?,
    val scriptContent: String?,
    val skipPermissions: Boolean,
    val sessionMode: SessionMode,
    val createdAt: LocalDateTime,

    // Phase 4.1: Queue management fields
    val priority: Int,
    val queuePosition: Int?,
    val queuedAt: LocalDateTime?,
    val startedAt: LocalDateTime?,
    val completedAt: LocalDateTime?,
    val errorSummary: String?,
    val executionMode: ExecutionMode,
    val failureReason: String?,
    val retryCount: Int,
    val cancelledAt: LocalDateTime?
) {
    companion object {
        fun from(task: Task, queuePosition: Int? = null): TaskDTO {
            return TaskDTO(
                id = task.id,
                instruction = task.instruction,
                status = task.status,
                currentBranch = task.currentBranch,
                baseBranch = task.baseBranch,
                jiraKey = task.jiraKey,
                scriptContent = task.scriptContent,
                skipPermissions = task.skipPermissions,
                sessionMode = task.sessionMode,
                createdAt = task.createdAt,
                priority = task.priority,
                queuePosition = queuePosition,
                queuedAt = task.queuedAt,
                startedAt = task.startedAt,
                completedAt = task.completedAt,
                errorSummary = task.errorSummary,
                executionMode = task.executionMode,
                failureReason = task.failureReason,
                retryCount = task.retryCount,
                cancelledAt = task.cancelledAt
            )
        }
    }
}

data class TaskStatusDTO(
    val taskId: Long,
    val status: TaskStatus
)

/**
 * Phase 4: System state snapshot for frontend re-attachment.
 * Contains current system state and running task information.
 */
data class SystemStateDTO(
    val isRunnerConnected: Boolean,
    val isRateLimited: Boolean,
    val runnerStatus: String,  // "IDLE" or "BUSY"
    val runningTasks: List<RunningTaskDTO>,
    val queuedTaskCount: Int,
    val timestamp: Long = System.currentTimeMillis()
)

/**
 * Minimal task info for running tasks in system state.
 */
data class RunningTaskDTO(
    val id: Long,
    val instruction: String,
    val status: String,
    val startedAt: LocalDateTime?
)
