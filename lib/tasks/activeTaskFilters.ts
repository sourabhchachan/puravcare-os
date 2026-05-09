/** Statuses that count as “active” work for dashboards, open counts, and overdue. */
export const ACTIVE_TASK_STATUSES = ["pending", "acknowledged", "in_progress", "done", "blocked"] as const;

/** Open assignee workload (excludes queue/waiting and terminal states). */
export const OPEN_ASSIGNMENT_STATUSES = ["pending", "acknowledged", "in_progress", "blocked"] as const;

export function isActiveTaskStatus(status: string): boolean {
  return (ACTIVE_TASK_STATUSES as readonly string[]).includes(status);
}

export function isOpenAssignmentStatus(status: string): boolean {
  return (OPEN_ASSIGNMENT_STATUSES as readonly string[]).includes(status);
}
