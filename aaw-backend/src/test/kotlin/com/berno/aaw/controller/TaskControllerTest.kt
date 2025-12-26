package com.berno.aaw.controller

import com.berno.aaw.entity.Task
import com.berno.aaw.entity.TaskStatus
import com.berno.aaw.entity.ExecutionMode
import com.berno.aaw.entity.SessionMode
import com.berno.aaw.repository.TaskRepository
import com.berno.aaw.service.RedisQueueService
import com.berno.aaw.service.TaskService
import com.berno.aaw.service.TaskDispatcherService
import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import io.mockk.verify
import io.mockk.slot
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*
import java.time.LocalDateTime
import java.util.*

/**
 * Comprehensive unit tests for TaskController recovery endpoints.
 * Tests retry and skip operations for interrupted tasks.
 */
@WebMvcTest(TaskController::class)
class TaskControllerTest {

    @Autowired
    private lateinit var mockMvc: MockMvc

    @MockkBean
    private lateinit var taskService: TaskService

    @MockkBean
    private lateinit var redisQueueService: RedisQueueService

    @MockkBean
    private lateinit var taskRepository: TaskRepository

    @MockkBean
    private lateinit var taskDispatcherService: TaskDispatcherService

    // ==================== Test Data Fixtures ====================

    private fun createInterruptedTask(
        id: Long = 1L,
        instruction: String = "Test task",
        priority: Int = 5,
        retryCount: Int = 0,
        failureReason: String? = "RATE_LIMIT"
    ): Task {
        return Task(
            id = id,
            instruction = instruction,
            status = TaskStatus.INTERRUPTED,
            priority = priority,
            retryCount = retryCount,
            failureReason = failureReason,
            scriptContent = "echo 'test'",
            executionMode = ExecutionMode.QUEUED,
            sessionMode = SessionMode.PERSIST,
            createdAt = LocalDateTime.now(),
            queuedAt = LocalDateTime.now().minusMinutes(5),
            startedAt = LocalDateTime.now().minusMinutes(3),
            completedAt = LocalDateTime.now().minusMinutes(1)
        )
    }

    private fun createFailedTask(
        id: Long = 2L,
        instruction: String = "Failed task",
        priority: Int = 3
    ): Task {
        return Task(
            id = id,
            instruction = instruction,
            status = TaskStatus.FAILED,
            priority = priority,
            failureReason = "EXECUTION_ERROR",
            scriptContent = "exit 1",
            executionMode = ExecutionMode.QUEUED,
            sessionMode = SessionMode.PERSIST,
            createdAt = LocalDateTime.now(),
            completedAt = LocalDateTime.now()
        )
    }

    private fun createRunningTask(
        id: Long = 3L,
        instruction: String = "Running task"
    ): Task {
        return Task(
            id = id,
            instruction = instruction,
            status = TaskStatus.RUNNING,
            scriptContent = "sleep 10",
            executionMode = ExecutionMode.QUEUED,
            sessionMode = SessionMode.PERSIST,
            createdAt = LocalDateTime.now(),
            startedAt = LocalDateTime.now()
        )
    }

    // ==================== Retry Endpoint Tests ====================

    @Test
    fun `retry should validate task status is INTERRUPTED`() {
        // Given: Task with RUNNING status (invalid for retry)
        val runningTask = createRunningTask(id = 100L)

        every { taskService.getTask(100L) } returns runningTask

        // When & Then: POST /api/tasks/100/retry should return 400 Bad Request
        mockMvc.perform(
            post("/api/tasks/100/retry")
                .contentType(MediaType.APPLICATION_JSON)
        )
            .andExpect(status().isBadRequest)

        // Verify no database changes attempted
        verify(exactly = 0) { taskRepository.save(any()) }
        verify(exactly = 0) { redisQueueService.enqueue(any(), any()) }
    }

