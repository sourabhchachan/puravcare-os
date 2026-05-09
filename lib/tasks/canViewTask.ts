export type TaskRowMin = {
  assignee_id: string;
  created_by: string;
  countersign_user_id: string | null;
};

export function canViewTask(task: TaskRowMin, actorId: string, role: string | null): boolean {
  if (role === "ceo") return true;
  return (
    task.assignee_id === actorId ||
    task.created_by === actorId ||
    (task.countersign_user_id != null && task.countersign_user_id === actorId)
  );
}
