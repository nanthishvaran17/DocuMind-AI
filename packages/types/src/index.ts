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

export type ThemePreference = "light" | "dark" | "system";
export type DensityPreference = "comfortable" | "compact";
export type AiResponseStyle = "balanced" | "concise" | "detailed" | "academic";
export type SearchModePreference = "hybrid" | "semantic" | "keyword";

export interface UserPreferences {
  theme: ThemePreference;
  density: DensityPreference;
  ai_response_style: AiResponseStyle;
  custom_instructions: string;
  default_search_mode: SearchModePreference;
  default_top_k: number;
  show_citation_snippets: boolean;
  auto_index_uploads: boolean;
  agent_show_execution_log: boolean;
  default_compress_kb: number;
  default_ocr_lang: OcrLanguage;
  default_docx_mode: DocxConversionMode;
  default_photo_preset: string;
  confirm_before_delete: boolean;
  keyboard_shortcuts_enabled: boolean;
  analytics_opt_out: boolean;
}

export interface UserSessionItem {
  id: string;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
  is_current: boolean;
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
  id?: string;
  step_no: number;
  tool_name: string;
  description: string;
  params: Record<string, unknown>;
  requires_approval: boolean;
  approval_status?: "pending" | "approved" | "rejected" | "skipped";
  execution_status?: "pending" | "running" | "completed" | "failed" | "skipped";
  job_id?: string | null;
  output_document_id?: string | null;
  output_version_id?: string | null;
  output_preview?: string | null;
  error?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface AgentExecutionLogEntry {
  timestamp: string;
  step_no: number | null;
  event: string;
  message: string;
  meta?: Record<string, unknown>;
}

export interface AgentCommandPlan {
  run_id: string;
  command_text: string;
  status: "planning" | "awaiting_approval" | "running" | "completed" | "failed" | "cancelled" | "unsupported";
  steps: AgentPlanStep[];
  summary: string;
  current_step_no?: number;
  document_ids?: string[];
  execution_log?: AgentExecutionLogEntry[];
  output_document_id?: string | null;
  job_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SemanticSearchHit {
  chunk_id: string;
  document_id: string;
  document_name: string;
  mime_type: string;
  version_no: number;
  page_no: number | null;
  section_title: string | null;
  snippet: string;
  score: number;
  vector_score: number;
  lexical_score: number;
}

export interface RagCitation {
  index: number;
  chunk_id: string;
  document_id: string;
  document_name: string;
  version_no: number;
  page_no: number | null;
  section_title: string | null;
  snippet: string;
  score: number;
}

export interface QaMessageItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: RagCitation[];
  model_used: string | null;
  created_at: string;
}

export interface QaThreadItem {
  id: string;
  document_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
  messages?: QaMessageItem[];
}

export interface QaAskResponse {
  thread_id: string;
  message_id: string;
  answer: string;
  citations: RagCitation[];
  model_used: string;
  retrieved_count: number;
}

export interface DocumentIndexStatus {
  document_id: string;
  version_id: string;
  version_no: number;
  indexed: boolean;
  chunk_count: number;
  embedding_model: string | null;
  sample_chunks: Array<{
    id: string;
    chunk_index: number;
    page_no: number | null;
    section_title: string | null;
    token_count: number;
    preview: string;
  }>;
}

export interface DocumentSummaryResponse {
  document_id: string;
  document_name: string;
  summary: string;
  key_points: string[];
  citations: RagCitation[];
  model_used: string;
}

export type ConversionTargetFormat =
  | "pdf"
  | "docx"
  | "xlsx"
  | "pptx"
  | "md"
  | "txt"
  | "html"
  | "csv"
  | "json"
  | "png"
  | "jpg";

export type DocxConversionMode = "editable" | "high_fidelity" | "hybrid";
export type OcrLanguage = "eng" | "tam" | "eng+tam";

export interface ConversionQualityPageMetric {
  page_no: number;
  ssim: number | null;
  char_similarity: number | null;
  has_source_preview: boolean;
  has_converted_preview: boolean;
}

export interface ConversionQualityReport {
  id: string;
  job_id: string;
  source_version_id: string;
  output_version_id: string;
  source_format: string;
  target_format: string;
  conversion_mode: string;
  source_page_count: number;
  converted_page_count: number;
  page_count_match: boolean;
  char_similarity: number;
  word_similarity: number;
  mean_ssim: number | null;
  ssim_status: string;
  source_table_count: number;
  converted_table_count: number;
  source_image_count: number;
  converted_image_count: number;
  missing_text_snippets: string[];
  font_warnings: Array<Record<string, string>>;
  warnings: string[];
  page_metrics: ConversionQualityPageMetric[];
  available_preview_pages: number[];
  created_at: string;
}

export interface ExtractedTableItem {
  page_no: number;
  table_index: number;
  detection_strategy: string;
  rows_count: number;
  cols_count: number;
  rows: string[][];
}

export interface ExtractedTablesResult {
  document_id: string;
  document_name: string;
  tables_count: number;
  tables: ExtractedTableItem[];
}
