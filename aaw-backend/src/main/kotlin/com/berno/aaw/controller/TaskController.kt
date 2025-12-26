package com.berno.aaw.controller

import com.berno.aaw.dto.ExecutionLogDTO
import com.berno.aaw.dto.TaskDTO
import com.berno.aaw.dto.TaskStatusDTO
import com.berno.aaw.entity.TaskStatus
import com.berno.aaw.entity.SessionMode
import com.berno.aaw.entity.ExecutionMode
import com.berno.aaw.service.TaskService
import com.berno.aaw.service.RedisQueueService
import org.slf4j.LoggerFactory
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import java.time.LocalDateTime

@RestController
@RequestMapping("/api/tasks")
@CrossOrigin(origins = ["http://localhost:3000"])
class TaskController(
    private val taskService: TaskService,
    private val redisQueueService: RedisQueueService,
    private val taskRepository: com.berno.aaw.repository.TaskRepository
) {
    private val logger = LoggerFactory.getLogger(TaskController::class.java)

    @PostMapping("/start-dummy")
    fun startDummyTask(): ResponseEntity<TaskDTO> {
        logger.info("Received request to start dummy task")

        // Create task
        val task = taskService.createTask("run dummy_task.sh")

        // Update status to RUNNING
        val runningTask = taskService.updateStatus(task.id, TaskStatus.RUNNING)

        // Send execution command to runner
        taskService.sendToRunner(task.id, "scripts/dummy_task.sh")

        logger.info("Dummy task {} created and sent to runner", task.id)

        return ResponseEntity.ok(TaskDTO.from(runningTask))
    }

    @GetMapping("/{id}")
    fun getTask(@PathVariable id: Long): ResponseEntity<TaskDTO> {
        val task = taskService.getTask(id)
        return ResponseEntity.ok(TaskDTO.from(task))
    }

    @GetMapping("/{id}/status")
    fun getTaskStatus(@PathVariable id: Long): ResponseEntity<TaskStatusDTO> {
        val task = taskService.getTask(id)
        return ResponseEntity.ok(TaskStatusDTO(task.id, task.status))
    }

    /**
     * Get historical logs for a specific task.
     * Used by frontend to display logs when a task is selected.
     */
    @GetMapping("/{taskId}/logs")
    fun getTaskLogs(@PathVariable taskId: Long): ResponseEntity<List<ExecutionLogDTO>> {
        logger.debug("Fetching logs for task {}", taskId)

        val logs = taskService.getTaskLogs(taskId)
        val logDTOs = logs.map { ExecutionLogDTO.from(it) }

        logger.debug("Returning {} log entries for task {}", logDTOs.size, taskId)
        return ResponseEntity.ok(logDTOs)
    }

    @PostMapping("/create-dynamic")
    fun createDynamicTask(@RequestBody request: CreateDynamicTaskRequest): ResponseEntity<TaskDTO> {
        logger.info("Received request to create dynamic task (session: {}, skipPermissions: {})",
            request.sessionMode, request.skipPermissions)

        // Create task with script content
        val task = taskService.createTask(
            instruction = request.instruction,
            scriptContent = request.scriptContent,
            skipPermissions = request.skipPermissions,
            sessionMode = SessionMode.valueOf(request.sessionMode)
        )

        // Update status to RUNNING
        val runningTask = taskService.updateStatus(task.id, TaskStatus.RUNNING)

        // Send dynamic execution command to runner
        taskService.sendDynamicToRunner(
            taskId = task.id,
            scriptContent = request.scriptContent,
            skipPermissions = request.skipPermissions,
            sessionMode = request.sessionMode
        )

        logger.info("Dynamic task {} created and sent to runner", task.id)

        return ResponseEntity.ok(TaskDTO.from(runningTask))
    }

    /**
     * Phase 4.2: Create task with priority and execution mode support.
     */
    @PostMapping("/create-with-priority")
    fun createTaskWithPriority(@RequestBody request: CreateTaskWithPriorityRequest): ResponseEntity<TaskDTO> {
        logger.info("Received request to create task with priority {} and execution mode {}",
            request.priority, request.executionMode)

        val task = taskService.createTask(
            instruction = request.instruction,
            scriptContent = request.scriptContent,
            skipPermissions = request.skipPermissions,
            sessionMode = SessionMode.valueOf(request.sessionMode),
            executionMode = ExecutionMode.valueOf(request.executionMode),
            priority = request.priority
        )

        val queuePosition = if (task.executionMode == ExecutionMode.QUEUED) {
            redisQueueService.getPosition(task.id)?.toInt()
        } else {
            null
        }

        logger.info("Task {} created with execution mode {} and priority {}",
            task.id, task.executionMode, task.priority)

        return ResponseEntity.ok(TaskDTO.from(task, queuePosition))
    }

    /**
     * Phase 4.2: List all tasks with queue positions.
     */
    @GetMapping("/list")
    fun listTasks(): ResponseEntity<List<TaskDTO>> {
        val tasks = taskRepository.findAllByOrderByPriorityAscCreatedAtAsc()

        val taskDTOs = tasks.map { task ->
            val queuePosition = if (task.status == TaskStatus.QUEUED) {
                redisQueueService.getPosition(task.id)?.toInt()
            } else {
                null
            }
            TaskDTO.from(task, queuePosition)
        }

        return ResponseEntity.ok(taskDTOs)
    }

    /**
     * Phase 4.2: Cancel task and remove from queue if queued.
     * For queued tasks, removes from queue immediately.
     * For running tasks, sends SIGTERM and waits for graceful shutdown.
     */
    @PostMapping("/{id}/cancel")
    fun cancelTask(@PathVariable id: Long): ResponseEntity<TaskDTO> {
        logger.info("Received request to cancel task {}", id)

        val task = taskService.getTask(id)

        return when (task.status) {
            TaskStatus.QUEUED -> {
                // Remove from Redis queue
                val removed = redisQueueService.remove(id)
                logger.info("Task {} removed from queue: {}", id, removed)

                // Update task status to CANCELLED
                val cancelledTask = taskService.updateStatus(id, TaskStatus.CANCELLED)
                cancelledTask.failureReason = "CANCELLED"
                taskRepository.save(cancelledTask)

                logger.info("Queued task {} cancelled", id)
                ResponseEntity.ok(TaskDTO.from(cancelledTask))
            }
            TaskStatus.RUNNING -> {
                // Update status to CANCELLING (waiting for graceful shutdown)
                val cancellingTask = taskService.updateStatus(id, TaskStatus.CANCELLING)

                // Send SIGTERM to runner
                taskService.sendCancelToRunner(id, force = false)

                logger.info("Running task {} cancellation initiated (SIGTERM sent)", id)
                ResponseEntity.ok(TaskDTO.from(cancellingTask))
            }
            else -> {
                logger.warn("Cannot cancel task {} with status {}", id, task.status)
                ResponseEntity.badRequest().build()
            }
        }
    }

    /**
     * Force kill a task immediately (SIGKILL).
     * Only allowed for RUNNING or CANCELLING tasks.
     */
    @PostMapping("/{id}/force-kill")
    fun forceKillTask(@PathVariable id: Long): ResponseEntity<TaskDTO> {
        logger.info("Received request to force-kill task {}", id)

        val task = taskService.getTask(id)

        // Allow force-kill for RUNNING or CANCELLING tasks
        if (task.status !in listOf(TaskStatus.RUNNING, TaskStatus.CANCELLING)) {
            logger.warn("Cannot force-kill task {} with status {}", id, task.status)
            return ResponseEntity.badRequest().build()
        }

        // Send SIGKILL to runner
        taskService.sendCancelToRunner(id, force = true)

        // ✅ FIX: Update status immediately to provide frontend feedback
        val killedTask = taskService.updateStatus(id, TaskStatus.KILLED)
        killedTask.completedAt = LocalDateTime.now()
        killedTask.failureReason = "FORCE_KILLED"
        val savedTask = taskRepository.save(killedTask)

        logger.info("Task {} marked as KILLED after force-kill request", id)

        return ResponseEntity.ok(TaskDTO.from(savedTask))
    }

    /**
     * Phase 4.5: Retry interrupted task.
     * Re-queues the task with incremented retry count.
     */
    @PostMapping("/{id}/retry")
    fun retryTask(@PathVariable id: Long): ResponseEntity<TaskDTO> {
        logger.info("Received request to retry task {}", id)

        val task = taskService.getTask(id)

        // Only allow retry for INTERRUPTED or FAILED tasks
        if (task.status != TaskStatus.INTERRUPTED && task.status != TaskStatus.FAILED) {
            logger.warn("Cannot retry task {} with status {}", id, task.status)
            return ResponseEntity.badRequest().build()
        }

        // Increment retry count
        task.retryCount = task.retryCount + 1
        task.status = TaskStatus.QUEUED
        task.queuedAt = java.time.LocalDateTime.now()
        task.startedAt = null
        task.completedAt = null

        val savedTask = taskRepository.save(task)

        // Re-enqueue with same priority
        val enqueued = redisQueueService.enqueue(savedTask.id, savedTask.priority)
        
        if (!enqueued) {
            logger.error("Failed to re-enqueue task {}", id)
            return ResponseEntity.internalServerError().build()
        }

        val queuePosition = redisQueueService.getPosition(savedTask.id)?.toInt()

        logger.info("Task {} re-queued for retry (attempt #{})", id, task.retryCount)

        return ResponseEntity.ok(TaskDTO.from(savedTask, queuePosition))
    }

    /**
     * Phase 4.5: Skip interrupted task.
     * Marks task as FAILED and triggers next dispatch.
     */
    @PostMapping("/{id}/skip")
    fun skipTask(@PathVariable id: Long): ResponseEntity<TaskDTO> {
        logger.info("Received request to skip task {}", id)

        val task = taskService.getTask(id)

        // Only allow skip for INTERRUPTED tasks
        if (task.status != TaskStatus.INTERRUPTED) {
            logger.warn("Cannot skip task {} with status {}", id, task.status)
            return ResponseEntity.badRequest().build()
        }

        // Mark as FAILED
        task.status = TaskStatus.FAILED
        task.completedAt = java.time.LocalDateTime.now()
        if (task.failureReason == null) {
            task.failureReason = "SKIPPED"
        }

        val savedTask = taskRepository.save(task)

        logger.info("Task {} marked as FAILED (skipped)", id)

        // Trigger next dispatch
        taskService.getTaskDispatcherService()?.triggerDispatch()

        return ResponseEntity.ok(TaskDTO.from(savedTask))
    }

    /**
     * Bulk cleanup endpoint for completed/failed/interrupted tasks.
     * Marks specified tasks as CANCELLED for UI cleanup.
     * If taskIds is empty or null, cleans all filterable tasks.
     */
    @PostMapping("/bulk-cleanup")
    fun bulkCleanup(@RequestBody(required = false) request: BulkCleanupRequest?): ResponseEntity<BulkCleanupResponse> {
        logger.info("Received bulk cleanup request for {} tasks",
            request?.taskIds?.size ?: "ALL")

        // Find all tasks with filterable statuses
        val cleanableStatuses = listOf(
            TaskStatus.COMPLETED,
            TaskStatus.FAILED,
            TaskStatus.INTERRUPTED,
            TaskStatus.PENDING
        )

        val tasksToClean = if (request?.taskIds != null && request.taskIds.isNotEmpty()) {
            // Find specific tasks by IDs and verify cleanable
            taskRepository.findAllById(request.taskIds)
                .filter { it.status in cleanableStatuses }
        } else {
            // Clean all filterable tasks (legacy behavior)
            taskRepository.findAll()
                .filter { it.status in cleanableStatuses }
        }

        logger.info("Found {} cleanable tasks out of {} requested",
            tasksToClean.size, request?.taskIds?.size ?: "ALL")

        // Update all to CANCELLED status
        val cleanedTasks = tasksToClean.map { task ->
            task.status = TaskStatus.CANCELLED
            task.completedAt = task.completedAt ?: java.time.LocalDateTime.now()
            taskRepository.save(task)
        }

        logger.info("Bulk cleanup completed: {} tasks marked as CANCELLED", cleanedTasks.size)

        return ResponseEntity.ok(BulkCleanupResponse(
            cleanedCount = cleanedTasks.size,
            completedCount = cleanedTasks.count { it.failureReason == null },
            failedCount = cleanedTasks.count { it.failureReason != null }
        ))
    }

    /**
     * Manual deletion endpoint - permanently removes task with hard delete.
     * Bypasses 24-hour retention rule.
     * Terminates running tasks before deletion if Runner available.
     *
     * @param id Task ID to delete
     * @return ResponseEntity with deletion status
     */
    @DeleteMapping("/{id}")
    fun deleteTask(@PathVariable id: Long): ResponseEntity<Map<String, Any>> {
        val task = taskRepository.findById(id).orElse(null)
            ?: return ResponseEntity.notFound().build()

        logger.info("Manual deletion requested for task [{}] (status: {})", task.id, task.status)

        // If task is running or interrupted, attempt termination
        if (task.status in listOf(TaskStatus.RUNNING, TaskStatus.INTERRUPTED)) {
            logger.info("Task [{}] is active, attempting termination", task.id)

            try {
                taskService.sendCancelToRunner(task.id, force = false)
                // Wait briefly for termination acknowledgment
                Thread.sleep(2000)
                logger.info("Termination signal sent for task [{}]", task.id)
            } catch (e: Exception) {
                logger.warn("Failed to terminate task [{}] gracefully: {}", task.id, e.message)
                // Continue with deletion - Runner will clean up on next sync
            }
        }

        // Hard delete from database
        try {
            taskRepository.delete(task)
            logger.info("Task [{}] permanently deleted", task.id)

            // Broadcast deletion event (triggers toast notification)
            broadcastTaskDeletion(task.id)

            return ResponseEntity.ok(mapOf(
                "status" to "deleted",
                "taskId" to task.id,
                "reason" to "manual"
            ))
        } catch (e: Exception) {
            logger.error("Failed to delete task [{}]", task.id, e)
            return ResponseEntity.status(500).body(mapOf(
                "error" to "Deletion failed",
                "message" to (e.message ?: "Unknown error")
            ))
        }
    }

    /**
     * Broadcasts TASK_DELETED SSE event to all connected frontend clients.
     * Frontend removes task from UI and shows toast notification.
     */
    private fun broadcastTaskDeletion(taskId: Long) {
        val event = com.berno.aaw.dto.LogChunkDTO(
            type = "TASK_DELETED",
            taskId = taskId,
            line = null,
            status = null,
            isError = false
        )
        taskService.broadcastLog(event)
    }
}

data class CreateDynamicTaskRequest(
    val instruction: String,
    val scriptContent: String,
    val skipPermissions: Boolean = false,
    val sessionMode: String = "PERSIST"
)

data class CreateTaskWithPriorityRequest(
    val instruction: String,
    val scriptContent: String,
    val skipPermissions: Boolean = false,
    val sessionMode: String = "PERSIST",
    val executionMode: String = "QUEUED",
    val priority: Int = 0
)

data class BulkCleanupRequest(
    val taskIds: List<Long>?
)

data class BulkCleanupResponse(
    val cleanedCount: Int,
    val completedCount: Int,
    val failedCount: Int
)
