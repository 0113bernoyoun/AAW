package com.berno.aaw.config

import com.berno.aaw.handler.RunnerWebSocketHandler
import com.berno.aaw.service.TaskDispatcherService
import jakarta.annotation.PostConstruct
import org.springframework.context.annotation.Configuration

@Configuration
class DispatcherConfig(
    private val runnerWebSocketHandler: RunnerWebSocketHandler,
    private val taskDispatcherService: TaskDispatcherService,
    private val taskService: com.berno.aaw.service.TaskService
) {

    @PostConstruct
    fun init() {
        runnerWebSocketHandler.setTaskDispatcherService(taskDispatcherService)
        taskService.setTaskDispatcherService(taskDispatcherService)
    }
}
