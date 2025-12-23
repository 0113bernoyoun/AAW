package com.berno.aaw.dto

import com.berno.aaw.entity.Task
import com.berno.aaw.entity.TaskStatus
import com.berno.aaw.entity.SessionMode
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
    val createdAt: LocalDateTime
) {
    companion object {
        fun from(task: Task): TaskDTO {
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
                createdAt = task.createdAt
            )
        }
    }
}

data class TaskStatusDTO(
    val taskId: Long,
    val status: TaskStatus
)
