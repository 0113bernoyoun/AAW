package com.berno.aaw.service

import com.berno.aaw.dto.LogChunkDTO
import com.berno.aaw.entity.ExecutionLog
import com.berno.aaw.entity.Task
import com.berno.aaw.entity.TaskStatus
import com.berno.aaw.entity.SessionMode
import com.berno.aaw.repository.ExecutionLogRepository
import com.berno.aaw.repository.TaskRepository
import com.fasterxml.jackson.databind.ObjectMapper
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.socket.TextMessage
import org.springframework.web.socket.WebSocketSession
import reactor.core.publisher.Sinks
import java.util.concurrent.ConcurrentHashMap

@Service
class TaskService(
    private val taskRepository: TaskRepository,
    private val executionLogRepository: ExecutionLogRepository,
    private val objectMapper: ObjectMapper
) {
    private val logger = LoggerFactory.getLogger(TaskService::class.java)
    private val runnerSessions = ConcurrentHashMap<String, WebSocketSession>()

    // SSE sink for broadcasting to frontend
    val logSink: Sinks.Many<LogChunkDTO> = Sinks.many().multicast().onBackpressureBuffer()

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

    @Transactional
    fun updateStatus(taskId: Long, status: TaskStatus): Task {
        val task = taskRepository.findById(taskId)
            .orElseThrow { IllegalArgumentException("Task not found: $taskId") }

        task.status = status
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

    fun getTask(taskId: Long): Task {
        return taskRepository.findById(taskId)
            .orElseThrow { IllegalArgumentException("Task not found: $taskId") }
    }

    fun getTaskLogs(taskId: Long): List<ExecutionLog> {
        return executionLogRepository.findByTaskIdOrderByCreatedAtAsc(taskId)
    }
}
