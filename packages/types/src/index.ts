export type UserRole = "user" | "premium" | "staff" | "admin";
export type Locale = "en" | "ta";

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  code?: string;
  errors?: Array<{ field: string; message: string }>;
}

export interface ApiMeta {
  request_id: string;
  cursor?: string | null;
  next_cursor?: string | null;
  has_more?: boolean;
  total?: number;
}

export interface ApiEnvelope<T> {
  data: T | null;
  error: ProblemDetails | null;
  meta: ApiMeta;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  locale: Locale;
  is_student_verified: boolean;
  email_verified_at: string | null;
  created_at: string;
}

export interface AuthSession {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  is_guest: boolean;
  guest_expires_at: string | null;
  user: User | null;
  csrf_token: string;
}

export type DocumentStatus =
  | "uploading"
  | "scanning"
  | "ready"
  | "processing"
  | "quarantined"
  | "failed";

export interface DocumentPage {
  id: string;
  page_no: number;
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  thumbnail_url: string | null;
}

export interface DocumentVersion {
  id: string;
  version_no: number;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  page_count: number | null;
  operation_type: string | null;
  created_at: string;
}

export interface DocumentItem {
  id: string;
  folder_id: string | null;
  name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  current_version_no: number;
  is_favorite: boolean;
  is_duplicate: boolean;
  status: DocumentStatus;
  expires_at: string | null;
  deleted_at: string | null;
  page_count: number | null;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentDetailOut extends DocumentItem {
  versions: DocumentVersion[];
  pages: DocumentPage[];
  metadata: Record<string, unknown>;
}

export interface FolderItem {
  id: string;
  parent_id: string | null;
  name: string;
  created_at: string;
  updated_at: string;
}

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface JobRecord {
  id: string;
  job_type: string;
  status: JobStatus;
  progress: number;
  stage_message: string | null;
  source_version_id: string;
  output_document_id: string | null;
  output_version_id: string | null;
  result_meta: Record<string, unknown> | null;
  error_detail: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
}

export interface AgentPlanStep {
  step_no: number;
  tool_name: string;
  description: string;
  params: Record<string, unknown>;
  requires_approval: boolean;
}

export interface AgentCommandPlan {
  run_id: string;
  command_text: string;
  status: "awaiting_approval" | "completed" | "failed" | "unsupported";
  steps: AgentPlanStep[];
  summary: string;
  output_document_id?: string | null;
  job_id?: string | null;
}
