package com.berno.aaw.service

import io.mockk.*
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.data.Offset.offset
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.data.redis.core.DefaultTypedTuple
import org.springframework.data.redis.core.RedisTemplate
import org.springframework.data.redis.core.ValueOperations
import org.springframework.data.redis.core.ZSetOperations
import java.time.Duration
import java.time.Instant

/**
 * Comprehensive unit tests for RedisQueueService.
 * Tests priority queue operations, score algorithm, and distributed locking.
 */
class RedisQueueServiceTest {

    private lateinit var redisTemplate: RedisTemplate<String, String>
    private lateinit var zSetOps: ZSetOperations<String, String>
    private lateinit var valueOps: ValueOperations<String, String>
    private lateinit var redisQueueService: RedisQueueService

    @BeforeEach
    fun setUp() {
        redisTemplate = mockk(relaxed = true)
        zSetOps = mockk(relaxed = true)
        valueOps = mockk(relaxed = true)

        every { redisTemplate.opsForZSet() } returns zSetOps
        every { redisTemplate.opsForValue() } returns valueOps

        redisQueueService = RedisQueueService(redisTemplate)
    }

    @AfterEach
    fun tearDown() {
        clearAllMocks()
    }

    // ==================== Score Calculation Tests ====================

    @Test
    fun `calculateScore should return lower scores for higher priority tasks`() {
        // Given: Calculate scores for different priorities
        // When: Calculate scores at approximately same time
        val highPriorityScore = redisQueueService.calculateScore(priority = 10)
        val mediumPriorityScore = redisQueueService.calculateScore(priority = 5)
        val lowPriorityScore = redisQueueService.calculateScore(priority = 0)

        // Then: Higher priority should have lower (more negative) score
        assertThat(highPriorityScore)
            .`as`("High priority task should have lowest score")
            .isLessThan(mediumPriorityScore)

        assertThat(mediumPriorityScore)
            .`as`("Medium priority task should have lower score than low priority")
            .isLessThan(lowPriorityScore)

        // Verify score differences match priority differences
        // Formula: score = (priority × -1) + (timestamp / 1.0e13)
        // For same timestamp, difference should be exactly the priority difference
        val highMediumDiff = mediumPriorityScore - highPriorityScore
        val mediumLowDiff = lowPriorityScore - mediumPriorityScore

        assertThat(highMediumDiff)
            .`as`("Score difference between priority 5 and 10 should be approximately 5")
            .isCloseTo(5.0, offset(0.01))

        assertThat(mediumLowDiff)
            .`as`("Score difference between priority 0 and 5 should be approximately 5")
            .isCloseTo(5.0, offset(0.01))
    }

    @Test
    fun `calculateScore should order tasks by timestamp when priorities are same`() {
        // Given: Calculate score for first task
        val earlierScore = redisQueueService.calculateScore(priority = 5)

        // When: Wait a tiny bit (simulated by calculating again)
        Thread.sleep(2) // Wait 2ms to ensure different timestamp

        // And: Calculate score for second task with same priority
        val laterScore = redisQueueService.calculateScore(priority = 5)

        // Then: Later task should have slightly higher score (because of later timestamp)
        // Formula: (priority × -1) + (timestamp / 1.0e13)
        // Same priority, but later timestamp means slightly higher score
        assertThat(laterScore)
            .`as`("Later task should have slightly higher score than earlier task")
            .isGreaterThanOrEqualTo(earlierScore)

        // Verify the difference is minimal (timestamp component only)
        val difference = laterScore - earlierScore
        assertThat(difference)
            .`as`("Score difference should be minimal (timestamp-based)")
            .isLessThan(0.01)
    }

    // ==================== Enqueue/Dequeue Tests ====================

    @Test
    fun `enqueue should add task to queue with calculated score`() {
        // Given: A task to enqueue
        val taskId = 123L
        val priority = 7
        every { zSetOps.add(any(), any(), any()) } returns true

        // When: Enqueue task
        val result = redisQueueService.enqueue(taskId, priority)

        // Then: Task should be added successfully
        assertThat(result)
            .`as`("Enqueue operation should succeed")
            .isTrue()

        // Verify Redis ZSet operations
        verify {
            zSetOps.add(
                eq("aaw:task:queue"),
                eq(taskId.toString()),
                match { score -> score < 0 } // Score should be negative for priority 7
            )
        }
    }

