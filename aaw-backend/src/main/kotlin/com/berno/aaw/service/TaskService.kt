package com.berno.aaw.service

import com.berno.aaw.dto.LogChunkDTO
import com.berno.aaw.entity.ExecutionLog
import com.berno.aaw.entity.Task
import com.berno.aaw.entity.TaskStatus
import com.berno.aaw.entity.SessionMode
import com.berno.aaw.entity.ExecutionMode
import com.berno.aaw.event.TaskCreatedEvent
import com.berno.aaw.repository.ExecutionLogRepository
import com.berno.aaw.repository.TaskRepository
import com.fasterxml.jackson.databind.ObjectMapper
import org.slf4j.LoggerFactory
import org.springframework.context.ApplicationEventPublisher
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.socket.TextMessage
import org.springframework.web.socket.WebSocketSession
import reactor.core.publisher.Sinks
import java.time.LocalDateTime
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel

@Service
class TaskService(
    private val taskRepository: TaskRepository,
    private val executionLogRepository: ExecutionLogRepository,
    private val objectMapper: ObjectMapper,
    private val redisQueueService: RedisQueueService,
    private val applicationEventPublisher: ApplicationEventPublisher
) {
    private val logger = LoggerFactory.getLogger(TaskService::class.java)
    private val runnerSessions = ConcurrentHashMap<String, WebSocketSession>()

    // SSE sink for broadcasting to frontend
    val logSink: Sinks.Many<LogChunkDTO> = Sinks.many().multicast().onBackpressureBuffer()

    // Late-initialized TaskDispatcherService to avoid circular dependency
    private var taskDispatcherService: TaskDispatcherService? = null

    fun setTaskDispatcherService(dispatcher: TaskDispatcherService) {
        this.taskDispatcherService = dispatcher
    }

    fun getTaskDispatcherService(): TaskDispatcherService? {
        return taskDispatcherService
    }

    @Transactional
    fun createTask(instruction: String): Task {
        val task = Task(
            instruction = instruction,
            status = TaskStatus.PENDING
        )
        return taskRepository.save(task)
    }

    @Transactional
    fun createTask(
        instruction: String,
        scriptContent: String?,
        skipPermissions: Boolean = false,
        sessionMode: SessionMode = SessionMode.PERSIST
    ): Task {
        val task = Task(
            instruction = instruction,
            status = TaskStatus.PENDING,
            scriptContent = scriptContent,
            skipPermissions = skipPermissions,
            sessionMode = sessionMode
        )
        return taskRepository.save(task)
    }

    /**
     * Create task with execution mode support (Phase 4.2).
     * @param executionMode QUEUED for queue-based execution, DIRECT for immediate execution
     */
    @Transactional
    fun createTask(
        instruction: String,
        scriptContent: String?,
        skipPermissions: Boolean = false,
        sessionMode: SessionMode = SessionMode.PERSIST,
        executionMode: ExecutionMode = ExecutionMode.QUEUED,
        priority: Int = 0
    ): Task {
        val task = Task(
            instruction = instruction,
            status = if (executionMode == ExecutionMode.QUEUED) TaskStatus.QUEUED else TaskStatus.PENDING,
            scriptContent = scriptContent,
            skipPermissions = skipPermissions,
            sessionMode = sessionMode,
            executionMode = executionMode,
            priority = priority,
            queuedAt = if (executionMode == ExecutionMode.QUEUED) LocalDateTime.now() else null
        )

        val savedTask = taskRepository.save(task)

        // If QUEUED mode, enqueue to Redis
        if (executionMode == ExecutionMode.QUEUED) {
            redisQueueService.enqueue(savedTask.id, priority)

            logger.info("Task {} created and enqueued with priority {}", savedTask.id, priority)

            // Broadcast TASK_QUEUED event
            logSink.tryEmitNext(LogChunkDTO(
                type = "TASK_QUEUED",
                taskId = savedTask.id,
                line = "Task queued with priority $priority",
                status = TaskStatus.QUEUED.name,
                isError = false
            ))

            // Publish event to trigger dispatch AFTER transaction commits
            // This prevents the race condition where dispatcher reads DB before commit
            applicationEventPublisher.publishEvent(TaskCreatedEvent(this, savedTask.id, priority))
        } else {
            logger.info("Task {} created for direct execution", savedTask.id)
        }

        return savedTask
    }

    @Transactional
    fun updateStatus(taskId: Long, status: TaskStatus): Task {
        val task = taskRepository.findById(taskId)
            .orElseThrow { IllegalArgumentException("Task not found: $taskId") }

        task.status = status

        // Set cancelledAt timestamp for cancellation-related statuses
        if (status in listOf(TaskStatus.CANCELLING, TaskStatus.CANCELLED, TaskStatus.KILLED)) {
            task.cancelledAt = LocalDateTime.now()
        }

        val updatedTask = taskRepository.save(task)

        logger.info("Task {} status updated to {}", taskId, status)

        // Broadcast status update via SSE
        logSink.tryEmitNext(LogChunkDTO(
            type = "STATUS_UPDATE",
            taskId = taskId,
            line = null,
            status = status.name,
            isError = false
        ))

        return updatedTask
    }

    @Transactional
    fun saveLog(taskId: Long, logChunk: String, isError: Boolean) {
        val executionLog = ExecutionLog(
            taskId = taskId,
            logChunk = logChunk,
            isError = isError
        )
        executionLogRepository.save(executionLog)
    }

    fun registerRunnerSession(sessionId: String, session: WebSocketSession) {
        // Close all existing sessions before registering new one (single-runner strategy)
        runnerSessions.values.forEach { existingSession ->
            if (existingSession.isOpen) {
                try {
                    existingSession.close()
                    logger.info("Closed existing runner session to prevent duplicates")
                } catch (e: Exception) {
                    logger.warn("Failed to close existing session: {}", e.message)
                }
            }
        }
        runnerSessions.clear()

        // Register the new session
        runnerSessions[sessionId] = session
        logger.info("Runner session registered: {} (total active: {})", sessionId, runnerSessions.size)

        // Broadcast SYSTEM_READY event to all SSE clients
        logSink.tryEmitNext(LogChunkDTO(
            type = "SYSTEM_READY",
            taskId = 0,
            line = "System ready - Runner connected",
            status = null,
            isError = false
        ))
    }

    fun unregisterRunnerSession(sessionId: String) {
        runnerSessions.remove(sessionId)
        logger.info("Runner session unregistered: {}", sessionId)

        // Broadcast SYSTEM_DISCONNECTED event to all SSE clients
        logSink.tryEmitNext(LogChunkDTO(
            type = "SYSTEM_DISCONNECTED",
            taskId = 0,
            line = "Runner disconnected - system unavailable",
            status = null,
            isError = true
        ))
    }

    /**
     * Phase 4.5: Close all runner sessions for restart.
     */
    fun closeAllRunnerSessions(): Int {
        val sessionCount = runnerSessions.size
        
        runnerSessions.values.forEach { session ->
            try {
                session.close()
                logger.info("Closed runner session: {}", session.id)
            } catch (e: Exception) {
                logger.error("Error closing session {}: {}", session.id, e.message)
            }
        }
        
        runnerSessions.clear()
        logger.info("All runner sessions closed (count: {})", sessionCount)
        
        return sessionCount
    }

    fun sendToRunner(taskId: Long, script: String) {
        val message = mapOf(
            "type" to "EXECUTE",
            "taskId" to taskId,
            "script" to script
        )

        val jsonMessage = objectMapper.writeValueAsString(message)

        runnerSessions.values.forEach { session ->
            if (session.isOpen) {
                try {
                    session.sendMessage(TextMessage(jsonMessage))
                    logger.debug("Sent EXECUTE command to runner for task {}", taskId)
                } catch (e: Exception) {
                    logger.error("Failed to send message to runner: {}", e.message)
                }
            }
        }
    }

    fun sendDynamicToRunner(
        taskId: Long,
        scriptContent: String,
        skipPermissions: Boolean,
        sessionMode: String
    ) {
        val message = mapOf(
            "type" to "EXECUTE",
            "taskId" to taskId,
            "script" to "",  // Empty for backward compatibility
            "scriptContent" to scriptContent,
            "skipPermissions" to skipPermissions,
            "sessionMode" to sessionMode
        )

        val jsonMessage = objectMapper.writeValueAsString(message)

        runnerSessions.values.forEach { session ->
            if (session.isOpen) {
                try {
                    session.sendMessage(TextMessage(jsonMessage))
                    logger.debug("Sent dynamic EXECUTE command to runner for task {} (session: {}, skipPermissions: {})",
                        taskId, sessionMode, skipPermissions)
                } catch (e: Exception) {
                    logger.error("Failed to send message to runner: {}", e.message)
                }
            }
        }
    }

    fun broadcastLog(logChunk: LogChunkDTO) {
        logSink.tryEmitNext(logChunk)
    }

    /**
     * Send cancel command to runner via WebSocket.
     * @param taskId The ID of the task to cancel
     * @param force If true, sends KILL_TASK (SIGKILL), otherwise CANCEL_TASK (SIGTERM)
     */
    fun sendCancelToRunner(taskId: Long, force: Boolean) {
        val messageType = if (force) "KILL_TASK" else "CANCEL_TASK"
        val message = objectMapper.writeValueAsString(mapOf(
            "type" to messageType,
            "taskId" to taskId
        ))

        runnerSessions.values.forEach { session ->
            if (session.isOpen) {
                try {
                    session.sendMessage(TextMessage(message))
                    logger.info("Sent {} to runner for task {}", messageType, taskId)
                } catch (e: Exception) {
                    logger.error("Failed to send {} to runner: {}", messageType, e.message)
                }
            }
        }
    }

    fun getTask(taskId: Long): Task {
        return taskRepository.findById(taskId)
            .orElseThrow { IllegalArgumentException("Task not found: $taskId") }
    }

    fun getTaskLogs(taskId: Long): List<ExecutionLog> {
        return executionLogRepository.findByTaskIdOrderByCreatedAtAsc(taskId)
    }

    /**
     * Phase 4: Check if any runner session is currently connected.
     */
    fun hasActiveRunnerSession(): Boolean {
        return runnerSessions.values.any { it.isOpen }
    }

    /**
     * Phase 4: Get running tasks for system state snapshot.
     */
    fun getRunningTasks(): List<Task> {
        return taskRepository.findByStatus(TaskStatus.RUNNING)
    }

    /**
     * Phase 4: Get queued tasks count for system state.
     */
    fun getQueuedTaskCount(): Int {
        return taskRepository.findByStatus(TaskStatus.QUEUED).size
    }

    // Phase 2.2: Task termination ACK channels for safe deletion
    private val terminationAckChannels = ConcurrentHashMap<Long, Channel<Unit>>()

    /**
     * Phase 2.2: Safe delete task with runner ACK protocol.
     * Prevents zombie processes by waiting for runner to confirm termination.
     *
     * Flow:
     * 1. RUNNING tasks → Send KILL_TASK → Wait for ACK (30s timeout) → Soft delete
     * 2. QUEUED tasks → Remove from Redis queue → Soft delete
     * 3. Terminal states → Soft delete immediately
     *
     * @param id Task ID to delete
     */
    suspend fun safeDeleteTask(id: Long) = withContext(Dispatchers.IO) {
        val task = taskRepository.findById(id).orElseThrow {
            IllegalArgumentException("Task not found: $id")
        }

        logger.info("Safe delete requested for task [{}] (status: {})", id, task.status)

        when (task.status) {
            TaskStatus.RUNNING, TaskStatus.INTERRUPTED -> {
                // Send KILL_TASK signal
                logger.info("Task [{}] is running/interrupted, sending KILL_TASK signal", id)
                sendCancelToRunner(id, force = true)

                // Update to TERMINATING status
                task.status = TaskStatus.TERMINATING
                taskRepository.save(task)

                // Wait for ACK with 30s timeout
                try {
                    withTimeout(30_000) {
                        awaitTerminationAck(id)
                    }
                    logger.info("Received TASK_TERMINATED ACK for task [{}]", id)
                } catch (e: TimeoutCancellationException) {
                    logger.warn("Timeout waiting for TASK_TERMINATED ACK for task [{}], soft-deleting anyway", id)
                }

                // Soft delete
                task.isArchived = true
                task.deletedAt = LocalDateTime.now()
                taskRepository.save(task)
                logger.info("Task [{}] soft-deleted after termination", id)
            }

            TaskStatus.QUEUED -> {
                // Remove from Redis queue
                logger.info("Task [{}] is queued, removing from Redis queue", id)
                redisQueueService.remove(id)

                // Soft delete
                task.isArchived = true
                task.deletedAt = LocalDateTime.now()
                taskRepository.save(task)
                logger.info("Task [{}] soft-deleted from queue", id)
            }

            else -> {
                // Terminal states - soft delete immediately
                logger.info("Task [{}] in terminal state, soft-deleting immediately", id)
                task.isArchived = true
                task.deletedAt = LocalDateTime.now()
                taskRepository.save(task)
            }
        }
    }

    /**
     * Phase 2.2: Wait for task termination ACK from runner.
     * Creates a channel and suspends until ACK is received.
     */
    private suspend fun awaitTerminationAck(taskId: Long) {
        val channel = Channel<Unit>()
        terminationAckChannels[taskId] = channel
        try {
            channel.receive()
        } finally {
            terminationAckChannels.remove(taskId)
        }
    }

    /**
     * Phase 2.2: Handle TASK_TERMINATED ACK from runner.
     * Called by WebSocket handler when runner confirms termination.
     */
    fun handleTaskTerminatedAck(taskId: Long) {
        logger.info("Received TASK_TERMINATED ACK for task [{}]", taskId)
        terminationAckChannels[taskId]?.trySend(Unit)
    }
}
