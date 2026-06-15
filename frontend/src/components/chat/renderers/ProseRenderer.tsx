import ReactMarkdown from 'react-markdown';

export interface ProseRendererProps {
  text: string;
}

export function ProseRenderer({ text }: ProseRendererProps) {
  return (
    <div className="prose-sm max-w-none text-sm leading-relaxed [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown>{text}</ReactMarkdown>
    </div>
  );
}
