package com.berno.aaw.controller

import com.berno.aaw.dto.LogChunkDTO
import com.berno.aaw.entity.TaskStatus
import com.berno.aaw.service.TaskService
import org.slf4j.LoggerFactory
import org.springframework.http.MediaType
import org.springframework.http.codec.ServerSentEvent
import org.springframework.web.bind.annotation.CrossOrigin
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import reactor.core.publisher.Flux

@RestController
@RequestMapping("/api/logs")
@CrossOrigin(origins = ["http://localhost:3000"])
class LogStreamController(
    private val taskService: TaskService
) {
    private val logger = LoggerFactory.getLogger(LogStreamController::class.java)

    /**
     * Stream log events via Server-Sent Events.
     *
     * Phase 4 Enhancement: Sends initial state snapshot on connect, then live stream.
     * This allows frontend to re-attach to running tasks after refresh.
     *
     * @param taskId Optional filter to receive only events for a specific task.
     *               If null, all events are streamed.
     *               System events (SYSTEM_READY, DISPATCHER_PAUSED, etc.) are always included.
     *
     * @return Flux of ServerSentEvents containing LogChunkDTO
     *
     * Examples:
     * - GET /api/logs/stream - Stream all events
     * - GET /api/logs/stream?taskId=5 - Stream only events for task 5 + system events
     */
    @GetMapping("/stream", produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
    fun streamLogs(
        @RequestParam(required = false) taskId: Long?
    ): Flux<ServerSentEvent<LogChunkDTO>> {
        if (taskId != null) {
            logger.info("SSE client connected with taskId filter: {}", taskId)
        } else {
            logger.info("SSE client connected without filter (receiving all events)")
        }

        // Build initial state snapshot
        val snapshot = buildStateSnapshot()

        // Define system event types that should always be sent
        val systemEventTypes = setOf(
            "SYSTEM_READY",
            "SYSTEM_DISCONNECTED",
            "DISPATCHER_PAUSED",
            "DISPATCHER_RESUMED"
        )

        // Live stream with filtering
        val liveStream = taskService.logSink.asFlux()
            .filter { logChunk ->
                // Always include system-level events
                if (logChunk.type in systemEventTypes) {
                    return@filter true
                }

                // If no taskId filter specified, include all events
                if (taskId == null) {
                    return@filter true
                }

                // Filter by taskId (0 means system event)
                logChunk.taskId == taskId || logChunk.taskId == 0L
            }

        // Concatenate snapshot + live stream
        return Flux.concat(
            Flux.fromIterable(snapshot),
            liveStream
        )
            .map { logChunk ->
                ServerSentEvent.builder(logChunk)
                    .event("log-event")
                    .build()
            }
            .onBackpressureBuffer()
    }

    /**
     * Phase 4: Build initial state snapshot for new SSE connections.
     * Includes system ready status, running tasks, and dispatcher state.
     */
    private fun buildStateSnapshot(): List<LogChunkDTO> {
        val snapshot = mutableListOf<LogChunkDTO>()
        val dispatcher = taskService.getTaskDispatcherService()

        // 1. System ready status (if runner connected)
        if (taskService.hasActiveRunnerSession()) {
            snapshot.add(LogChunkDTO(
                type = "SYSTEM_READY",
                taskId = 0,
                line = "System ready - Runner connected (snapshot)",
                status = null,
                isError = false
            ))
        } else {
            snapshot.add(LogChunkDTO(
                type = "SYSTEM_DISCONNECTED",
                taskId = 0,
                line = "Runner not connected (snapshot)",
                status = null,
                isError = true
            ))
        }

        // 2. Dispatcher rate limit status
        if (dispatcher?.isRateLimited() == true) {
            snapshot.add(LogChunkDTO(
                type = "DISPATCHER_PAUSED",
                taskId = 0,
                line = "Dispatcher paused due to rate limit (snapshot)",
                status = null,
                isError = true
            ))
        }

        // 3. Running task status
        val runningTasks = taskService.getRunningTasks()
        runningTasks.forEach { task ->
            snapshot.add(LogChunkDTO(
                type = "TASK_RUNNING",
                taskId = task.id,
                line = "Task ${task.id} is currently running (snapshot)",
                status = TaskStatus.RUNNING.name,
                isError = false
            ))
        }

        logger.info("Built state snapshot: {} events (runner={}, rateLimited={}, running={})",
            snapshot.size,
            taskService.hasActiveRunnerSession(),
            dispatcher?.isRateLimited() ?: false,
            runningTasks.size)

        return snapshot
    }
}
