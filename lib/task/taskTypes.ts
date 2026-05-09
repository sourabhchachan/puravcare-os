/** Map DB / legacy values to UI task template types */
export function normalizeTemplateTaskType(t: string | null | undefined): "ops" | "clinical" {
  if (t === "clinical" || t === "patient") return "clinical";
  return "ops";
}

/** Persisted task type for new tasks (matches DB CHECK) */
export function taskTypeForInsertFromTemplate(t: string | null | undefined): "ops" | "clinical" {
  return normalizeTemplateTaskType(t);
}
