package com.berno.aaw.event

import org.springframework.context.ApplicationEvent

/**
 * Event published when a task is created and ready to be dispatched.
 * Used with @TransactionalEventListener to trigger dispatch AFTER transaction commits.
 * This prevents the race condition where the dispatcher reads the DB before the task is committed.
 */
class TaskCreatedEvent(
    source: Any,
    val taskId: Long,
    val priority: Int
) : ApplicationEvent(source)
