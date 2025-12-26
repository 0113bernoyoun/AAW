package com.berno.aaw.service

import com.berno.aaw.dto.LogChunkDTO
import com.berno.aaw.entity.TaskStatus
import com.berno.aaw.repository.TaskRepository
import kotlinx.coroutines.*
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import java.time.LocalDateTime
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

/**
 * Event-driven task dispatcher service with distributed locking.
 * Manages task execution queue and coordinates with Runner.
 * Phase 5: Supports multi-slot concurrent execution.
 */
@Service
class TaskDispatcherService(
    private val taskRepository: TaskRepository,
    private val redisQueueService: RedisQueueService,
    private val taskService: TaskService
) {
    private val logger = LoggerFactory.getLogger(TaskDispatcherService::class.java)

    private val dispatcherScope = CoroutineScope(Dispatchers.Default + SupervisorJob())

    // Runner status: IDLE or BUSY (legacy, kept for backward compatibility)
    private val runnerStatus = AtomicReference<RunnerStatus>(RunnerStatus.IDLE)

    // Rate limit flag
    private val isRateLimited = AtomicBoolean(false)

    // Dispatching in progress flag
    private val isDispatching = AtomicBoolean(false)

    // Phase 5: Runner capacity for multi-slot dispatch
    private val runnerMaxParallel = AtomicInteger(1)  // Default single-task
    private val runnerAvailableSlots = AtomicInteger(1)

    enum class RunnerStatus {
        IDLE,
        BUSY
    }

    /**
     * Trigger dispatch in non-blocking manner.
     * Can be called from event handlers safely.
     */
    fun triggerDispatch() {
        if (isDispatching.compareAndSet(false, true)) {
            dispatcherScope.launch {
                try {
                    dispatchNextTask()
                } finally {
                    isDispatching.set(false)
                }
            }
        } else {
            logger.debug("Dispatch already in progress, skipping trigger")
        }
    }

    /**
     * Core dispatch logic with distributed lock.
     * Phase 5: Dispatches multiple tasks based on available slots.
     */
    suspend fun dispatchNextTask() {
        // Check if rate limited
        if (isRateLimited.get()) {
            logger.debug("Dispatcher paused due to rate limit")
            return
        }

        // Phase 5: Check available slots instead of binary IDLE/BUSY
        val availableSlots = runnerAvailableSlots.get()
        if (availableSlots <= 0) {
            logger.debug("No available slots for dispatch (available: {})", availableSlots)
            return
        }

        // Acquire distributed lock
        if (!redisQueueService.acquireDispatcherLock()) {
            logger.debug("Could not acquire dispatcher lock, another instance is dispatching")
            return
        }

        try {
            // Phase 5: Dispatch multiple tasks based on available slots
            var dispatchedCount = 0
            for (i in 0 until availableSlots) {
                val taskId = redisQueueService.dequeue()
                if (taskId == null) {
                    logger.debug("Queue is empty after dispatching {} tasks", dispatchedCount)
                    break
                }

                // Dispatch single task
                if (dispatchSingleTask(taskId)) {
                    dispatchedCount++
                    runnerAvailableSlots.decrementAndGet()
                }
            }

            if (dispatchedCount > 0) {
                logger.info("Dispatched {} tasks to Runner", dispatchedCount)
            }

        } catch (e: Exception) {
            logger.error("Error during task dispatch: {}", e.message, e)
        } finally {
            redisQueueService.releaseDispatcherLock()
        }
    }

    /**
     * Dispatch a single task to the runner.
     * Returns true if task was dispatched successfully.
     */
    private fun dispatchSingleTask(taskId: Long): Boolean {
        val task = taskRepository.findById(taskId).orElse(null)
        if (task == null) {
            logger.error("Task {} not found in database after dequeue", taskId)
            return false
        }

        // Update task status to RUNNING
        task.status = TaskStatus.RUNNING
        task.startedAt = LocalDateTime.now()
        taskRepository.save(task)

        logger.info("Dispatching task {} to Runner", taskId)

        // Broadcast task dequeued event
        taskService.broadcastLog(LogChunkDTO(
            type = "TASK_DEQUEUED",
            taskId = taskId,
            line = "Task dequeued and dispatching to Runner",
            status = TaskStatus.RUNNING.name,
            isError = false
        ))

        // Send execution command to Runner
        if (task.scriptContent != null) {
            taskService.sendDynamicToRunner(
                taskId = task.id,
                scriptContent = task.scriptContent,
                skipPermissions = task.skipPermissions,
                sessionMode = task.sessionMode.name
            )
            return true
        } else {
            logger.error("Task {} has no scriptContent, cannot execute", taskId)
            onTaskCompleted(taskId, success = false, error = "No script content")
            return false
        }
    }

    /**
     * Handle task completion (success or failure).
     * Updates task status and triggers next dispatch.
     */
    fun onTaskCompleted(taskId: Long, success: Boolean, error: String? = null) {
        logger.info("Task {} completed: success={}, error={}", taskId, success, error)

        val task = taskRepository.findById(taskId).orElse(null)
        if (task == null) {
            logger.error("Task {} not found in database", taskId)
            return
        }

        // Update task status
        task.status = if (success) TaskStatus.COMPLETED else TaskStatus.FAILED
        task.completedAt = LocalDateTime.now()
        
        if (!success && error != null) {
            task.failureReason = error.take(50) // Limit to 50 chars
            task.errorSummary = error.take(1000) // Limit to 1000 chars
        }

        taskRepository.save(task)

        // Mark Runner as IDLE
        runnerStatus.set(RunnerStatus.IDLE)

        logger.info("Runner status set to IDLE after task {} completion", taskId)

        // Trigger next dispatch
        triggerDispatch()
    }

    /**
     * Handle RUNNER_STATUS messages from WebSocket.
     * Updates runner status and triggers dispatch on IDLE.
     */
    fun onRunnerStatusUpdate(status: String) {
        val newStatus = when (status.uppercase()) {
            "IDLE" -> RunnerStatus.IDLE
            "BUSY" -> RunnerStatus.BUSY
            else -> {
                logger.warn("Unknown runner status: {}", status)
                return
            }
        }

        val oldStatus = runnerStatus.getAndSet(newStatus)
        logger.info("Runner status updated: {} -> {}", oldStatus, newStatus)

        // If Runner became IDLE, try to dispatch next task
        if (newStatus == RunnerStatus.IDLE && oldStatus != RunnerStatus.IDLE) {
            logger.info("Runner became IDLE, triggering dispatch")
            triggerDispatch()
        }
    }

    /**
     * Set rate limited status.
     * Pauses dispatcher when true, resumes when false.
     */
    fun setRateLimited(limited: Boolean) {
        val wasLimited = isRateLimited.getAndSet(limited)
        
        if (limited && !wasLimited) {
            logger.warn("Dispatcher paused due to rate limit")
            
            // Broadcast rate limit event
            taskService.broadcastLog(LogChunkDTO(
                type = "DISPATCHER_PAUSED",
                taskId = 0,
                line = "Dispatcher paused due to rate limit detection",
                status = null,
                isError = true
            ))
        } else if (!limited && wasLimited) {
            logger.info("Dispatcher resuming after rate limit cleared")
            
            // Broadcast resume event
            taskService.broadcastLog(LogChunkDTO(
                type = "DISPATCHER_RESUMED",
                taskId = 0,
                line = "Dispatcher resumed - rate limit cleared",
                status = null,
                isError = false
            ))
            
            // Trigger dispatch to resume queue processing
            triggerDispatch()
        }
    }

    /**
     * Handle Runner disconnection with context-aware recovery.
     * Checks recent logs for rate limit to determine failureReason.
     */
    fun onRunnerDisconnected() {
        logger.warn("Runner disconnected - handling interruption")

        // Find currently running task
        val runningTasks = taskRepository.findByStatus(TaskStatus.RUNNING)
        
        runningTasks.forEach { task ->
            logger.info("Marking task {} as INTERRUPTED due to Runner disconnect", task.id)
            
            // Determine failure reason based on rate limit status
            val failureReason = if (isRateLimited.get()) {
                "RATE_LIMIT"
            } else {
                "RUNNER_DISCONNECT"
            }
            
            task.status = TaskStatus.INTERRUPTED
            task.failureReason = failureReason
            task.completedAt = LocalDateTime.now()
            taskRepository.save(task)

            // Broadcast interruption event
            taskService.broadcastLog(LogChunkDTO(
                type = "TASK_INTERRUPTED",
                taskId = task.id,
                line = "Task interrupted: $failureReason",
                status = TaskStatus.INTERRUPTED.name,
                isError = true
            ))
        }

        // Reset Runner status
        runnerStatus.set(RunnerStatus.IDLE)
    }

    /**
     * Get current Runner status.
     */
    fun getRunnerStatus(): RunnerStatus {
        return runnerStatus.get()
    }

    /**
     * Check if dispatcher is rate limited.
     */
    fun isRateLimited(): Boolean {
        return isRateLimited.get()
    }

    /**
     * Phase 5: Handle capacity update from Runner.
     * Updates available slots and triggers dispatch for available capacity.
     */
    fun onRunnerCapacityUpdate(maxParallel: Int, runningTasks: Int, availableSlots: Int) {
        val oldMax = runnerMaxParallel.getAndSet(maxParallel)
        val oldAvailable = runnerAvailableSlots.getAndSet(availableSlots)

        if (oldMax != maxParallel) {
            logger.info("Runner capacity updated: maxParallel {} -> {}", oldMax, maxParallel)
        }

        // Update legacy status based on available slots
        if (availableSlots > 0) {
            runnerStatus.set(RunnerStatus.IDLE)
        } else {
            runnerStatus.set(RunnerStatus.BUSY)
        }

        // If new slots became available, trigger dispatch
        if (availableSlots > oldAvailable && availableSlots > 0) {
            logger.info("Runner has {} available slots (was {}), triggering dispatch", availableSlots, oldAvailable)
            triggerDispatch()
        }
    }

    /**
     * Get current runner capacity information.
     */
    fun getRunnerCapacity(): Triple<Int, Int, Int> {
        val max = runnerMaxParallel.get()
        val available = runnerAvailableSlots.get()
        val running = max - available
        return Triple(max, running, available)
    }
}
