package com.berno.aaw.controller

import com.berno.aaw.dto.TaskDTO
import com.berno.aaw.dto.TaskStatusDTO
import com.berno.aaw.entity.TaskStatus
import com.berno.aaw.entity.SessionMode
import com.berno.aaw.service.TaskService
import org.slf4j.LoggerFactory
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/tasks")
@CrossOrigin(origins = ["http://localhost:3000"])
class TaskController(
    private val taskService: TaskService
) {
    private val logger = LoggerFactory.getLogger(TaskController::class.java)

    @PostMapping("/start-dummy")
    fun startDummyTask(): ResponseEntity<TaskDTO> {
        logger.info("Received request to start dummy task")

        // Create task
        val task = taskService.createTask("run dummy_task.sh")

        // Update status to RUNNING
        val runningTask = taskService.updateStatus(task.id, TaskStatus.RUNNING)

        // Send execution command to runner
        taskService.sendToRunner(task.id, "scripts/dummy_task.sh")

        logger.info("Dummy task {} created and sent to runner", task.id)

        return ResponseEntity.ok(TaskDTO.from(runningTask))
    }

    @GetMapping("/{id}")
    fun getTask(@PathVariable id: Long): ResponseEntity<TaskDTO> {
        val task = taskService.getTask(id)
        return ResponseEntity.ok(TaskDTO.from(task))
    }

    @GetMapping("/{id}/status")
    fun getTaskStatus(@PathVariable id: Long): ResponseEntity<TaskStatusDTO> {
        val task = taskService.getTask(id)
        return ResponseEntity.ok(TaskStatusDTO(task.id, task.status))
    }

    @PostMapping("/create-dynamic")
    fun createDynamicTask(@RequestBody request: CreateDynamicTaskRequest): ResponseEntity<TaskDTO> {
        logger.info("Received request to create dynamic task (session: {}, skipPermissions: {})",
            request.sessionMode, request.skipPermissions)

        // Create task with script content
        val task = taskService.createTask(
            instruction = request.instruction,
            scriptContent = request.scriptContent,
            skipPermissions = request.skipPermissions,
            sessionMode = SessionMode.valueOf(request.sessionMode)
        )

        // Update status to RUNNING
        val runningTask = taskService.updateStatus(task.id, TaskStatus.RUNNING)

        // Send dynamic execution command to runner
        taskService.sendDynamicToRunner(
            taskId = task.id,
            scriptContent = request.scriptContent,
            skipPermissions = request.skipPermissions,
            sessionMode = request.sessionMode
        )

        logger.info("Dynamic task {} created and sent to runner", task.id)

        return ResponseEntity.ok(TaskDTO.from(runningTask))
    }
}

data class CreateDynamicTaskRequest(
    val instruction: String,
    val scriptContent: String,
    val skipPermissions: Boolean = false,
    val sessionMode: String = "PERSIST"
)
