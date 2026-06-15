import type {
  Candidate,
  CandidateDetailData,
  ChatMessageItem,
  DashboardMetrics,
  DashboardPeriod,
  DimensionScore,
  HealthStatus,
  IngestEvent,
  JDSchema,
  PipelineCandidateRow,
  PipelineNote,
  PipelineStageDurations,
  PipelineSummary,
  Position,
  TrainingDataset,
  TrainingDatasetDetail,
  TrainingExample,
  TrainingRun,
  WorkExperience,
} from '../types';

const API_BASE = `${import.meta.env.VITE_API_URL ?? 'http://localhost:8000'}/api/v1`;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: init?.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

// ---- Candidates ----

export const ingestCandidates = (files: File[]): Promise<{ job_id: string; files: number }> => {
  const form = new FormData();
  files.forEach((f) => form.append('files', f));
  return request('/candidates/ingest', { method: 'POST', body: form });
};

export const listCandidates = (params?: { seniority?: string; remote_pref?: string; search?: string }) => {
  const qs = new URLSearchParams(
    Object.entries(params ?? {}).filter(([, v]) => v) as Array<[string, string]>,
  ).toString();
  return request<Candidate[]>(`/candidates${qs ? `?${qs}` : ''}`);
};

export const getCandidate = (id: string) => request<CandidateDetailData>(`/candidates/${id}`);

export interface CandidateUpdateBody {
  full_name?: string;
  email?: string;
  years_exp?: number;
  seniority?: string;
  current_role?: string;
  tech_stack?: string[];
  education?: string[];
  languages?: string[];
  work_experience?: WorkExperience[];
  remote_pref?: string;
  location?: string;
  summary?: string;
}

export const updateCandidate = (id: string, body: CandidateUpdateBody) =>
  request<Candidate>(`/candidates/${id}`, { method: 'PUT', body: JSON.stringify(body) });

export interface ReprocessConflict {
  section: string;
  current_value: string;
  new_value: string;
}

export interface ReprocessResult {
  candidate: CandidateDetailData;
  conflicts: ReprocessConflict[];
}

export const reprocessResume = (id: string, file: File): Promise<ReprocessResult> => {
  const fd = new FormData();
  fd.append('file', file);
  return request<ReprocessResult>(`/candidates/${id}/reprocess`, { method: 'POST', body: fd });
};

export const deleteCandidate = (id: string) =>
  request<{ ok: boolean }>(`/candidates/${id}`, { method: 'DELETE' });

// ---- Positions ----

export const extractJD = (jd_text: string) =>
  request<JDSchema>('/positions/extract-jd', { method: 'POST', body: JSON.stringify({ jd_text }) });

export interface CreatePositionBody {
  jd_text: string;
  title?: string;
  stages?: string[];
  budget_range?: string;
  remote_pref?: string;
  location?: string;
  min_years_exp?: number;
  extracted_schema?: Partial<JDSchema>;
  auto_match?: boolean;
}

export const createPosition = (body: CreatePositionBody) =>
  request<Position>('/positions', { method: 'POST', body: JSON.stringify(body) });

export const listPositions = (status?: string) =>
  request<Position[]>(`/positions${status ? `?status=${status}` : ''}`);

export const getPosition = (id: string) => request<Position>(`/positions/${id}`);

export interface UpdatePositionBody {
  title?: string;
  stages?: string[];
  extracted_schema?: Partial<JDSchema>;
}

export const updatePosition = (id: string, body: UpdatePositionBody) =>
  request<Position>(`/positions/${id}`, { method: 'PUT', body: JSON.stringify(body) });

export const updatePositionStatus = (id: string, status: string) =>
  request<Position>(`/positions/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });

export const getPipelineCandidates = (positionId: string, includeExcluded = false) =>
  request<{ candidates: PipelineCandidateRow[]; excluded_count: number }>(
    `/positions/${positionId}/candidates${includeExcluded ? '?include_excluded=true' : ''}`,
  );

export const includeExcludedCandidate = (positionId: string, candidateId: string) =>
  request<{ pipeline_candidate_id: string; status: string; fit_score: number }>(
    `/positions/${positionId}/candidates/${candidateId}/include`,
    { method: 'POST' },
  );

export const addCandidateToPipeline = (positionId: string, candidateId: string) =>
  request<{ pipeline_candidate_id: string; fit_score: number }>(`/positions/${positionId}/candidates`, {
    method: 'POST',
    body: JSON.stringify({ candidate_id: candidateId }),
  });

export const moveCandidateStage = (positionId: string, candidateId: string, stage: string, note?: string) =>
  request<{ ok: boolean }>(`/positions/${positionId}/candidates/${candidateId}/stage`, {
    method: 'PATCH',
    body: JSON.stringify({ stage, note }),
  });

export const addPipelineNote = (positionId: string, candidateId: string, stage: string, content: string) =>
  request<PipelineNote>(`/positions/${positionId}/candidates/${candidateId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ stage, content }),
  });

export const deletePipelineNote = (positionId: string, candidateId: string, noteId: string) =>
  request<{ ok: boolean }>(`/positions/${positionId}/candidates/${candidateId}/notes/${noteId}`, {
    method: 'DELETE',
  });

export const rescoreCandidate = (positionId: string, candidateId: string) =>
  request<{ fit_score: number; dimension_scores: DimensionScore[] }>(
    `/positions/${positionId}/candidates/${candidateId}/rescore`,
    { method: 'POST' },
  );

