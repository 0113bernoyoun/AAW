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
    private val objectMapper: ObjectMapper
) : TextWebSocketHandler() {

    private val logger = LoggerFactory.getLogger(RunnerWebSocketHandler::class.java)

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

            // Log warning for rate limit detection
            if (status == TaskStatus.RATE_LIMITED) {
                logger.warn("Rate limit detected. Pausing Task [{}]...", taskId)
            }
        } catch (e: IllegalArgumentException) {
            logger.error("Invalid status: {}", statusStr)
        }
    }

    override fun afterConnectionClosed(session: WebSocketSession, status: CloseStatus) {
        taskService.unregisterRunnerSession(session.id)
        logger.info("WebSocket connection closed: {} ({})", session.id, status)
    }

    override fun handleTransportError(session: WebSocketSession, exception: Throwable) {
        logger.error("WebSocket transport error for session {}: {}", session.id, exception.message)
    }
}
