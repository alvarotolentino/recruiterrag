// Shared API types mirroring the FastAPI backend schemas.

export interface DimensionScore {
  dimension: string;
  score: number;
  justification?: string;
}

export interface WorkExperience {
  company: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  is_current?: boolean;
  responsibilities: string[];
}

export interface Candidate {
  id: string;
  full_name: string;
  email: string | null;
  years_exp: number | null;
  seniority: string | null;
  current_role: string | null;
  tech_stack: string[];
  education: string[];
  languages: string[];
  work_experience: WorkExperience[];
  remote_pref: string | null;
  location: string | null;
  summary: string | null;
  recruiter_notes: string | null;
  file_paths: string[];
  created_at: string | null;
  updated_at: string | null;
}

export interface CandidatePositionEntry {
  position_id: string;
  position_title: string;
  position_status: string;
  current_stage: string | null;
  fit_score: number | null;
  dimension_scores: DimensionScore[];
  stage_history: StageHistoryEntry[];
}

export interface CandidateDetailData extends Candidate {
  positions: CandidatePositionEntry[];
  section_sources: Record<string, 'ai' | 'recruiter'>;
}

export interface StageHistoryEntry {
  from_stage: string | null;
  to_stage: string;
  changed_at: string;
  note: string | null;
}

export interface ScoringDimension {
  name: string;
  description: string;
  weight: number;
  /** Expected minimum score (1–10) a candidate should reach on this dimension. */
  target?: number;
}

/** Default expected score applied when a dimension has no explicit target. */
export const DEFAULT_DIMENSION_TARGET = 7;

export type ExclusionType =
  | 'discipline'
  | 'min_years'
  | 'seniority_floor'
  | 'must_have_skill'
  | 'location'
  | 'custom';

export interface ExclusionCriterion {
  id: string;
  label: string;
  type: ExclusionType;
  rule?: Record<string, unknown>;
  description?: string;
  severity: 'hard' | 'soft';
  source?: 'ai' | 'recruiter';
  enabled: boolean;
}

export interface JDSchema {
  position_title: string;
  discipline: string;
  required_skills: string[];
  nice_to_have_skills: string[];
  seniority_level: string;
  min_years_experience: number | null;
  remote_preference: string | null;
  location: string | null;
  scoring_dimensions: ScoringDimension[];
  exclusion_criteria: ExclusionCriterion[];
  budget_range: string | null;
  team_size: string | null;
  key_responsibilities: string[];
}

export type PositionStatus = 'open' | 'paused' | 'closed_filled' | 'closed_cancelled';

export interface Position {
  id: string;
  title: string;
  description: string | null;
  extracted_schema: Partial<JDSchema>;
  stages: string[];
  status: PositionStatus;
  budget_range: string | null;
  remote_pref: string | null;
  location: string | null;
  min_years_exp: number | null;
  seniority: string | null;
  created_at: string | null;
  updated_at: string | null;
  closed_at: string | null;
  candidate_count?: number;
  scoring_job_id?: string | null;
}

export interface PipelineCandidateRow {
  pipeline_candidate_id: string;
  candidate_id: string;
  full_name: string;
  current_role: string | null;
  discipline?: string | null;
  seniority: string | null;
  years_exp: number | null;
  remote_pref: string | null;
  current_stage: string | null;
  fit_score: number | null;
  dimension_scores: DimensionScore[];
  status?: 'eligible' | 'excluded';
  exclusion_reason?: string | null;
  recruiter_notes: string | null;
  notes: PipelineNote[];
  added_at: string | null;
}

export interface PipelineNote {
  id: string;
  stage: string;
  content: string;
  created_at: string | null;
}

export type ResponseType =
  | 'prose'
  | 'list'
  | 'table'
  | 'chart_radar'
  | 'chart_scatter'
  | 'chart_funnel'
  | 'chart_bar';

