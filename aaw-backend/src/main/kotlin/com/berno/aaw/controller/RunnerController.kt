package com.berno.aaw.controller

import com.berno.aaw.dto.RunningTaskDTO
import com.berno.aaw.dto.SystemStateDTO
import com.berno.aaw.service.TaskService
import org.slf4j.LoggerFactory
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

/**
 * Phase 4.5: Runner management endpoints for recovery operations.
 */
@RestController
@RequestMapping("/api/runner")
@CrossOrigin(origins = ["http://localhost:3000"])
class RunnerController(
    private val taskService: TaskService
) {
    private val logger = LoggerFactory.getLogger(RunnerController::class.java)

    /**
     * Restart runner session.
     * Closes all active runner WebSocket sessions, forcing reconnect.
     */
    @PostMapping("/restart")
    fun restartRunner(): ResponseEntity<Map<String, String>> {
        logger.info("Received request to restart runner session")

        // Close all runner sessions
        val sessionCount = taskService.closeAllRunnerSessions()

        logger.info("Closed {} runner session(s), forcing reconnect", sessionCount)

        return ResponseEntity.ok(mapOf(
            "message" to "Runner restart initiated",
            "closedSessions" to sessionCount.toString()
        ))
    }

    /**
     * Phase 4: Get comprehensive system state for frontend re-attachment.
     * Returns runner connection status, running tasks, and queue info.
     */
    @GetMapping("/status")
    fun getRunnerStatus(): ResponseEntity<SystemStateDTO> {
        val dispatcher = taskService.getTaskDispatcherService()

        val isRunnerConnected = taskService.hasActiveRunnerSession()
        val runnerStatus = dispatcher?.getRunnerStatus()?.toString() ?: "IDLE"
        val isRateLimited = dispatcher?.isRateLimited() ?: false

        // Get running tasks for snapshot
        val runningTasks = taskService.getRunningTasks().map { task ->
            RunningTaskDTO(
                id = task.id,
                instruction = task.instruction.take(100), // Limit instruction length
                status = task.status.name,
                startedAt = task.startedAt
            )
        }

        // Get queued task count
        val queuedTaskCount = taskService.getQueuedTaskCount()

        val systemState = SystemStateDTO(
            isRunnerConnected = isRunnerConnected,
            isRateLimited = isRateLimited,
            runnerStatus = runnerStatus,
            runningTasks = runningTasks,
            queuedTaskCount = queuedTaskCount
        )

        logger.debug("Returning system state: connected={}, status={}, running={}, queued={}",
            isRunnerConnected, runnerStatus, runningTasks.size, queuedTaskCount)

        return ResponseEntity.ok(systemState)
    }
}