    @Test
    fun `enqueue should return false when task already in queue`() {
        // Given: Task already exists in queue
        val taskId = 456L
        val priority = 3
        every { zSetOps.add(any(), any(), any()) } returns false

        // When: Try to enqueue duplicate task
        val result = redisQueueService.enqueue(taskId, priority)

        // Then: Should return false
        assertThat(result)
            .`as`("Enqueue should fail for duplicate task")
            .isFalse()

        verify { zSetOps.add(any(), any(), any()) }
    }

    @Test
    fun `dequeue should return highest priority task in FIFO order`() {
        // Given: Multiple tasks in queue with mixed priorities
        val highPriorityTask = DefaultTypedTuple("100", -9.8265)

        every { zSetOps.popMin(any()) } returns highPriorityTask

        // When: Dequeue next task
        val result = redisQueueService.dequeue()

        // Then: Should return highest priority task
        assertThat(result)
            .`as`("Should dequeue highest priority task")
            .isEqualTo(100L)

        verify { zSetOps.popMin("aaw:task:queue") }
    }

    @Test
    fun `dequeue should return null when queue is empty`() {
        // Given: Empty queue
        every { zSetOps.popMin(any()) } returns null

        // When: Dequeue from empty queue
        val result = redisQueueService.dequeue()

        // Then: Should return null
        assertThat(result)
            .`as`("Dequeue should return null for empty queue")
            .isNull()

        verify { zSetOps.popMin(any()) }
    }

    @Test
    fun `enqueueDequeue should maintain FIFO ordering within same priority`() {
        // Given: Multiple tasks with same priority
        val priority = 5
        val taskIds = listOf(101L, 102L, 103L)

        // Mock enqueue operations
        every { zSetOps.add(any(), any(), any()) } returns true

        // Mock sequential dequeue operations
        val dequeuedTasks = mutableListOf<DefaultTypedTuple<String>>()
        taskIds.forEach { taskId ->
            dequeuedTasks.add(DefaultTypedTuple(taskId.toString(), -4.8265))
        }
        every { zSetOps.popMin(any()) } returnsMany dequeuedTasks.map { it }

        // When: Enqueue all tasks
        taskIds.forEach { taskId ->
            redisQueueService.enqueue(taskId, priority)
        }

        // And: Dequeue all tasks
        val results = taskIds.map { redisQueueService.dequeue() }

        // Then: Should maintain FIFO order
        assertThat(results)
            .`as`("Tasks with same priority should be dequeued in FIFO order")
            .containsExactlyElementsOf(taskIds)

        verify(exactly = taskIds.size) { zSetOps.add(any(), any(), any()) }
        verify(exactly = taskIds.size) { zSetOps.popMin(any()) }
    }

    @Test
    fun `enqueueDequeue should prioritize higher priority tasks regardless of order`() {
        // Given: Tasks enqueued in low-to-high priority order
        val lowPriorityTask = 201L to 0
        val mediumPriorityTask = 202L to 5
        val highPriorityTask = 203L to 10

        // Mock enqueue operations
        every { zSetOps.add(any(), any(), any()) } returns true

        // Mock dequeue to return in priority order (high to low)
        every { zSetOps.popMin(any()) } returnsMany listOf(
            DefaultTypedTuple(highPriorityTask.first.toString(), -9.8265),
            DefaultTypedTuple(mediumPriorityTask.first.toString(), -4.8265),
            DefaultTypedTuple(lowPriorityTask.first.toString(), 0.1735)
        )

        // When: Enqueue tasks in reverse priority order
        redisQueueService.enqueue(lowPriorityTask.first, lowPriorityTask.second)
        redisQueueService.enqueue(mediumPriorityTask.first, mediumPriorityTask.second)
        redisQueueService.enqueue(highPriorityTask.first, highPriorityTask.second)

        // And: Dequeue tasks
        val firstTask = redisQueueService.dequeue()
        val secondTask = redisQueueService.dequeue()
        val thirdTask = redisQueueService.dequeue()

        // Then: Should dequeue in priority order
        assertThat(firstTask)
            .`as`("First dequeued task should be highest priority")
            .isEqualTo(highPriorityTask.first)

        assertThat(secondTask)
            .`as`("Second dequeued task should be medium priority")
            .isEqualTo(mediumPriorityTask.first)

        assertThat(thirdTask)
            .`as`("Third dequeued task should be lowest priority")
            .isEqualTo(lowPriorityTask.first)
    }

