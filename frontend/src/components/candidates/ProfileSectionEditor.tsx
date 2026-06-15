import { type ReactNode, useState } from 'react';

interface ProfileSectionEditorProps {
  title: string;
  onSave: () => Promise<void>;
  onCancel?: () => void;
  children: (editing: boolean) => ReactNode;
  /** Optional: wrap the whole card in a collapsible. Pass open/onToggle to control it. */
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
}

function PencilIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
      className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}>
      <path fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd" />
    </svg>
  );
}

export function ProfileSectionEditor({
  title,
  onSave,
  onCancel,
  children,
  collapsible = false,
  open = true,
  onToggle,
}: ProfileSectionEditorProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    onCancel?.();
    setEditing(false);
  };

  const showContent = !collapsible || open;

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={collapsible ? onToggle : undefined}
          className={`flex items-center gap-2 ${collapsible ? 'flex-1 text-left' : ''}`}
        >
          <h2 className="text-sm font-semibold text-slate-600">{title}</h2>
          {collapsible && <ChevronIcon open={open} />}
        </button>

        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label={`Edit ${title}`}
          >
            <PencilIcon />
            Edit
          </button>
        ) : (
          <div className="flex items-center gap-2">
            {saving && <span className="text-xs text-slate-400">Saving…</span>}
            {!saving && <span className="text-xs text-amber-500">Unsaved changes</span>}
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-brand-600 px-3 py-1 text-xs text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        )}
      </div>

      {showContent && (
        <div className="px-4 pb-4">
          {children(editing)}
        </div>
      )}
    </div>
  );
}
