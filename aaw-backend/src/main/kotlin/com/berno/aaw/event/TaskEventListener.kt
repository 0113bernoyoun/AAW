package com.berno.aaw.event

import com.berno.aaw.service.TaskDispatcherService
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import org.springframework.transaction.event.TransactionPhase
import org.springframework.transaction.event.TransactionalEventListener

/**
 * Listens for TaskCreatedEvent and triggers dispatch AFTER the transaction commits.
 * This ensures the task is visible in the database before the dispatcher attempts to read it.
 */
@Component
class TaskEventListener(
    private val taskDispatcherService: TaskDispatcherService
) {
    private val logger = LoggerFactory.getLogger(TaskEventListener::class.java)

    /**
     * Handle TaskCreatedEvent AFTER the transaction commits.
     * This resolves the race condition where the dispatcher was reading the DB
     * before the task creation transaction was committed.
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    fun handleTaskCreated(event: TaskCreatedEvent) {
        logger.info("TaskCreatedEvent received for task {} (after commit), triggering dispatch", event.taskId)
        taskDispatcherService.triggerDispatch()
    }
}