    @Test
    fun `retry should validate task status is FAILED`() {
        // Given: Task with FAILED status (valid for retry)
        val failedTask = createFailedTask(id = 101L)
        val retriedTask = failedTask.copy(
            status = TaskStatus.QUEUED,
            retryCount = 1,
            queuedAt = LocalDateTime.now(),
            startedAt = null,
            completedAt = null
        )

        every { taskService.getTask(101L) } returns failedTask
        every { taskRepository.save(any()) } returns retriedTask
        every { redisQueueService.enqueue(101L, failedTask.priority) } returns true
        every { redisQueueService.getPosition(101L) } returns 2

        // When: POST /api/tasks/101/retry
        mockMvc.perform(
            post("/api/tasks/101/retry")
                .contentType(MediaType.APPLICATION_JSON)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.id").value(101))
            .andExpect(jsonPath("$.status").value("QUEUED"))
            .andExpect(jsonPath("$.retryCount").value(1))

        // Then: Should allow retry for FAILED tasks
        verify { taskRepository.save(any()) }
        verify { redisQueueService.enqueue(101L, failedTask.priority) }
    }

    @Test
    fun `retry should increment retry count on each attempt`() {
        // Given: Interrupted task with existing retry count
        val interruptedTask = createInterruptedTask(
            id = 200L,
            retryCount = 2 // Already retried twice
        )

        val taskSlot = slot<Task>()
        every { taskService.getTask(200L) } returns interruptedTask
        every { taskRepository.save(capture(taskSlot)) } answers { taskSlot.captured }
        every { redisQueueService.enqueue(200L, interruptedTask.priority) } returns true
        every { redisQueueService.getPosition(200L) } returns 0

        // When: Retry task
        mockMvc.perform(
            post("/api/tasks/200/retry")
                .contentType(MediaType.APPLICATION_JSON)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.retryCount").value(3))

        // Then: Retry count should be incremented to 3
        val savedTask = taskSlot.captured
        assertThat(savedTask.retryCount)
            .`as`("Retry count should be incremented from 2 to 3")
            .isEqualTo(3)
    }

    @Test
    fun `retry should reset task timestamps for fresh execution`() {
        // Given: Interrupted task with previous timestamps
        val interruptedTask = createInterruptedTask(id = 201L)

        val taskSlot = slot<Task>()
        every { taskService.getTask(201L) } returns interruptedTask
        every { taskRepository.save(capture(taskSlot)) } answers { taskSlot.captured }
        every { redisQueueService.enqueue(201L, interruptedTask.priority) } returns true
        every { redisQueueService.getPosition(201L) } returns 1

        // When: Retry task
        mockMvc.perform(
            post("/api/tasks/201/retry")
                .contentType(MediaType.APPLICATION_JSON)
        )
            .andExpect(status().isOk)

        // Then: Timestamps should be reset
        val savedTask = taskSlot.captured
        assertThat(savedTask.startedAt)
            .`as`("startedAt should be reset to null")
            .isNull()

        assertThat(savedTask.completedAt)
            .`as`("completedAt should be reset to null")
            .isNull()

        assertThat(savedTask.queuedAt)
            .`as`("queuedAt should be set to current time")
            .isNotNull()
            .isAfter(LocalDateTime.now().minusSeconds(5))
    }

    @Test
    fun `retry should re-enqueue task with same priority`() {
        // Given: Interrupted task with priority 8
        val interruptedTask = createInterruptedTask(
            id = 202L,
            priority = 8
        )

        every { taskService.getTask(202L) } returns interruptedTask
        every { taskRepository.save(any()) } returns interruptedTask.copy(status = TaskStatus.QUEUED)
        every { redisQueueService.enqueue(202L, 8) } returns true
        every { redisQueueService.getPosition(202L) } returns 3

        // When: Retry task
        mockMvc.perform(
            post("/api/tasks/202/retry")
                .contentType(MediaType.APPLICATION_JSON)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.queuePosition").value(3))

        // Then: Should enqueue with original priority
        verify { redisQueueService.enqueue(202L, 8) }
    }

    @Test
    fun `retry should return 500 when enqueue fails`() {
        // Given: Redis enqueue operation fails
        val interruptedTask = createInterruptedTask(id = 203L)

        every { taskService.getTask(203L) } returns interruptedTask
        every { taskRepository.save(any()) } returns interruptedTask.copy(status = TaskStatus.QUEUED)
        every { redisQueueService.enqueue(203L, interruptedTask.priority) } returns false

        // When & Then: Should return 500 Internal Server Error
        mockMvc.perform(
            post("/api/tasks/203/retry")
                .contentType(MediaType.APPLICATION_JSON)
        )
            .andExpect(status().isInternalServerError)
    }

    @Test
    fun `retry should change status from INTERRUPTED to QUEUED`() {
        // Given: Interrupted task
        val interruptedTask = createInterruptedTask(id = 204L)

        val taskSlot = slot<Task>()
        every { taskService.getTask(204L) } returns interruptedTask
        every { taskRepository.save(capture(taskSlot)) } answers { taskSlot.captured }
        every { redisQueueService.enqueue(204L, interruptedTask.priority) } returns true
        every { redisQueueService.getPosition(204L) } returns 0

        // When: Retry task
        mockMvc.perform(
            post("/api/tasks/204/retry")
                .contentType(MediaType.APPLICATION_JSON)
        )
            .andExpect(status().isOk)

        // Then: Status should be QUEUED
        val savedTask = taskSlot.captured
        assertThat(savedTask.status)
            .`as`("Task status should be changed to QUEUED")
            .isEqualTo(TaskStatus.QUEUED)
    }

    // ==================== Skip Endpoint Tests ====================

    @Test
    fun `skip should validate task status is INTERRUPTED`() {
        // Given: Task with RUNNING status (invalid for skip)
        val runningTask = createRunningTask(id = 300L)

        every { taskService.getTask(300L) } returns runningTask

        // When & Then: POST /api/tasks/300/skip should return 400 Bad Request
        mockMvc.perform(
            post("/api/tasks/300/skip")
                .contentType(MediaType.APPLICATION_JSON)
        )
            .andExpect(status().isBadRequest)

        // Verify no database changes attempted
        verify(exactly = 0) { taskRepository.save(any()) }
    }

    @Test
    fun `skip should reject FAILED tasks`() {
        // Given: Task with FAILED status (invalid for skip)
        val failedTask = createFailedTask(id = 301L)

        every { taskService.getTask(301L) } returns failedTask

        // When & Then: Skip should only work for INTERRUPTED tasks
        mockMvc.perform(
            post("/api/tasks/301/skip")
                .contentType(MediaType.APPLICATION_JSON)
        )
            .andExpect(status().isBadRequest)

        verify(exactly = 0) { taskRepository.save(any()) }
    }

    @Test
    fun `skip should mark task as FAILED`() {
        // Given: Interrupted task
        val interruptedTask = createInterruptedTask(id = 302L)

        val taskSlot = slot<Task>()
        every { taskService.getTask(302L) } returns interruptedTask
        every { taskRepository.save(capture(taskSlot)) } answers { taskSlot.captured }
        every { taskService.getTaskDispatcherService() } returns taskDispatcherService
        every { taskDispatcherService.triggerDispatch() } returns Unit

        // When: Skip task
        mockMvc.perform(
            post("/api/tasks/302/skip")
                .contentType(MediaType.APPLICATION_JSON)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status").value("FAILED"))

        // Then: Status should be FAILED
        val savedTask = taskSlot.captured
        assertThat(savedTask.status)
            .`as`("Skipped task should be marked as FAILED")
            .isEqualTo(TaskStatus.FAILED)
    }

    @Test
    fun `skip should set completedAt timestamp`() {
        // Given: Interrupted task without completedAt
        val interruptedTask = createInterruptedTask(id = 303L)

        val taskSlot = slot<Task>()
        every { taskService.getTask(303L) } returns interruptedTask
        every { taskRepository.save(capture(taskSlot)) } answers { taskSlot.captured }
        every { taskService.getTaskDispatcherService() } returns taskDispatcherService
        every { taskDispatcherService.triggerDispatch() } returns Unit

        // When: Skip task
        mockMvc.perform(
            post("/api/tasks/303/skip")
                .contentType(MediaType.APPLICATION_JSON)
        )
            .andExpect(status().isOk)

        // Then: completedAt should be set
        val savedTask = taskSlot.captured
        assertThat(savedTask.completedAt)
            .`as`("completedAt should be set when task is skipped")
            .isNotNull()
            .isAfter(LocalDateTime.now().minusSeconds(5))
    }

    @Test
    fun `skip should preserve existing failureReason`() {
        // Given: Interrupted task with RATE_LIMIT failure reason
        val interruptedTask = createInterruptedTask(
            id = 304L,
            failureReason = "RATE_LIMIT"
        )

        val taskSlot = slot<Task>()
        every { taskService.getTask(304L) } returns interruptedTask
        every { taskRepository.save(capture(taskSlot)) } answers { taskSlot.captured }
        every { taskService.getTaskDispatcherService() } returns taskDispatcherService
        every { taskDispatcherService.triggerDispatch() } returns Unit

        // When: Skip task
        mockMvc.perform(
            post("/api/tasks/304/skip")
                .contentType(MediaType.APPLICATION_JSON)
        )
            .andExpect(status().isOk)

        // Then: Original failure reason should be preserved
        val savedTask = taskSlot.captured
        assertThat(savedTask.failureReason)
            .`as`("Original failureReason should be preserved")
            .isEqualTo("RATE_LIMIT")
    }

    @Test
    fun `skip should set failureReason to SKIPPED when null`() {
        // Given: Interrupted task without failureReason
        val interruptedTask = createInterruptedTask(
            id = 305L,
            failureReason = null
        )

        val taskSlot = slot<Task>()
        every { taskService.getTask(305L) } returns interruptedTask
        every { taskRepository.save(capture(taskSlot)) } answers { taskSlot.captured }
        every { taskService.getTaskDispatcherService() } returns taskDispatcherService
        every { taskDispatcherService.triggerDispatch() } returns Unit

        // When: Skip task
        mockMvc.perform(
            post("/api/tasks/305/skip")
                .contentType(MediaType.APPLICATION_JSON)
        )
            .andExpect(status().isOk)

        // Then: failureReason should be set to SKIPPED
        val savedTask = taskSlot.captured
        assertThat(savedTask.failureReason)
            .`as`("failureReason should be set to SKIPPED when null")
            .isEqualTo("SKIPPED")
    }

    @Test
    fun `skip should trigger next task dispatch`() {
        // Given: Interrupted task
        val interruptedTask = createInterruptedTask(id = 306L)

        every { taskService.getTask(306L) } returns interruptedTask
        every { taskRepository.save(any()) } returns interruptedTask.copy(status = TaskStatus.FAILED)
        every { taskService.getTaskDispatcherService() } returns taskDispatcherService
        every { taskDispatcherService.triggerDispatch() } returns Unit

        // When: Skip task
        mockMvc.perform(
            post("/api/tasks/306/skip")
                .contentType(MediaType.APPLICATION_JSON)
        )
            .andExpect(status().isOk)

        // Then: Should trigger dispatcher to process next task
        verify(exactly = 1) { taskDispatcherService.triggerDispatch() }
    }

    @Test
    fun `skip should not increment retry count`() {
        // Given: Interrupted task with retry count 1
        val interruptedTask = createInterruptedTask(
            id = 307L,
            retryCount = 1
        )

        val taskSlot = slot<Task>()
        every { taskService.getTask(307L) } returns interruptedTask
        every { taskRepository.save(capture(taskSlot)) } answers { taskSlot.captured }
        every { taskService.getTaskDispatcherService() } returns taskDispatcherService
        every { taskDispatcherService.triggerDispatch() } returns Unit

        // When: Skip task
        mockMvc.perform(
            post("/api/tasks/307/skip")
                .contentType(MediaType.APPLICATION_JSON)
        )
            .andExpect(status().isOk)

        // Then: Retry count should remain unchanged
        val savedTask = taskSlot.captured
        assertThat(savedTask.retryCount)
            .`as`("Skip should not increment retry count")
            .isEqualTo(1)
    }

    @Test
    fun `skip should not re-enqueue task`() {
        // Given: Interrupted task
        val interruptedTask = createInterruptedTask(id = 308L)

        every { taskService.getTask(308L) } returns interruptedTask
        every { taskRepository.save(any()) } returns interruptedTask.copy(status = TaskStatus.FAILED)
        every { taskService.getTaskDispatcherService() } returns taskDispatcherService
        every { taskDispatcherService.triggerDispatch() } returns Unit

        // When: Skip task
        mockMvc.perform(
            post("/api/tasks/308/skip")
                .contentType(MediaType.APPLICATION_JSON)
        )
            .andExpect(status().isOk)

        // Then: Should not enqueue task
        verify(exactly = 0) { redisQueueService.enqueue(any(), any()) }
    }

    // ==================== Edge Case Tests ====================

    @Test
    fun `retry should work for multiple consecutive retries`() {
        // Given: Task already retried 3 times
        val interruptedTask = createInterruptedTask(
            id = 400L,
            retryCount = 3
        )

        val taskSlot = slot<Task>()
        every { taskService.getTask(400L) } returns interruptedTask
        every { taskRepository.save(capture(taskSlot)) } answers { taskSlot.captured }
        every { redisQueueService.enqueue(400L, interruptedTask.priority) } returns true
        every { redisQueueService.getPosition(400L) } returns 0

        // When: Retry again
        mockMvc.perform(
            post("/api/tasks/400/retry")
                .contentType(MediaType.APPLICATION_JSON)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.retryCount").value(4))

        // Then: Should allow retry without limit
        val savedTask = taskSlot.captured
        assertThat(savedTask.retryCount)
            .`as`("Should support unlimited retries")
            .isEqualTo(4)
    }

    @Test
    fun `skip should handle null dispatcher service gracefully`() {
        // Given: Dispatcher service is null
        val interruptedTask = createInterruptedTask(id = 309L)

        every { taskService.getTask(309L) } returns interruptedTask
        every { taskRepository.save(any()) } returns interruptedTask.copy(status = TaskStatus.FAILED)
        every { taskService.getTaskDispatcherService() } returns null

        // When: Skip task
        mockMvc.perform(
            post("/api/tasks/309/skip")
                .contentType(MediaType.APPLICATION_JSON)
        )
            .andExpect(status().isOk)

        // Then: Should complete without triggering dispatch
        verify(exactly = 0) { taskDispatcherService.triggerDispatch() }
    }
}
