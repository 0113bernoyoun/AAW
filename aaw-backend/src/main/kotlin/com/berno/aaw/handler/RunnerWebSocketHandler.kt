package com.berno.aaw.handler

import com.berno.aaw.dto.LogChunkDTO
import com.berno.aaw.entity.TaskStatus
import com.berno.aaw.service.TaskService
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import org.springframework.web.socket.CloseStatus
import org.springframework.web.socket.TextMessage
import org.springframework.web.socket.WebSocketSession
import org.springframework.web.socket.handler.TextWebSocketHandler

@Component
class RunnerWebSocketHandler(
    private val taskService: TaskService,
    private val taskRepository: com.berno.aaw.repository.TaskRepository,
    private val objectMapper: ObjectMapper
) : TextWebSocketHandler() {

    private val logger = LoggerFactory.getLogger(RunnerWebSocketHandler::class.java)

    // Late-initialized to avoid circular dependency
    private var taskDispatcherService: com.berno.aaw.service.TaskDispatcherService? = null

    fun setTaskDispatcherService(dispatcher: com.berno.aaw.service.TaskDispatcherService) {
        this.taskDispatcherService = dispatcher
    }

    override fun afterConnectionEstablished(session: WebSocketSession) {
        logger.info("WebSocket connection established: {}", session.id)
    }

    override fun handleTextMessage(session: WebSocketSession, message: TextMessage) {
        try {
            val payload = message.payload
            val jsonNode: JsonNode = objectMapper.readTree(payload)
            val type = jsonNode.get("type")?.asText()

            when (type) {
                "HELO" -> handleHelo(session, jsonNode)
                "LOG" -> handleLog(jsonNode)
                "STATUS_UPDATE" -> handleStatusUpdate(jsonNode)
                "RUNNER_STATUS" -> handleRunnerStatus(jsonNode)
                "RUNNER_CAPACITY" -> handleRunnerCapacity(jsonNode)
                "TASK_COMPLETED" -> handleTaskCompleted(jsonNode)
                "CANCEL_ACK" -> handleCancelAck(jsonNode)
                "TASK_TERMINATED" -> handleTaskTerminated(jsonNode)
                else -> logger.warn("Unknown message type: {}", type)
            }
        } catch (e: Exception) {
            logger.error("Error handling message: {}", e.message, e)
        }
    }

    private fun handleHelo(session: WebSocketSession, jsonNode: JsonNode) {
        val hostname = jsonNode.get("hostname")?.asText() ?: "unknown"
        val workdir = jsonNode.get("workdir")?.asText() ?: "unknown"

        taskService.registerRunnerSession(session.id, session)
        logger.info("Runner [{}] connected (hostname: {}, workdir: {})", session.id, hostname, workdir)

        // Broadcast runner connection to frontend
        taskService.broadcastLog(LogChunkDTO(
            type = "SYSTEM",
            taskId = 0,
            line = "Runner [$hostname] connected from $workdir",
            status = null,
            isError = false
        ))
    }

    private fun handleLog(jsonNode: JsonNode) {
        val taskId = jsonNode.get("taskId")?.asLong() ?: return
        val line = jsonNode.get("line")?.asText() ?: return
        val isError = jsonNode.get("isError")?.asBoolean() ?: false

        // Save log to database
        taskService.saveLog(taskId, line, isError)

        // Broadcast log to frontend via SSE
        val logChunk = LogChunkDTO(
            type = "LOG",
            taskId = taskId,
            line = line,
            status = null,
            isError = isError
        )
        taskService.broadcastLog(logChunk)
    }

    private fun handleStatusUpdate(jsonNode: JsonNode) {
        val taskId = jsonNode.get("taskId")?.asLong() ?: return
        val statusStr = jsonNode.get("status")?.asText() ?: return

        try {
            val status = TaskStatus.valueOf(statusStr)

            // Update task status in database
            taskService.updateStatus(taskId, status)

            // Handle rate limit detection (Phase 4.2)
            if (status == TaskStatus.RATE_LIMITED) {
                logger.warn("Rate limit detected. Pausing dispatcher for Task [{}]...", taskId)
                taskDispatcherService?.setRateLimited(true)
            }
        } catch (e: IllegalArgumentException) {
            logger.error("Invalid status: {}", statusStr)
        }
    }

    /**
     * Phase 4.2: Handle RUNNER_STATUS messages for dispatcher coordination.
     */
    private fun handleRunnerStatus(jsonNode: JsonNode) {
        val status = jsonNode.get("status")?.asText() ?: return
        logger.debug("Received RUNNER_STATUS: {}", status)

        taskDispatcherService?.onRunnerStatusUpdate(status)
    }

    /**
     * Phase 5: Handle RUNNER_CAPACITY messages for multi-slot dispatch.
     * Triggers dispatch when slots become available.
     */
    private fun handleRunnerCapacity(jsonNode: JsonNode) {
        val maxParallel = jsonNode.get("maxParallel")?.asInt() ?: return
        val runningTasks = jsonNode.get("runningTasks")?.asInt() ?: return
        val availableSlots = jsonNode.get("availableSlots")?.asInt() ?: return

        logger.debug("Received RUNNER_CAPACITY: max={}, running={}, available={}",
            maxParallel, runningTasks, availableSlots)

        // Update dispatcher with new capacity and trigger dispatch
        taskDispatcherService?.onRunnerCapacityUpdate(maxParallel, runningTasks, availableSlots)
    }

    /**
     * Phase 4.2: Handle TASK_COMPLETED messages from Runner.
     */
    private fun handleTaskCompleted(jsonNode: JsonNode) {
        val taskId = jsonNode.get("taskId")?.asLong() ?: return
        val success = jsonNode.get("success")?.asBoolean() ?: false
        val error = jsonNode.get("error")?.asText()

        logger.info("Received TASK_COMPLETED: taskId={}, success={}, error={}", taskId, success, error)

        taskDispatcherService?.onTaskCompleted(taskId, success, error)
    }

    /**
     * Handle CANCEL_ACK messages from Runner.
     * Updates task status based on cancellation result.
     */
    private fun handleCancelAck(jsonNode: JsonNode) {
        val taskId = jsonNode.get("taskId")?.asLong() ?: return
        val status = jsonNode.get("status")?.asText() ?: return
        val success = jsonNode.get("success")?.asBoolean() ?: false
        val error = jsonNode.get("error")?.asText()

        logger.info("Received CANCEL_ACK for task {}: status={}, success={}, error={}",
            taskId, status, success, error)

        if (success) {
            // Update task status based on cancel type
            val newStatus = when (status) {
                "CANCELLED" -> TaskStatus.CANCELLED
                "KILLED" -> TaskStatus.KILLED
                else -> TaskStatus.FAILED
            }

            taskService.updateStatus(taskId, newStatus)

            // Broadcast status update
            taskService.broadcastLog(LogChunkDTO(
                type = "STATUS_UPDATE",
                taskId = taskId,
                line = "Task $status successfully",
                status = newStatus.name,
                isError = false
            ))

            // Trigger next task dispatch
            taskDispatcherService?.onTaskCompleted(taskId, success = false, error = "Task was cancelled")
        } else {
            logger.error("Failed to cancel task {}: {}", taskId, error)

            // ✅ FIX: Mark task as FAILED and persist to database
            val task = taskService.getTask(taskId)
            task.status = TaskStatus.FAILED
            task.completedAt = java.time.LocalDateTime.now()
            task.failureReason = "CANCEL_FAILED: $error"
            taskRepository.save(task)

            // Broadcast failure
            taskService.broadcastLog(LogChunkDTO(
                type = "CANCEL_FAILED",
                taskId = taskId,
                line = "Failed to cancel task: $error",
                status = TaskStatus.FAILED.name,
                isError = true
            ))

            // ✅ FIX: Still trigger next dispatch even on failure
            taskDispatcherService?.onTaskCompleted(taskId, success = false, error = error ?: "Cancellation failed")
        }
    }

    /**
     * Phase 2.2: Handle TASK_TERMINATED ACK from Runner.
     * Signals completion of process termination for safe deletion protocol.
     * Backend waits for this ACK before soft-deleting task record to prevent zombie processes.
     */
    private fun handleTaskTerminated(jsonNode: JsonNode) {
        val taskId = jsonNode.get("taskId")?.asLong() ?: return
        val success = jsonNode.get("success")?.asBoolean() ?: false
        val error = jsonNode.get("error")?.asText()

        logger.info("Received TASK_TERMINATED ACK for task {}: success={}, error={}",
            taskId, success, error)

        // Notify TaskService that termination ACK was received
        // This unblocks the safeDeleteTask() coroutine waiting for ACK
        taskService.handleTaskTerminatedAck(taskId)

        if (!success) {
            logger.warn("Task {} termination reported failure: {}", taskId, error)
        }
    }

    override fun afterConnectionClosed(session: WebSocketSession, status: CloseStatus) {
        taskService.unregisterRunnerSession(session.id)
        taskDispatcherService?.onRunnerDisconnected()
        logger.info("WebSocket connection closed: {} ({})", session.id, status)
    }

    override fun handleTransportError(session: WebSocketSession, exception: Throwable) {
        logger.error("WebSocket transport error for session {}: {}", session.id, exception.message)
    }
}
