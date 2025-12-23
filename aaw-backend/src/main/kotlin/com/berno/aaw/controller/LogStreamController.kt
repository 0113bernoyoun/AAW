package com.berno.aaw.controller

import com.berno.aaw.dto.LogChunkDTO
import com.berno.aaw.service.TaskService
import org.springframework.http.MediaType
import org.springframework.http.codec.ServerSentEvent
import org.springframework.web.bind.annotation.CrossOrigin
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import reactor.core.publisher.Flux

@RestController
@RequestMapping("/api/logs")
@CrossOrigin(origins = ["http://localhost:3000"])
class LogStreamController(
    private val taskService: TaskService
) {

    @GetMapping("/stream", produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
    fun streamLogs(): Flux<ServerSentEvent<LogChunkDTO>> {
        return taskService.logSink.asFlux()
            .map { logChunk ->
                ServerSentEvent.builder(logChunk)
                    .event("log-event")
                    .build()
            }
    }
}
