export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface UserAccount {
  id: string;
  auth0_sub: string;
  email: string | null;
  email_verified: boolean | null;
  display_name: string | null;
  picture_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthSession {
  auth0: Record<string, JsonValue>;
  user: UserAccount;
  csrf_token: string;
}
