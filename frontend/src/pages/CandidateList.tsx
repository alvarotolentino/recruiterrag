import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { listCandidates } from '../api/client';
import { EmptyState } from '../components/shared/EmptyState';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { FirstUseHint } from '../components/onboarding/FirstUseHint';

const SENIORITIES = ['', 'junior', 'mid', 'senior', 'lead', 'principal'];
const REMOTE_PREFS = ['', 'remote', 'hybrid', 'on-site', 'flexible'];

export default function CandidateList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [seniority, setSeniority] = useState('');
  const [remotePref, setRemotePref] = useState('');

  const { data: candidates, isLoading } = useQuery({
    queryKey: ['candidates', { seniority, remotePref, search }],
    queryFn: () =>
      listCandidates({
        seniority: seniority || undefined,
        remote_pref: remotePref || undefined,
        search: search || undefined,
      }),
  });

  return (
    <div className="space-y-4" data-tour="candidates">
      <FirstUseHint
        id="candidates"
        text="Drop resumes here — PDF, Word, or images. The AI will extract the key information."
      />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Talent Pool</h1>
        <button
          onClick={() => navigate('/candidates/add')}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + Add Candidates
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, role, or skill…"
          aria-label="Search candidates"
          className="w-72 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        />
        <select
          value={seniority}
          onChange={(e) => setSeniority(e.target.value)}
          aria-label="Filter by seniority"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {SENIORITIES.map((s) => (
            <option key={s} value={s}>
              {s || 'Any seniority'}
            </option>
          ))}
        </select>
        <select
          value={remotePref}
          onChange={(e) => setRemotePref(e.target.value)}
          aria-label="Filter by remote preference"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {REMOTE_PREFS.map((r) => (
            <option key={r} value={r}>
              {r || 'Any work style'}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <LoadingSpinner />}
      {!isLoading && (candidates ?? []).length === 0 && (
        <EmptyState
          icon="👤"
          title="Your talent pool is empty"
          message="Upload resumes to build your candidate database."
        >
          <button
            onClick={() => navigate('/candidates/add')}
            className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            + Add Candidates
          </button>
        </EmptyState>
      )}

      {(candidates ?? []).length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Current role</th>
                <th className="px-4 py-3 font-semibold">Experience</th>
                <th className="px-4 py-3 font-semibold">Work style</th>
                <th className="px-4 py-3 font-semibold">Top skills</th>
              </tr>
            </thead>
            <tbody>
              {(candidates ?? []).map((c) => (
                <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link to={`/candidates/${c.id}`} className="font-medium text-brand-700 hover:underline">
                      {c.full_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.current_role ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.years_exp != null ? `${c.years_exp} yrs` : '—'}
                    {c.seniority ? ` · ${c.seniority}` : ''}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.remote_pref ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.tech_stack.slice(0, 4).map((skill) => (
                        <span key={skill} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                          {skill}
                        </span>
                      ))}
                      {c.tech_stack.length > 4 && (
                        <span className="text-xs text-slate-400">+{c.tech_stack.length - 4}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
