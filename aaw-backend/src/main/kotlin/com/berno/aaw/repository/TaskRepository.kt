package com.berno.aaw.repository

import com.berno.aaw.entity.Task
import com.berno.aaw.entity.TaskStatus
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface TaskRepository : JpaRepository<Task, Long> {
    fun findByStatus(status: TaskStatus): List<Task>
    fun findAllByOrderByPriorityAscCreatedAtAsc(): List<Task>
}