export interface ChatEnvelopeData {
  candidates?: Array<{
    name: string;
    fit_score?: number;
    stage?: string;
    scores?: DimensionScore[];
  }>;
  table?: { columns: string[]; rows: Array<Array<string | number>> };
  funnel?: Array<{ stage: string; count: number }>;
  scatter?: Array<{ name: string; x: number; y: number }>;
  x_label?: string;
  y_label?: string;
  [key: string]: unknown;
}

export interface ChatMessageItem {
  message_id: string;
  role?: 'user' | 'assistant';
  response_type: ResponseType | null;
  text: string;
  data: ChatEnvelopeData;
  created_at: string;
}

export type DashboardPeriod = 'week' | 'month' | 'year';

export interface PipelinesMetrics {
  open: number;
  paused: number;
  filled: number;
  cancelled: number;
  open_new: number;
  paused_new: number;
  filled_new: number;
  cancelled_new: number;
}

export interface CandidatesMetrics {
  in_play: number;
  unique: number;
  new_registered: number;
  in_play_new: number;
  unique_new: number;
}

export interface StageMetrics {
  final_candidates: number;
  open_in_final: number;
  final_per_open: number;
  moves: number;
  avg_moves_per_pipeline: number;
}

export interface DashboardMetrics {
  period: DashboardPeriod;
  total_positions: number;
  total_candidates: number;
  pipelines: PipelinesMetrics;
  candidates: CandidatesMetrics;
  stage: StageMetrics;
  status_breakdown: Array<{ status: string; count: number }>;
  stage_breakdown: Array<{ stage: string; count: number }>;
  registration_trend: Array<{ bucket: string; count: number }>;
}

export interface StageDurationPoint {
  stage: string;
  avg_days: number | null;
  candidates: number;
  in_progress: boolean;
}

export interface PipelineStageDurations {
  position_id: string;
  title: string;
  stages: StageDurationPoint[];
}

export interface PipelineSummary {
  position_id: string;
  title: string;
  status: PositionStatus;
  candidate_count: number;
  stages: Array<{ stage: string; count: number }>;
  created_at: string | null;
  last_activity: string | null;
}

export interface IngestEvent {
  type: string;
  file?: string;
  index?: number;
  total?: number;
  step?: string;
  message?: string;
  candidate_id?: string;
  profile?: Record<string, unknown>;
  error?: string;
  status?: string;
  candidate_name?: string;
  fit_score?: number;
  done?: number;
  count?: number;
}

export interface TrainingDatasetStats {
  total_examples: number;
  dpo_pairs: number;
  sft_examples: number;
  grpo_prompts: number;
  with_cot: number;
  confidence_distribution: Record<string, number>;
}

export interface TrainingDataset {
  id: string;
  name: string;
  description: string | null;
  method: string | null;
  status: string;
  created_at: string | null;
  stats: TrainingDatasetStats;
}

export interface TrainingExample {
  id: string;
  dataset_id: string;
  example_type: string;
  prompt: string;
  chosen_response: string | null;
  rejected_response: string | null;
  cot_trace: string | null;
  recruiter_notes: string | null;
  confidence: string | null;
  source_pipeline_id: string | null;
  source_candidate_ids: string[];
  created_at: string | null;
}

export interface TrainingDatasetDetail extends TrainingDataset {
  examples: TrainingExample[];
}

export interface TrainingRun {
  id: string;
  dataset_id: string;
  method: string;
  base_model: string;
  lora_rank: number;
  epochs: number;
  learning_rate: number;
  use_qlora: boolean;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  adapter_path: string | null;
  gguf_path: string | null;
  eval_loss: number | null;
  notes: string | null;
  eval_summary: string | null;
  metrics: { loss_curve?: Array<{ step: number; loss: number }>; train_loss?: number };
  is_active: boolean;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
}

export interface HardwareInfo {
  device: 'cuda' | 'mps' | 'none';
  gpu_name: string | null;
  vram_gb: number | null;
  training_supported: boolean;
  recommended_mode: 'lora' | 'qlora' | null;
  message: string;
}

export interface HealthStatus {
  api: string;
  ollama: string;
  milvus: string;
  storage: string;
}
