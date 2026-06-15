import type { ChatEnvelopeData } from '../../../types';

export interface TableRendererProps {
  data: ChatEnvelopeData;
}

export function TableRenderer({ data }: TableRendererProps) {
  const table = data.table;
  if (!table || table.columns.length === 0) return null;
  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            {table.columns.map((col) => (
              <th key={col} className="px-3 py-2 text-left font-semibold text-slate-700">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={`${row[0]}-${i}`} className="border-t border-slate-100">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
