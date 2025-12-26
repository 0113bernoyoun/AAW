package com.berno.aaw.dto

import com.berno.aaw.entity.ExecutionLog
import java.time.LocalDateTime

/**
 * DTO for ExecutionLog entity.
 * Used for returning historical logs via REST API.
 */
data class ExecutionLogDTO(
    val id: Long,
    val taskId: Long,
    val logChunk: String,
    val isError: Boolean,
    val createdAt: LocalDateTime
) {
    companion object {
        fun from(log: ExecutionLog): ExecutionLogDTO {
            return ExecutionLogDTO(
                id = log.id,
                taskId = log.taskId,
                logChunk = log.logChunk,
                isError = log.isError,
                createdAt = log.createdAt
            )
        }
    }
}
