import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon: string;
  title: string;
  message: string;
  children?: ReactNode;
}

export function EmptyState({ icon, title, message, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-8 py-16 text-center">
      <span className="text-4xl" aria-hidden>
        {icon}
      </span>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-slate-500">{message}</p>
      {children && <div className="mt-5 flex gap-3">{children}</div>}
    </div>
  );
}