export const rescorePipeline = (positionId: string) =>
  request<{ scoring_job_id: string }>(`/positions/${positionId}/rescore`, { method: 'POST' });

export const findNewCandidates = (positionId: string) =>
  request<{ scoring_job_id: string }>(`/positions/${positionId}/match`, { method: 'POST' });

// ---- Chat ----

export const sendChatMessage = (positionId: string, message: string) =>
  request<ChatMessageItem>(`/positions/${positionId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });

export const getChatHistory = (positionId: string) =>
  request<ChatMessageItem[]>(`/positions/${positionId}/chat/history`);

export const clearChatHistory = (positionId: string) =>
  request<{ ok: boolean }>(`/positions/${positionId}/chat/history`, { method: 'DELETE' });

// ---- Dashboard / settings / health ----

export const getDashboardMetrics = (period: DashboardPeriod = 'month') =>
  request<DashboardMetrics>(`/dashboard/metrics?period=${period}`);
export const getPipelineSummary = () => request<PipelineSummary[]>('/dashboard/pipeline-summary');
export const getStageDurations = () =>
  request<PipelineStageDurations[]>('/dashboard/stage-durations');
export const getSettings = () => request<Record<string, string>>('/settings');
export const putSetting = (key: string, value: string) =>
  request<Record<string, string>>(`/settings/${key}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });
export const getHealth = () => request<HealthStatus>('/health');

// ---- Training ----

export const createDataset = (body: { name: string; description?: string; method?: string }) =>
  request<{ id: string; name: string; status: string }>('/training/datasets', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const listDatasets = () => request<TrainingDataset[]>('/training/datasets');
export const getDataset = (id: string) => request<TrainingDatasetDetail>(`/training/datasets/${id}`);

export const updateExample = (
  datasetId: string,
  exampleId: string,
  body: Partial<Pick<TrainingExample, 'prompt' | 'chosen_response' | 'rejected_response' | 'cot_trace' | 'recruiter_notes' | 'confidence'>>,
) =>
  request<TrainingExample>(`/training/datasets/${datasetId}/examples/${exampleId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

export const deleteExample = (datasetId: string, exampleId: string) =>
  request<{ ok: boolean }>(`/training/datasets/${datasetId}/examples/${exampleId}`, {
    method: 'DELETE',
  });

export const generatePairs = (datasetId: string, positionId: string) =>
  request<{ created: number }>(`/training/datasets/${datasetId}/generate-pairs`, {
    method: 'POST',
    body: JSON.stringify({ position_id: positionId }),
  });

export interface SubmitRunBody {
  dataset_id: string;
  method: string;
  base_model?: string;
  lora_rank?: number;
  epochs?: number;
  learning_rate?: number;
  use_qlora?: boolean;
  notes?: string;
}

export const submitTrainingRun = (body: SubmitRunBody) =>
  request<TrainingRun>('/training/runs', { method: 'POST', body: JSON.stringify(body) });

export const listTrainingRuns = () => request<TrainingRun[]>('/training/runs');
export const getTrainingRun = (id: string) => request<TrainingRun>(`/training/runs/${id}`);

export const activateRun = (id: string) =>
  request<{ ok: boolean }>(`/training/runs/${id}/activate`, { method: 'POST' });

export const deactivateAdapter = () =>
  request<{ ok: boolean }>('/training/runs/deactivate', { method: 'POST' });

export interface ModelComparison {
  candidate_name: string;
  position_title: string;
  dimensions: string[];
  base: ComparisonSide;
  fine_tuned: ComparisonSide;
}

export interface ComparisonSide {
  backend: string;
  ok: boolean;
  fit_score?: number;
  scores?: Array<{ dimension: string; score: number; justification?: string }>;
  error?: string;
}

export const compareModels = (positionId: string, candidateId: string) =>
  request<ModelComparison>('/training/compare', {
    method: 'POST',
    body: JSON.stringify({ position_id: positionId, candidate_id: candidateId }),
  });

export const searchTrainingContext = (q: string, table = 'examples') =>
  request<Array<Record<string, unknown>>>(
    `/training/context/search?q=${encodeURIComponent(q)}&table=${table}`,
  );

// ---- SSE helpers ----

export function subscribeToJob(
  path: string,
  onEvent: (event: IngestEvent) => void,
  onDone?: () => void,
): () => void {
  const source = new EventSource(`${API_BASE}${path}`);
  const handler = (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data) as IngestEvent;
      onEvent(data);
      if (data.type === 'done') {
        source.close();
        onDone?.();
      }
    } catch {
      /* ignore malformed events */
    }
  };
  // The backend emits named events per type; listen to all of them plus default.
  ['message', 'step', 'ocr', 'file_done', 'file_error', 'matched', 'scored', 'excluded', 'score_error', 'error', 'done'].forEach(
    (name) => source.addEventListener(name, handler as EventListener),
  );
  source.onerror = () => {
    source.close();
    onDone?.();
  };
  return () => source.close();
}

export const subscribeToIngestion = (jobId: string, onEvent: (e: IngestEvent) => void, onDone?: () => void) =>
  subscribeToJob(`/candidates/ingest/${jobId}/progress`, onEvent, onDone);

export const subscribeToScoring = (positionId: string, onEvent: (e: IngestEvent) => void, onDone?: () => void) =>
  subscribeToJob(`/positions/${positionId}/score/progress`, onEvent, onDone);
