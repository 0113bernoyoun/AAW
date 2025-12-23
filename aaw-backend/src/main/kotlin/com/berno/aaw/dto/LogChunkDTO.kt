package com.berno.aaw.dto

data class LogChunkDTO(
    val type: String,
    val taskId: Long,
    val line: String?,
    val status: String?,
    val isError: Boolean = false
)
