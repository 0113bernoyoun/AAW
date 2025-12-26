package com.berno.aaw.service

import com.berno.aaw.entity.TaskStatus
import com.berno.aaw.repository.TaskRepository
import jakarta.annotation.PostConstruct
import jakarta.annotation.PreDestroy
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import java.time.Duration
import java.time.LocalDateTime
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

/**
 * Watchdog service that monitors tasks stuck in CANCELLING state.
 * Automatically escalates to KILLED status after timeout period.
 *
 * Phase 4.6: Task Termination Reliability - Critical Fix
 */
@Service
class TaskCancellationWatchdog(
    private val taskRepository: TaskRepository,
    private val taskService: TaskService
) {
    private val logger = LoggerFactory.getLogger(TaskCancellationWatchdog::class.java)
    private lateinit var scheduler: ScheduledExecutorService

    companion object {
        const val CANCELLING_TIMEOUT_SECONDS = 30L
        const val CHECK_INTERVAL_SECONDS = 5L
    }

    @PostConstruct
    fun start() {
        scheduler = Executors.newSingleThreadScheduledExecutor()
        scheduler.scheduleAtFixedRate(
            { checkStuckCancellingTasks() },
            CHECK_INTERVAL_SECONDS,
            CHECK_INTERVAL_SECONDS,
            TimeUnit.SECONDS
        )
        logger.info("TaskCancellationWatchdog started: checking every {}s, timeout {}s",
            CHECK_INTERVAL_SECONDS, CANCELLING_TIMEOUT_SECONDS)
    }

    @PreDestroy
    fun stop() {
        logger.info("TaskCancellationWatchdog stopping...")
        scheduler.shutdown()
        try {
            if (!scheduler.awaitTermination(5, TimeUnit.SECONDS)) {
                scheduler.shutdownNow()
            }
        } catch (e: InterruptedException) {
            scheduler.shutdownNow()
        }
    }

    private fun checkStuckCancellingTasks() {
        try {
            val stuckTasks = taskRepository.findByStatus(TaskStatus.CANCELLING)
                .filter { task ->
                    val cancelledAt = task.cancelledAt ?: return@filter false
                    val elapsedSeconds = Duration.between(cancelledAt, LocalDateTime.now()).seconds
                    elapsedSeconds > CANCELLING_TIMEOUT_SECONDS
                }

            if (stuckTasks.isNotEmpty()) {
                logger.warn("Found {} tasks stuck in CANCELLING state", stuckTasks.size)
            }

            stuckTasks.forEach { task ->
                val elapsedSeconds = Duration.between(task.cancelledAt, LocalDateTime.now()).seconds
                logger.warn("Task {} stuck in CANCELLING for {}s - escalating to KILLED", task.id, elapsedSeconds)

                try {
                    // Send SIGKILL to runner
                    taskService.sendCancelToRunner(task.id, force = true)

                    // Mark as KILLED
                    task.status = TaskStatus.KILLED
                    task.completedAt = LocalDateTime.now()
                    task.failureReason = "TIMEOUT_KILL"
                    val savedTask = taskRepository.save(task)

                    logger.info("Task {} marked as KILLED after timeout", task.id)

                    // Trigger next dispatch
                    taskService.getTaskDispatcherService()?.onTaskCompleted(
                        task.id,
                        success = false,
                        error = "Task was force-killed after ${elapsedSeconds}s timeout"
                    )

                } catch (e: Exception) {
                    logger.error("Failed to kill stuck task {}: {}", task.id, e.message)
                }
            }
        } catch (e: Exception) {
            logger.error("Error in watchdog check: {}", e.message, e)
        }
    }
}
