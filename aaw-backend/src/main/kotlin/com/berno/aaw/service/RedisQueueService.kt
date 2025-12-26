package com.berno.aaw.service

import org.slf4j.LoggerFactory
import org.springframework.data.redis.core.RedisTemplate
import org.springframework.stereotype.Service
import java.time.Duration
import java.time.Instant

/**
 * Redis-based task queue service with priority scheduling.
 *
 * Uses Redis Sorted Set (ZSet) for queue operations where:
 * - Score = (priority × -1) + (timestamp / 1.0e13)
 * - Lower scores are dequeued first (higher priority + earlier timestamp)
 */
@Service
class RedisQueueService(
    private val redisTemplate: RedisTemplate<String, String>
) {
    private val logger = LoggerFactory.getLogger(RedisQueueService::class.java)

    companion object {
        private const val QUEUE_KEY = "aaw:task:queue"
        private const val RUNNER_STATUS_KEY = "aaw:runner:status"
        private const val RUNNER_STATUS_TTL_SECONDS = 300L // 5 minutes
        private const val SCORE_TIMESTAMP_DIVISOR = 1.0e13
    }

    /**
     * Calculate priority score for ZSet ordering.
     * Formula: (priority × -1) + (timestamp / 1.0e13)
     *
     * Example scores:
     * - Priority 10 at time 1735000000000 → -10.0 + 0.1735 ≈ -9.8265
     * - Priority 5 at time 1735000000000 → -5.0 + 0.1735 ≈ -4.8265
     * - Priority 0 at time 1735000000000 → 0.0 + 0.1735 ≈ 0.1735
     *
     * Higher priority tasks get lower (more negative) scores → dequeued first.
     * Among same priority, earlier timestamps get slightly lower scores.
     */
    fun calculateScore(priority: Int): Double {
        val timestamp = Instant.now().toEpochMilli()
        val score = (priority * -1.0) + (timestamp / SCORE_TIMESTAMP_DIVISOR)
        logger.debug("Calculated score for priority {}: {} (timestamp: {})", priority, score, timestamp)
        return score
    }

    /**
     * Enqueue a task with given priority.
     *
     * @param taskId Task identifier
     * @param priority Task priority (higher = more urgent)
     * @return true if task was added, false if already in queue
     */
    fun enqueue(taskId: Long, priority: Int): Boolean {
        return try {
            val score = calculateScore(priority)
            val zSetOps = redisTemplate.opsForZSet()
            val added = zSetOps.add(QUEUE_KEY, taskId.toString(), score) ?: false

            if (added) {
                logger.info("Enqueued task {} with priority {} (score: {})", taskId, priority, score)
            } else {
                logger.warn("Task {} already in queue", taskId)
            }

            added
        } catch (e: Exception) {
            logger.error("Failed to enqueue task {}: {}", taskId, e.message, e)
            false
        }
    }

    /**
     * Dequeue the highest priority task (atomic operation).
     *
     * @return Task ID if available, null if queue is empty
     */
    fun dequeue(): Long? {
        return try {
            val zSetOps = redisTemplate.opsForZSet()

            // ZPOPMIN: atomically remove and return element with lowest score
            val result = zSetOps.popMin(QUEUE_KEY)

            if (result != null && result.value != null) {
                val taskId = result.value!!.toLong()
                logger.info("Dequeued task {} (score: {})", taskId, result.score)
                taskId
            } else {
                logger.debug("Queue is empty")
                null
            }
        } catch (e: Exception) {
            logger.error("Failed to dequeue task: {}", e.message, e)
            null
        }
    }

    /**
     * Get snapshot of current queue state (first 100 tasks).
     *
     * @return List of task IDs ordered by priority (highest first)
     */
    fun getQueueSnapshot(): List<Long> {
        return try {
            val zSetOps = redisTemplate.opsForZSet()

            // Get first 100 tasks in score order (lowest score = highest priority)
            val taskIds = zSetOps.range(QUEUE_KEY, 0, 99)
                ?.mapNotNull { it.toLongOrNull() }
                ?: emptyList()

            logger.debug("Queue snapshot: {} tasks", taskIds.size)
            taskIds
        } catch (e: Exception) {
            logger.error("Failed to get queue snapshot: {}", e.message, e)
            emptyList()
        }
    }

    /**
     * Remove a specific task from the queue (cancellation).
     *
     * @param taskId Task identifier to remove
     * @return true if task was removed, false if not in queue
     */
    fun remove(taskId: Long): Boolean {
        return try {
            val zSetOps = redisTemplate.opsForZSet()
            val removed = (zSetOps.remove(QUEUE_KEY, taskId.toString()) ?: 0) > 0

            if (removed) {
                logger.info("Removed task {} from queue", taskId)
            } else {
                logger.debug("Task {} not in queue", taskId)
            }

            removed
        } catch (e: Exception) {
            logger.error("Failed to remove task {}: {}", taskId, e.message, e)
            false
        }
    }

    /**
     * Set runner status with TTL (heartbeat mechanism).
     *
     * @param status Runner status (e.g., "IDLE", "BUSY", "PAUSED")
     */
    fun setRunnerStatus(status: String) {
        try {
            val valueOps = redisTemplate.opsForValue()
            valueOps.set(RUNNER_STATUS_KEY, status, Duration.ofSeconds(RUNNER_STATUS_TTL_SECONDS))
            logger.debug("Set runner status: {}", status)
        } catch (e: Exception) {
            logger.error("Failed to set runner status: {}", e.message, e)
        }
    }

    /**
     * Get current runner status.
     *
     * @return Runner status string or null if expired/not set
     */
    fun getRunnerStatus(): String? {
        return try {
            val valueOps = redisTemplate.opsForValue()
            val status = valueOps.get(RUNNER_STATUS_KEY)
            logger.debug("Retrieved runner status: {}", status)
            status
        } catch (e: Exception) {
            logger.error("Failed to get runner status: {}", e.message, e)
            null
        }
    }

    /**
     * Get current queue size.
     *
     * @return Number of tasks in queue
     */
    fun getQueueSize(): Long {
        return try {
            val zSetOps = redisTemplate.opsForZSet()
            zSetOps.size(QUEUE_KEY) ?: 0L
        } catch (e: Exception) {
            logger.error("Failed to get queue size: {}", e.message, e)
            0L
        }
    }

    /**
     * Get queue position for a specific task (0-based).
     *
     * @param taskId Task identifier
     * @return Position in queue (0 = highest priority) or null if not in queue
     */
    fun getPosition(taskId: Long): Long? {
        return try {
            val zSetOps = redisTemplate.opsForZSet()
            val rank = zSetOps.rank(QUEUE_KEY, taskId.toString())

            if (rank != null) {
                logger.debug("Task {} position in queue: {}", taskId, rank)
            } else {
                logger.debug("Task {} not in queue", taskId)
            }

            rank
        } catch (e: Exception) {
            logger.error("Failed to get position for task {}: {}", taskId, e.message, e)
            null
        }
    }

    /**
     * Get all task IDs currently in the queue.
     * Used for recovery operations to reconcile Redis queue with database state.
     *
     * @return Set of all task IDs in the queue
     */
    fun getAllQueuedTaskIds(): Set<Long> {
        return try {
            val zSetOps = redisTemplate.opsForZSet()

            // Get all members from the sorted set
            val taskIds = zSetOps.range(QUEUE_KEY, 0, -1)
                ?.mapNotNull { it.toLongOrNull() }
                ?.toSet()
                ?: emptySet()

            logger.debug("Retrieved {} task IDs from queue", taskIds.size)
            taskIds
        } catch (e: Exception) {
            logger.error("Failed to get all queued task IDs: {}", e.message, e)
            emptySet()
        }
    }

    /**
     * Clear entire queue (administrative operation).
     *
     * @return true if queue was cleared
     */
    fun clearQueue(): Boolean {
        return try {
            redisTemplate.delete(QUEUE_KEY)
            logger.warn("Cleared entire task queue")
            true
        } catch (e: Exception) {
            logger.error("Failed to clear queue: {}", e.message, e)
            false
        }
    }

    /**
     * Acquire distributed lock for dispatcher coordination.
     * Used to ensure only one dispatcher instance processes tasks at a time.
     *
     * @return true if lock was acquired, false if already locked
     */
    fun acquireDispatcherLock(): Boolean {
        return try {
            val lockKey = "aaw:dispatcher:lock"
            val valueOps = redisTemplate.opsForValue()
            val acquired = valueOps.setIfAbsent(lockKey, "locked", Duration.ofSeconds(30)) ?: false

            if (acquired) {
                logger.debug("Acquired dispatcher lock")
            } else {
                logger.debug("Dispatcher lock already held")
            }

            acquired
        } catch (e: Exception) {
            logger.error("Failed to acquire dispatcher lock: {}", e.message, e)
            false
        }
    }

    /**
     * Release distributed lock for dispatcher coordination.
     */
    fun releaseDispatcherLock() {
        try {
            val lockKey = "aaw:dispatcher:lock"
            redisTemplate.delete(lockKey)
            logger.debug("Released dispatcher lock")
        } catch (e: Exception) {
            logger.error("Failed to release dispatcher lock: {}", e.message, e)
        }
    }
}