    // ==================== Remove Tests ====================

    @Test
    fun `remove should successfully remove task from queue`() {
        // Given: Task exists in queue
        val taskId = 789L
        every { zSetOps.remove(any(), any()) } returns 1

        // When: Remove task
        val result = redisQueueService.remove(taskId)

        // Then: Should return true
        assertThat(result)
            .`as`("Remove operation should succeed")
            .isTrue()

        verify { zSetOps.remove("aaw:task:queue", taskId.toString()) }
    }

    @Test
    fun `remove should return false when task not in queue`() {
        // Given: Task does not exist in queue
        val taskId = 999L
        every { zSetOps.remove(any(), any()) } returns 0

        // When: Try to remove non-existent task
        val result = redisQueueService.remove(taskId)

        // Then: Should return false
        assertThat(result)
            .`as`("Remove should fail for non-existent task")
            .isFalse()

        verify { zSetOps.remove("aaw:task:queue", taskId.toString()) }
    }

    // ==================== Queue State Tests ====================

    @Test
    fun `getQueueSnapshot should return tasks in priority order`() {
        // Given: Queue with multiple tasks
        val taskIds = setOf("10", "20", "30")
        every { zSetOps.range(any(), any(), any()) } returns taskIds

        // When: Get queue snapshot
        val result = redisQueueService.getQueueSnapshot()

        // Then: Should return ordered list
        assertThat(result)
            .`as`("Snapshot should contain all tasks in priority order")
            .containsExactly(10L, 20L, 30L)

        verify { zSetOps.range("aaw:task:queue", 0, 99) }
    }

    @Test
    fun `getQueueSize should return number of tasks in queue`() {
        // Given: Queue with 5 tasks
        every { zSetOps.size(any()) } returns 5

        // When: Get queue size
        val result = redisQueueService.getQueueSize()

        // Then: Should return 5
        assertThat(result)
            .`as`("Queue size should be 5")
            .isEqualTo(5)

        verify { zSetOps.size("aaw:task:queue") }
    }

    @Test
    fun `getPosition should return correct position for task in queue`() {
        // Given: Task at position 3
        val taskId = 555L
        every { zSetOps.rank(any(), any()) } returns 3

        // When: Get task position
        val result = redisQueueService.getPosition(taskId)

        // Then: Should return position 3
        assertThat(result)
            .`as`("Task position should be 3")
            .isEqualTo(3)

        verify { zSetOps.rank("aaw:task:queue", taskId.toString()) }
    }

    @Test
    fun `getPosition should return null when task not in queue`() {
        // Given: Task not in queue
        val taskId = 777L
        every { zSetOps.rank(any(), any()) } returns null

        // When: Get position for non-existent task
        val result = redisQueueService.getPosition(taskId)

        // Then: Should return null
        assertThat(result)
            .`as`("Position should be null for non-existent task")
            .isNull()

        verify { zSetOps.rank("aaw:task:queue", taskId.toString()) }
    }

    // ==================== Distributed Lock Tests ====================

    @Test
    fun `acquireDispatcherLock should successfully acquire lock when available`() {
        // Given: Lock is available
        every { valueOps.setIfAbsent(any(), any(), any<Duration>()) } returns true

        // When: Acquire lock
        val result = redisQueueService.acquireDispatcherLock()

        // Then: Should succeed
        assertThat(result)
            .`as`("Lock acquisition should succeed when lock is available")
            .isTrue()

        verify {
            valueOps.setIfAbsent(
                eq("aaw:dispatcher:lock"),
                eq("locked"),
                eq(Duration.ofSeconds(30))
            )
        }
    }

