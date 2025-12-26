package com.berno.aaw.service

import com.berno.aaw.entity.TaskStatus
import com.berno.aaw.repository.TaskRepository
import jakarta.annotation.PostConstruct
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service

/**
 * Task recovery service that runs on application startup.
 * Reconciles Redis queue state with database state to recover from:
 * 1. Orphaned tasks in Redis (task ID exists in queue but not in DB)
 * 2. Missing tasks in Redis (task has QUEUED status in DB but not in queue)
 */
@Service
class TaskRecoveryService(
    private val redisQueueService: RedisQueueService,
    private val taskRepository: TaskRepository,
    private val taskDispatcherService: TaskDispatcherService
) {
    private val logger = LoggerFactory.getLogger(TaskRecoveryService::class.java)

    /**
     * Run recovery on application startup.
     * This method:
     * 1. Gets all task IDs from Redis queue
     * 2. For each, verifies the task exists in DB with QUEUED status
     * 3. Removes orphaned entries from Redis
     * 4. Re-enqueues any QUEUED tasks in DB that are missing from Redis
     * 5. Triggers dispatch if any tasks were recovered
     */
    @PostConstruct
    fun recoverOrphanedTasks() {
        logger.info("Starting task recovery check...")

        var orphansRemoved = 0
        var tasksReenqueued = 0

        try {
            // 1. Get all task IDs from Redis queue
            val queuedTaskIds = redisQueueService.getAllQueuedTaskIds()
            logger.info("Found {} task(s) in Redis queue", queuedTaskIds.size)

            // 2. For each, verify exists in DB with QUEUED status
            queuedTaskIds.forEach { taskId ->
                val task = taskRepository.findById(taskId).orElse(null)
                if (task == null) {
                    logger.warn("Orphaned task {} in Redis but not in DB, removing from queue", taskId)
                    redisQueueService.remove(taskId)
                    orphansRemoved++
                } else if (task.status != TaskStatus.QUEUED) {
                    logger.warn("Task {} in Redis but status is {} (not QUEUED), removing from queue", taskId, task.status)
                    redisQueueService.remove(taskId)
                    orphansRemoved++
                }
            }

            // 3. Re-enqueue any QUEUED tasks in DB that are missing from Redis
            val queuedInDb = taskRepository.findByStatus(TaskStatus.QUEUED)
            queuedInDb.forEach { task ->
                if (!queuedTaskIds.contains(task.id)) {
                    logger.info("Re-enqueuing task {} (priority: {}) missing from Redis", task.id, task.priority)
                    redisQueueService.enqueue(task.id, task.priority)
                    tasksReenqueued++
                }
            }

            // 4. Log summary
            logger.info(
                "Task recovery complete: {} orphan(s) removed, {} task(s) re-enqueued, {} total queued tasks in DB",
                orphansRemoved, tasksReenqueued, queuedInDb.size
            )

            // 5. Trigger dispatch if any tasks are ready
            if (queuedInDb.isNotEmpty() || tasksReenqueued > 0) {
                logger.info("Triggering dispatch for recovered tasks")
                taskDispatcherService.triggerDispatch()
            }
        } catch (e: Exception) {
            logger.error("Task recovery failed: {}", e.message, e)
        }
    }
}
