import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useState } from 'react';
import type { PipelineCandidateRow } from '../../types';

export interface StageBoardProps {
  stages: string[];
  candidates: PipelineCandidateRow[];
  onMove: (candidateId: string, stage: string) => void;
}

function CandidateCard({ row, overlay = false }: { row: PipelineCandidateRow; overlay?: boolean }) {
  return (
    <div
      className={`rounded-lg border border-slate-200 bg-white p-2 text-xs shadow-sm ${
        overlay ? 'rotate-2 shadow-lg' : ''
      }`}
    >
      <p className="font-medium">{row.full_name}</p>
      <div className="mt-1 flex items-center justify-between text-slate-500">
        <span className="truncate">{row.current_role ?? ''}</span>
        {row.fit_score != null && (
          <span className="ml-1 shrink-0 font-bold text-brand-700">{row.fit_score.toFixed(1)}</span>
        )}
      </div>
    </div>
  );
}

function DraggableCard({ row }: { row: PipelineCandidateRow }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: row.candidate_id,
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`cursor-grab touch-none active:cursor-grabbing ${isDragging ? 'opacity-30' : ''}`}
    >
      <CandidateCard row={row} />
    </div>
  );
}

function StageColumn({ stage, rows }: { stage: string; rows: PipelineCandidateRow[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div
      ref={setNodeRef}
      className={`flex w-44 shrink-0 flex-col rounded-xl border p-2 transition ${
        isOver ? 'border-brand-400 bg-brand-50' : 'border-slate-200 bg-slate-50'
      }`}
    >
      <p className="mb-2 flex items-center justify-between px-1 text-xs font-semibold text-slate-600">
        {stage}
        <span className="rounded-full bg-slate-200 px-1.5 text-[10px]">{rows.length}</span>
      </p>
      <div className="min-h-16 flex-1 space-y-1.5">
        {rows.map((row) => (
          <DraggableCard key={row.candidate_id} row={row} />
        ))}
      </div>
    </div>
  );
}

/** Kanban view of the pipeline — drag candidates between stage columns (@dnd-kit). */
export function StageBoard({ stages, candidates, onMove }: StageBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id));

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const candidateId = String(active.id);
    const targetStage = String(over.id);
    const current = candidates.find((c) => c.candidate_id === candidateId);
    if (current && current.current_stage !== targetStage) {
      onMove(candidateId, targetStage);
    }
  };

  const activeRow = candidates.find((c) => c.candidate_id === activeId);

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {stages.map((stage) => (
          <StageColumn
            key={stage}
            stage={stage}
            rows={candidates.filter((c) => c.current_stage === stage)}
          />
        ))}
      </div>
      <DragOverlay>{activeRow ? <CandidateCard row={activeRow} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}
