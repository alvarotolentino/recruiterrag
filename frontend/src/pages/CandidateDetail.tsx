import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  deleteCandidate,
  getCandidate,
  reprocessResume,
  updateCandidate,
  type ReprocessConflict,
} from '../api/client';
import { ProfileSectionEditor } from '../components/candidates/ProfileSectionEditor';
import { ResumeConflictBanner } from '../components/candidates/ResumeConflictBanner';
import { ScoreSpider } from '../components/candidates/ScoreSpider';
import { StageTracker } from '../components/candidates/StageTracker';
import { WorkExperienceEditor } from '../components/candidates/WorkExperienceEditor';
import { WorkHistory } from '../components/candidates/WorkHistory';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { StatusBadge } from '../components/shared/StatusBadge';
import { TagInput } from '../components/shared/TagInput';
import type { WorkExperience } from '../types';

// ── Chip ─────────────────────────────────────────────────────────────────────

function Chip({ label, variant = 'neutral' }: { label: string; variant?: 'neutral' | 'success' }) {
  const colors =
    variant === 'success'
      ? 'bg-emerald-100 text-emerald-700'
      : 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${colors}`}>
      {label}
    </span>
  );
}

// ── Upload icon ───────────────────────────────────────────────────────────────

function UploadIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path
        fillRule="evenodd"
        d="M10 3a.75.75 0 01.75.75V8.5h2.72a.75.75 0 010 1.06l-3 3a.75.75 0 01-1.06 0l-3-3a.75.75 0 010-1.06H9.25V3.75A.75.75 0 0110 3zM3.5 14.25a.75.75 0 011.5 0v1a.75.75 0 001.5 0v-1a.75.75 0 011.5 0v1a.75.75 0 001.5 0v-1a.75.75 0 011.5 0v1a.25.25 0 00.25.25h1A.75.75 0 0014 16.5H6a.75.75 0 01-.75-.75v-1.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

const SENIORITY_OPTIONS = ['Intern', 'Junior', 'Mid', 'Senior', 'Lead', 'Principal', 'Staff', 'Director'];
const REMOTE_OPTIONS = ['remote', 'hybrid', 'on-site'];

// ── Main component ────────────────────────────────────────────────────────────

export default function CandidateDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [deleteDialog, setDeleteDialog] = useState(false);
  const [expOpen, setExpOpen] = useState(true);
  const [conflicts, setConflicts] = useState<ReprocessConflict[]>([]);
  const [reprocessing, setReprocessing] = useState(false);

  // Editable draft states — null means "not in edit mode yet, use candidate data"
  const [draftSummary, setDraftSummary] = useState<string | null>(null);
  const [draftSkills, setDraftSkills] = useState<string[] | null>(null);
  const [draftExp, setDraftExp] = useState<WorkExperience[] | null>(null);
  const [draftRole, setDraftRole] = useState<string | null>(null);
  const [draftYears, setDraftYears] = useState<string | null>(null);
  const [draftSeniority, setDraftSeniority] = useState<string | null>(null);
  const [draftRemote, setDraftRemote] = useState<string | null>(null);
  const [draftLocation, setDraftLocation] = useState<string | null>(null);
  const [draftEducation, setDraftEducation] = useState<string[] | null>(null);
  const [draftLanguages, setDraftLanguages] = useState<string[] | null>(null);

  const { data: candidate, isLoading } = useQuery({
    queryKey: ['candidate', id],
    queryFn: () => getCandidate(id),
    enabled: Boolean(id),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCandidate(id),
    onSuccess: () => {
      toast.success('Candidate removed');
      navigate('/candidates');
    },
  });

  const saveMutation = useMutation({
    mutationFn: (body: Parameters<typeof updateCandidate>[1]) => updateCandidate(id, body),
    onSuccess: () => {
      toast.success('Saved');
      queryClient.invalidateQueries({ queryKey: ['candidate', id] });
    },
    onError: () => toast.error('Save failed'),
  });

  if (isLoading || !candidate) return <LoadingSpinner label="Loading profile…" />;

  // ── Derived pipeline chips ────────────────────────────────────────────────

  const activeCount = candidate.positions.filter(
    (p) => p.position_status === 'open' || p.position_status === 'paused',
  ).length;
  const reachedOfferCount = candidate.positions.filter((p) =>
    p.stage_history.some((s) => s.to_stage === 'Offer' || s.to_stage === 'Hired'),
  ).length;
  const hiredCount = candidate.positions.filter((p) =>
    p.stage_history.some((s) => s.to_stage === 'Hired'),
  ).length;

  // ── Save helpers ──────────────────────────────────────────────────────────

  const saveSection = async (body: Parameters<typeof updateCandidate>[1]) => {
    await saveMutation.mutateAsync(body);
  };

  // ── Conflict helpers ──────────────────────────────────────────────────────

  const dismissConflict = (section: string) =>
    setConflicts((prev) => prev.filter((c) => c.section !== section));

  const useNewVersion = async (conflict: ReprocessConflict) => {
    const { section, new_value } = conflict;
    const jsonFields = ['tech_stack', 'work_experience', 'education', 'languages'];
    const body: Parameters<typeof updateCandidate>[1] = {};
    if (jsonFields.includes(section)) {
      try {
        (body as Record<string, unknown>)[section] = JSON.parse(new_value);
      } catch {
        (body as Record<string, unknown>)[section] = new_value;
      }
    } else {
      (body as Record<string, unknown>)[section] = new_value;
    }
    await saveSection(body);
    dismissConflict(section);
  };

  // ── Resume re-upload ──────────────────────────────────────────────────────

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setReprocessing(true);
    try {
      const result = await reprocessResume(id, file);
      queryClient.setQueryData(['candidate', id], result.candidate);
      setConflicts(result.conflicts);
      if (result.conflicts.length === 0) {
        toast.success('Resume updated successfully');
      } else {
        toast(`Resume updated — ${result.conflicts.length} section(s) need your review`, { icon: '⚠' });
      }
    } catch {
      toast.error('Resume update failed');
    } finally {
      setReprocessing(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const conflictFor = (section: string) => conflicts.find((c) => c.section === section);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{candidate.full_name}</h1>
          <p className="text-slate-500">
            {candidate.current_role ?? '—'}
            {candidate.seniority ? ` · ${candidate.seniority}` : ''}
            {candidate.years_exp != null ? ` · ${candidate.years_exp} yrs` : ''}
          </p>
          {candidate.email && <p className="text-sm text-slate-400">{candidate.email}</p>}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Chip label={`${activeCount} active`} />
            <Chip label={`${reachedOfferCount} reached offer`} />
            {hiredCount > 0 && <Chip label={`${hiredCount} hired`} variant="success" />}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc,.txt,.rtf"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={reprocessing}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {reprocessing ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
            ) : (
              <UploadIcon />
            )}
            {reprocessing ? 'Updating…' : 'Upload new resume'}
          </button>
          <button
            onClick={() => setDeleteDialog(true)}
            className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Summary */}
      <ProfileSectionEditor
        title="Summary"
        onSave={() =>
          saveSection({ summary: draftSummary ?? candidate.summary ?? '' })
        }
        onCancel={() => setDraftSummary(null)}
      >
        {(editing) =>
          editing ? (
            <textarea
              rows={5}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              value={draftSummary ?? candidate.summary ?? ''}
              onChange={(e) => setDraftSummary(e.target.value)}
            />
          ) : (
            <p className="text-sm">{candidate.summary ?? <span className="text-slate-400">No summary extracted.</span>}</p>
          )
        }
      </ProfileSectionEditor>
      {conflictFor('summary') && (
        <ResumeConflictBanner
          section="summary"
          newValue={conflictFor('summary')!.new_value}
          onUseNew={() => useNewVersion(conflictFor('summary')!)}
          onKeep={() => dismissConflict('summary')}
        />
      )}

      {/* Professional Experience */}
      <ProfileSectionEditor
        title="Professional experience"
        collapsible
        open={expOpen}
        onToggle={() => setExpOpen((v) => !v)}
        onSave={() =>
          saveSection({ work_experience: draftExp ?? candidate.work_experience })
        }
        onCancel={() => setDraftExp(null)}
      >
        {(editing) =>
          editing ? (
            <WorkExperienceEditor
              experience={draftExp ?? candidate.work_experience}
              onChange={setDraftExp}
            />
          ) : (
            <WorkHistory experience={candidate.work_experience} />
          )
        }
      </ProfileSectionEditor>
      {conflictFor('work_experience') && (
        <ResumeConflictBanner
          section="work_experience"
          newValue={conflictFor('work_experience')!.new_value}
          onUseNew={() => useNewVersion(conflictFor('work_experience')!)}
          onKeep={() => dismissConflict('work_experience')}
        />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Skills */}
        <div className="space-y-2">
          <ProfileSectionEditor
            title="Skills"
            onSave={() =>
              saveSection({ tech_stack: draftSkills ?? candidate.tech_stack })
            }
            onCancel={() => setDraftSkills(null)}
          >
            {(editing) =>
              editing ? (
                <TagInput
                  tags={draftSkills ?? candidate.tech_stack}
                  onChange={setDraftSkills}
                  placeholder="Add skill…"
                />
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {candidate.tech_stack.map((skill) => (
                    <span key={skill} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs">
                      {skill}
                    </span>
                  ))}
                  {candidate.tech_stack.length === 0 && (
                    <p className="text-sm text-slate-400">None extracted</p>
                  )}
                </div>
              )
            }
          </ProfileSectionEditor>
          {conflictFor('tech_stack') && (
            <ResumeConflictBanner
              section="tech_stack"
              newValue={conflictFor('tech_stack')!.new_value}
              onUseNew={() => useNewVersion(conflictFor('tech_stack')!)}
              onKeep={() => dismissConflict('tech_stack')}
            />
          )}
        </div>

        {/* Details */}
        <div className="space-y-2">
          <ProfileSectionEditor
            title="Details"
            onSave={() =>
              saveSection({
                current_role: draftRole ?? candidate.current_role ?? undefined,
                years_exp: draftYears != null ? parseFloat(draftYears) || undefined : undefined,
                seniority: draftSeniority ?? candidate.seniority ?? undefined,
                remote_pref: draftRemote ?? candidate.remote_pref ?? undefined,
                location: draftLocation ?? candidate.location ?? undefined,
                education: draftEducation ?? candidate.education,
                languages: draftLanguages ?? candidate.languages,
              })
            }
            onCancel={() => {
              setDraftRole(null);
              setDraftYears(null);
              setDraftSeniority(null);
              setDraftRemote(null);
              setDraftLocation(null);
              setDraftEducation(null);
              setDraftLanguages(null);
            }}
          >
            {(editing) =>
              editing ? (
                <div className="space-y-2">
                  <div>
                    <label className="mb-0.5 block text-[11px] text-slate-500">Current role</label>
                    <input
                      className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none"
                      value={draftRole ?? candidate.current_role ?? ''}
                      onChange={(e) => setDraftRole(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-0.5 block text-[11px] text-slate-500">Years exp.</label>
                      <input
                        type="number"
                        min={0}
                        max={50}
                        className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none"
                        value={draftYears ?? (candidate.years_exp?.toString() ?? '')}
                        onChange={(e) => setDraftYears(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[11px] text-slate-500">Seniority</label>
                      <select
                        className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none"
                        value={draftSeniority ?? candidate.seniority ?? ''}
                        onChange={(e) => setDraftSeniority(e.target.value)}
                      >
                        <option value="">—</option>
                        {SENIORITY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-0.5 block text-[11px] text-slate-500">Work style</label>
                      <select
                        className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none"
                        value={draftRemote ?? candidate.remote_pref ?? ''}
                        onChange={(e) => setDraftRemote(e.target.value)}
                      >
                        <option value="">—</option>
                        {REMOTE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[11px] text-slate-500">Location</label>
                      <input
                        className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none"
                        value={draftLocation ?? candidate.location ?? ''}
                        onChange={(e) => setDraftLocation(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[11px] text-slate-500">Education</label>
                    <TagInput
                      tags={draftEducation ?? candidate.education}
                      onChange={setDraftEducation}
                      placeholder="Add degree…"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[11px] text-slate-500">Languages</label>
                    <TagInput
                      tags={draftLanguages ?? candidate.languages}
                      onChange={setDraftLanguages}
                      placeholder="Add language…"
                    />
                  </div>
                </div>
              ) : (
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Work style</dt>
                    <dd>{candidate.remote_pref ?? '—'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Location</dt>
                    <dd>{candidate.location ?? '—'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Education</dt>
                    <dd className="text-right">{candidate.education.join(', ') || '—'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Languages</dt>
                    <dd>{candidate.languages.join(', ') || '—'}</dd>
                  </div>
                </dl>
              )
            }
          </ProfileSectionEditor>
          {(['current_role', 'years_exp', 'seniority', 'remote_pref', 'location', 'education', 'languages'] as const).map(
            (sec) =>
              conflictFor(sec) && (
                <ResumeConflictBanner
                  key={sec}
                  section={sec}
                  newValue={conflictFor(sec)!.new_value}
                  onUseNew={() => useNewVersion(conflictFor(sec)!)}
                  onKeep={() => dismissConflict(sec)}
                />
              ),
          )}
        </div>
      </div>

      {/* Positions evaluated for */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Positions evaluated for</h2>
        {candidate.positions.length === 0 && (
          <p className="text-sm text-slate-400">Not in any pipeline yet.</p>
        )}
        <div className="space-y-4">
          {candidate.positions.map((p) => (
            <div key={p.position_id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <Link
                  to={`/positions/${p.position_id}`}
                  className="font-semibold text-brand-700 hover:underline"
                >
                  {p.position_title}
                </Link>
                <div className="flex items-center gap-2">
                  <StatusBadge status={p.position_status} />
                  {p.fit_score != null && (
                    <span className="text-sm font-bold text-brand-700">{p.fit_score.toFixed(1)}/10</span>
                  )}
                </div>
              </div>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <ScoreSpider scores={p.dimension_scores} name={candidate.full_name} />
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">Stage history</h3>
                  <StageTracker history={p.stage_history} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <ConfirmDialog
        open={deleteDialog}
        title="Delete this candidate?"
        message={`${candidate.full_name} will be removed from your talent pool and all pipelines. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setDeleteDialog(false)}
      />
    </div>
  );
}
