package com.berno.aaw.service

import com.berno.aaw.dto.LogChunkDTO
import com.berno.aaw.entity.TaskStatus
import com.berno.aaw.repository.TaskRepository
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import java.time.LocalDateTime

/**
 * Service responsible for 24-hour task retention policy.
 *
 * Runs hourly to archive (soft delete) tasks in terminal states that completed more than 24 hours ago.
 * Terminal states: COMPLETED, FAILED, CANCELLED, INTERRUPTED
 *
 * Tasks are marked with is_archived=true and deleted_at timestamp (soft delete).
 * Archived tasks can be permanently deleted via "Empty Trash" endpoint.
 * Broadcasts TASK_ARCHIVED SSE event for real-time frontend updates (no toast notification).
 *
 * @author Claude (AAW Implementation)
 * @since 2025-12-30
 */
@Service
class TaskRetentionService(
    private val taskRepository: TaskRepository,
    private val taskService: TaskService
) {
    private val logger = LoggerFactory.getLogger(TaskRetentionService::class.java)

    companion object {
        private const val RETENTION_HOURS = 24L
    }

    /**
     * Scheduled task that runs every hour at :00 minutes.
     * Archives tasks in terminal states older than 24 hours.
     */
    @Scheduled(cron = "0 0 * * * *")
    fun archiveExpiredTasks() {
        val cutoffTime = LocalDateTime.now().minusHours(RETENTION_HOURS)
        val terminalStatuses = listOf(
            TaskStatus.COMPLETED,
            TaskStatus.FAILED,
            TaskStatus.CANCELLED,
            TaskStatus.INTERRUPTED
        )

        logger.info("Starting retention cleanup (cutoff: $cutoffTime)")

        val expiredTasks = taskRepository.findByStatusInAndCompletedAtBefore(
            terminalStatuses,
            cutoffTime
        )

        if (expiredTasks.isEmpty()) {
            logger.info("No expired tasks found")
            return
        }

        logger.info("Found ${expiredTasks.size} expired tasks for archival")

        var archivedCount = 0
        expiredTasks.forEach { task ->
            try {
                // Soft delete: mark as archived with timestamp
                if (!task.isArchived) {
                    task.isArchived = true
                    task.deletedAt = LocalDateTime.now()
                    taskRepository.save(task)

                    // Broadcast archival event (silent - no toast)
                    broadcastArchival(task.id)
                    archivedCount++

                    logger.debug("Archived task [${task.id}]: ${task.instruction}")
                }
            } catch (e: Exception) {
                logger.error("Failed to archive task [${task.id}]", e)
            }
        }

        logger.info("Retention cleanup completed (archived: $archivedCount)")
    }

    /**
     * Broadcasts TASK_ARCHIVED SSE event to all connected frontend clients.
     * Frontend removes task from UI silently without toast notification.
     */
    private fun broadcastArchival(taskId: Long) {
        val event = LogChunkDTO(
            type = "TASK_ARCHIVED",
            taskId = taskId,
            line = null,
            status = null,
            isError = false
        )
        taskService.broadcastLog(event)
    }
}
