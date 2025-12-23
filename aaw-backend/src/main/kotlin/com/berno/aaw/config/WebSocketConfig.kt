package com.berno.aaw.config

import com.berno.aaw.handler.RunnerWebSocketHandler
import org.springframework.context.annotation.Configuration
import org.springframework.web.socket.config.annotation.EnableWebSocket
import org.springframework.web.socket.config.annotation.WebSocketConfigurer
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry

@Configuration
@EnableWebSocket
class WebSocketConfig(
    private val runnerWebSocketHandler: RunnerWebSocketHandler
) : WebSocketConfigurer {

    override fun registerWebSocketHandlers(registry: WebSocketHandlerRegistry) {
        registry.addHandler(runnerWebSocketHandler, "/ws/logs")
            .setAllowedOrigins("http://localhost:3000", "http://localhost:8080")
    }
}