    @Test
    fun `acquireDispatcherLock should fail when lock already held`() {
        // Given: Lock is already held
        every { valueOps.setIfAbsent(any(), any(), any<Duration>()) } returns false

        // When: Try to acquire lock
        val result = redisQueueService.acquireDispatcherLock()

        // Then: Should fail
        assertThat(result)
            .`as`("Lock acquisition should fail when lock already held")
            .isFalse()

        verify { valueOps.setIfAbsent(any(), any(), any<Duration>()) }
    }

    @Test
    fun `acquireDispatcherLock should set 30 second expiry to prevent deadlock`() {
        // Given: Lock is available
        every { valueOps.setIfAbsent(any(), any(), any<Duration>()) } returns true

        // When: Acquire lock
        redisQueueService.acquireDispatcherLock()

        // Then: Should set 30 second TTL
        verify {
            valueOps.setIfAbsent(
                any(),
                any(),
                match { duration -> duration.seconds == 30L }
            )
        }
    }

    @Test
    fun `releaseDispatcherLock should delete lock key`() {
        // Given: Lock is held
        every { redisTemplate.delete(any<String>()) } returns true

        // When: Release lock
        redisQueueService.releaseDispatcherLock()

        // Then: Should delete lock key
        verify { redisTemplate.delete("aaw:dispatcher:lock") }
    }

    // ==================== Runner Status Tests ====================

    @Test
    fun `setRunnerStatus should set status with 5 minute TTL`() {
        // Given: A status to set
        val status = "IDLE"

        // When: Set runner status
        redisQueueService.setRunnerStatus(status)

        // Then: Should set value with TTL
        verify {
            valueOps.set(
                eq("aaw:runner:status"),
                eq(status),
                eq(Duration.ofSeconds(300))
            )
        }
    }

    @Test
    fun `getRunnerStatus should return current status`() {
        // Given: Runner status is set
        every { valueOps.get(any()) } returns "BUSY"

        // When: Get runner status
        val result = redisQueueService.getRunnerStatus()

        // Then: Should return status
        assertThat(result)
            .`as`("Should return current runner status")
            .isEqualTo("BUSY")

        verify { valueOps.get("aaw:runner:status") }
    }

    @Test
    fun `getRunnerStatus should return null when expired`() {
        // Given: Runner status has expired
        every { valueOps.get(any()) } returns null

        // When: Get runner status
        val result = redisQueueService.getRunnerStatus()

        // Then: Should return null
        assertThat(result)
            .`as`("Should return null when status expired")
            .isNull()

        verify { valueOps.get("aaw:runner:status") }
    }

    // ==================== Error Handling Tests ====================

    @Test
    fun `enqueue should return false on Redis exception`() {
        // Given: Redis throws exception
        every { zSetOps.add(any(), any(), any()) } throws RuntimeException("Redis connection failed")

        // When: Try to enqueue
        val result = redisQueueService.enqueue(123L, 5)

        // Then: Should return false instead of throwing
        assertThat(result)
            .`as`("Enqueue should handle exceptions gracefully")
            .isFalse()
    }

    @Test
    fun `dequeue should return null on Redis exception`() {
        // Given: Redis throws exception
        every { zSetOps.popMin(any()) } throws RuntimeException("Redis connection failed")

        // When: Try to dequeue
        val result = redisQueueService.dequeue()

        // Then: Should return null instead of throwing
        assertThat(result)
            .`as`("Dequeue should handle exceptions gracefully")
            .isNull()
    }

    @Test
    fun `clearQueue should return true on successful clear`() {
        // Given: Queue exists
        every { redisTemplate.delete(any<String>()) } returns true

        // When: Clear queue
        val result = redisQueueService.clearQueue()

        // Then: Should succeed
        assertThat(result)
            .`as`("Clear queue should succeed")
            .isTrue()

        verify { redisTemplate.delete("aaw:task:queue") }
    }
}
