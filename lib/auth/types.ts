export type UserRole = "ceo" | "ops" | "staff" | "vendor";

export type SessionUser = {
  id: string;
  staff_id: string;
  full_name: string;
  role: UserRole;
  login_id: string;
  must_change_password: boolean;
};
