export type UserRole = "ceo" | "ops" | "staff" | "vendor";

export type SessionUser = {
  id: string;
  staff_id: string;
  full_name: string;
  role: UserRole;
  login_id: string;
  must_change_password: boolean;
  /** From permissions row; used for profile menu and client-side gates */
  can_create_tasks?: boolean;
  can_create_items?: boolean;
};
