package com.berno.aaw.repository

import com.berno.aaw.entity.Task
import com.berno.aaw.entity.TaskStatus
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface TaskRepository : JpaRepository<Task, Long> {
    fun findByStatus(status: TaskStatus): List<Task>
    fun findAllByOrderByPriorityAscCreatedAtAsc(): List<Task>

    /**
     * Find tasks with specific statuses that completed before the given cutoff time.
     * Used by TaskRetentionService for 24-hour retention policy.
     *
     * @param statuses List of terminal task statuses to search
     * @param cutoff Timestamp cutoff - tasks completed before this will be returned
     * @return List of tasks matching criteria
     */
    fun findByStatusInAndCompletedAtBefore(
        statuses: List<TaskStatus>,
        cutoff: java.time.LocalDateTime
    ): List<Task>
}
