export type UserRole = "ceo" | "ops" | "staff" | "vendor";

export type User = {
  id: string;
  staff_id: string;
  login_id: string;
  name: string;
  role: UserRole;
  active: boolean;
  first_login: boolean;
  permissions: {
    create_tasks: boolean;
    create_items: boolean;
  };
};

export type TaskType = "ops" | "clinical" | "patient";
export type TaskPriority = "critical" | "high" | "normal" | "low";
export type TaskStatus = "open" | "in_progress" | "done" | "blocked" | "escalated";
export type ProofType = "tap" | "photo" | "countersign";

export type Task = {
  id: string;
  title: string;
  type: TaskType;
  assignee_id: string;
  created_by: string;
  due_at: string;
  priority: TaskPriority;
  status: TaskStatus;
  proof_type: ProofType;
  recurrence: string;
  patient_linked: boolean;
  patient_id?: string;
  psi_node_id?: string;
  task_master_id?: string;
  department?: string;
  created_at: string;
  updated_at: string;
};

export type TaskEvent = {
  id: string;
  task_id: string;
  event_type: string;
  actor_id: string;
  timestamp: string;
  note?: string;
  photo_url?: string;
};

export type TaskMaster = {
  id: string;
  title: string;
  type: TaskType;
  priority: TaskPriority;
  proof_type: ProofType;
  recurrence: string;
  patient_linked: boolean;
  psi_node_id?: string;
  active: boolean;
  created_by: string;
};

export type Item = {
  id: string;
  name: string;
  price: number;
  vendor?: string;
  patient_linked: boolean;
  active: boolean;
};

export type PSINode = {
  id: string;
  problem: string;
  solution: string;
  indicator: string;
  status: "pending" | "active" | "rejected";
  raised_by: string;
  approved_by?: string;
  created_at: string;
};

export type Cashbook = {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
};

export type CashbookMember = {
  cashbook_id: string;
  user_id: string;
  role: "primary_admin" | "admin" | "data_operator";
  permissions: {
    backdated_entries: "always" | "never" | "one_day";
    can_edit_entries: boolean;
    hide_balance: boolean;
    hide_others_entries: boolean;
  };
};

export type CashEntry = {
  id: string;
  cashbook_id: string;
  type: "in" | "out";
  amount: number;
  category: string;
  party?: string;
  payment_mode?: string;
  note?: string;
  photo_url?: string;
  entered_by: string;
  entry_date: string;
  created_at: string;
};

export type Patient = {
  id: string;
  name: string;
  age: number;
  gender: string;
  contact: string;
  type: "opd" | "ipd";
  bed_id?: string;
  admitting_doctor_id: string;
  admitted_at: string;
  discharged_at?: string;
};

export type BillableItem = {
  id: string;
  patient_id: string;
  item_id: string;
  item_name: string;
  quantity: number;
  rate: number;
  amount: number;
  linked_task_id?: string;
  vendor?: string;
  status: "pending" | "posted";
  created_by: string;
  created_at: string;
};
