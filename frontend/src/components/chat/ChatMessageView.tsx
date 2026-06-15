import type { ChatMessageItem } from '../../types';
import { BarRenderer } from './renderers/BarRenderer';
import { FunnelRenderer } from './renderers/FunnelRenderer';
import { ListRenderer } from './renderers/ListRenderer';
import { ProseRenderer } from './renderers/ProseRenderer';
import { RadarRenderer } from './renderers/RadarRenderer';
import { ScatterRenderer } from './renderers/ScatterRenderer';
import { TableRenderer } from './renderers/TableRenderer';

export interface ChatMessageViewProps {
  message: ChatMessageItem;
}

export function ChatMessageView({ message }: ChatMessageViewProps) {
  const isUser = message.role === 'user';
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-brand-600 px-4 py-2 text-sm text-white">
          {message.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <ProseRenderer text={message.text} />
        {message.response_type === 'list' && <ListRenderer data={message.data} />}
        {message.response_type === 'table' && <TableRenderer data={message.data} />}
        {message.response_type === 'chart_radar' && <RadarRenderer data={message.data} />}
        {message.response_type === 'chart_scatter' && <ScatterRenderer data={message.data} />}
        {message.response_type === 'chart_funnel' && <FunnelRenderer data={message.data} />}
        {message.response_type === 'chart_bar' && <BarRenderer data={message.data} />}
      </div>
    </div>
  );
}
