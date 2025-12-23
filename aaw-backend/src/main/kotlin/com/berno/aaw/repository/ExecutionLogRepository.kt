package com.berno.aaw.repository

import com.berno.aaw.entity.ExecutionLog
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface ExecutionLogRepository : JpaRepository<ExecutionLog, Long> {
    fun findByTaskIdOrderByCreatedAtAsc(taskId: Long): List<ExecutionLog>
}
