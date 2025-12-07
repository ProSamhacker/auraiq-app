'use client';

import { FC, useState, useCallback, memo } from "react";
import { Message } from "../lib/types";
import { BotIcon, UserIcon, CopyIcon, CheckIcon, ThumbsUp, ThumbsDown, RefreshCw } from "lucide-react";
import { FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "@/styles/oneDark";

interface ChatBubbleProps {
  message: Message;
  onRegenerate?: () => void;
  onFeedback?: (messageId: string, feedback: 'positive' | 'negative') => void;
}

// OPTIMIZATION: Memoize code block component
const CodeBlock = memo(({ 
  language, 
  code, 
  messageId 
}: { 
  language: string; 
  code: string; 
  messageId: string;
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const blockId = `${messageId}-${language}-${code.substring(0, 20)}`;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  }, [code]);

  return (
    <div className="relative group my-4">
      <div className="flex items-center justify-between bg-gray-900 px-4 py-2 rounded-t-lg border-b border-gray-700">
        <span className="text-xs font-mono text-gray-400 uppercase">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 px-2 py-1 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded transition-colors"
        >
          {isCopied ? (
            <>
              <CheckIcon className="w-3.5 h-3.5 text-green-500" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <CopyIcon className="w-3.5 h-3.5" />
              <span>Copy code</span>
            </>
          )}
        </button>
      </div>
      
      <div className="overflow-x-auto bg-[#0d1117] rounded-b-lg">
        <SyntaxHighlighter
          style={oneDark}
          language={language}
          PreTag="div"
          className="!m-0 !p-4 text-sm leading-relaxed"
          showLineNumbers={code.split('\n').length > 5}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}, (prev, next) => prev.code === next.code && prev.language === next.language);

CodeBlock.displayName = 'CodeBlock';

// OPTIMIZATION: Memoize markdown content
const MarkdownContent = memo(({ content, messageId }: { content: string; messageId: string }) => {
  const customComponents = {
    code({
      inline,
      className,
      children,
      ...props
    }: {
      inline?: boolean;
      className?: string;
      children?: React.ReactNode;
    }) {
      const match = /language-(\w+)/.exec(className || "");
      const language = match ? match[1] : 'text';
      const code = String(children).replace(/\n$/, "");

      if (!inline && code.length > 0) {
        return <CodeBlock language={language} code={code} messageId={messageId} />;
      }

      return (
        <code
          className="bg-blue-900/30 text-blue-300 rounded px-1.5 py-0.5 text-sm font-mono border border-blue-800/30"
          {...props}
        >
          {children}
        </code>
      );
    },

    table: ({ children, ...props }: { children?: React.ReactNode }) => (
      <div className="my-4 overflow-x-auto rounded-lg border border-gray-700">
        <table className="min-w-full divide-y divide-gray-700" {...props}>
          {children}
        </table>
      </div>
    ),
    thead: ({ children, ...props }: { children?: React.ReactNode }) => (
      <thead className="bg-gray-800/50" {...props}>
        {children}
      </thead>
    ),
    tbody: ({ children, ...props }: { children?: React.ReactNode }) => (
      <tbody className="divide-y divide-gray-700 bg-gray-900/30" {...props}>
        {children}
      </tbody>
    ),
    th: ({ children, ...props }: { children?: React.ReactNode }) => (
      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider" {...props}>
        {children}
      </th>
    ),
    td: ({ children, ...props }: { children?: React.ReactNode }) => (
      <td className="px-4 py-3 text-sm text-gray-300" {...props}>
        {children}
      </td>
    ),

    ul: ({ children, ...props }: { children?: React.ReactNode }) => (
      <ul className="my-3 ml-6 space-y-2 list-disc marker:text-blue-400" {...props}>
        {children}
      </ul>
    ),
    ol: ({ children, ...props }: { children?: React.ReactNode }) => (
      <ol className="my-3 ml-6 space-y-2 list-decimal marker:text-blue-400" {...props}>
        {children}
      </ol>
    ),
    li: ({ children, ...props }: { children?: React.ReactNode }) => (
      <li className="text-gray-300 leading-relaxed pl-2" {...props}>
        {children}
      </li>
    ),

    h1: ({ children, ...props }: { children?: React.ReactNode }) => (
      <h1 className="text-2xl font-bold text-white mt-6 mb-4 pb-2 border-b border-gray-700" {...props}>
        {children}
      </h1>
    ),
    h2: ({ children, ...props }: { children?: React.ReactNode }) => (
      <h2 className="text-xl font-semibold text-white mt-5 mb-3" {...props}>
        {children}
      </h2>
    ),
    h3: ({ children, ...props }: { children?: React.ReactNode }) => (
      <h3 className="text-lg font-semibold text-gray-200 mt-4 mb-2" {...props}>
        {children}
      </h3>
    ),

    p: ({ children, ...props }: { children?: React.ReactNode }) => (
      <div className="text-gray-300 leading-relaxed my-3" {...props}>
        {children}
      </div>
    ),

    blockquote: ({ children, ...props }: { children?: React.ReactNode }) => (
      <blockquote className="border-l-4 border-blue-500 pl-4 py-2 my-4 italic text-gray-400 bg-gray-800/30 rounded-r" {...props}>
        {children}
      </blockquote>
    ),

    a: ({ children, href, ...props }: { children?: React.ReactNode; href?: string }) => (
      <a 
        href={href} 
        target="_blank" 
        rel="noopener noreferrer"
        className="text-blue-400 hover:text-blue-300 underline decoration-blue-400/30 hover:decoration-blue-300 transition-colors"
        {...props}
      >
        {children}
      </a>
    ),

    hr: ({ ...props }) => (
      <hr className="my-6 border-gray-700" {...props} />
    ),
  };

  return (
    <ReactMarkdown
      components={customComponents}
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]}
    >
      {content}
    </ReactMarkdown>
  );
}, (prev, next) => prev.content === next.content);

MarkdownContent.displayName = 'MarkdownContent';

const ChatBubble: FC<ChatBubbleProps> = ({ message, onRegenerate, onFeedback }) => {
  const isUser = message.sender === "user";
  const [isCopied, setIsCopied] = useState(false);
  const [feedback, setFeedback] = useState<'positive' | 'negative' | null>(null);

  // Extract attachments
  let promptText = message.text;
  let attachedFiles: string[] = [];
  const attachmentRegex = /\[ATTACHMENTS:(.*?)\]/;
  const match = message.text.match(attachmentRegex);

  if (match && match[1]) {
    promptText = message.text.replace(attachmentRegex, "").trim();
    attachedFiles = match[1].split("|||");
  }

  // Copy entire message
  const handleCopy = useCallback(() => {
    const textToCopy = promptText || message.text;
    navigator.clipboard.writeText(textToCopy).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  }, [promptText, message.text]);

  // Feedback handler
  const handleFeedback = useCallback((type: 'positive' | 'negative') => {
    setFeedback(type);
    onFeedback?.(message.id, type);
  }, [message.id, onFeedback]);

  return (
    <div
      className={`relative flex items-start gap-3 my-4 ${
        isUser ? "justify-end" : ""
      }`}
    >
      {!isUser && (
        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
          <BotIcon className="w-5 h-5 text-white" />
        </div>
      )}

      <div
        className={`relative w-fit max-w-[90%] md:max-w-2xl lg:max-w-3xl rounded-2xl transition-all ${
          isUser
            ? "bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-br-none shadow-lg"
            : "text-gray-300 rounded-bl-none"
        }`}
      >
        <div className={`${isUser ? 'py-0.5 px-4' : 'py-3 px-4'}`}>
          <div className="prose prose-invert max-w-none">
            {promptText && (
              <MarkdownContent content={promptText} messageId={message.id} />
            )}
          </div>

          {isUser && attachedFiles.length > 0 && (
            <div className="mt-4 pt-3 border-t border-white/20">
              <div className="text-xs text-white/70 mb-2 font-medium">Attached files:</div>
              <div className="flex flex-col gap-2">
                {attachedFiles.map((fileName, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 bg-white/10 backdrop-blur rounded-lg px-3 py-2 text-sm"
                  >
                    <FileText className="w-4 h-4 text-white/60 flex-shrink-0" />
                    <span className="truncate text-white/90">{fileName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {!isUser && (
          <div className="flex items-center gap-1 px-3 pb-3 pt-1">
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
              title="Copy message"
            >
              {isCopied ? (
                <CheckIcon className="w-4 h-4 text-green-500" />
              ) : (
                <CopyIcon className="w-4 h-4" />
              )}
            </button>

            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                title="Regenerate response"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}

            <div className="flex-1" />

            <button
              onClick={() => handleFeedback('positive')}
              className={`p-1.5 rounded-md transition-colors ${
                feedback === 'positive'
                  ? 'text-green-500 bg-green-500/20'
                  : 'text-gray-400 hover:text-green-500 hover:bg-gray-700'
              }`}
              title="Good response"
            >
              <ThumbsUp className="w-4 h-4" />
            </button>

            <button
              onClick={() => handleFeedback('negative')}
              className={`p-1.5 rounded-md transition-colors ${
                feedback === 'negative'
                  ? 'text-red-500 bg-red-500/20'
                  : 'text-gray-400 hover:text-red-500 hover:bg-gray-700'
              }`}
              title="Bad response"
            >
              <ThumbsDown className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center shadow-lg">
          <UserIcon className="w-5 h-5 text-white" />
        </div>
      )}
    </div>
  );
};

// OPTIMIZATION: Memoize entire ChatBubble component
export default memo(ChatBubble, (prev, next) => {
  return prev.message.id === next.message.id && 
         prev.message.text === next.message.text;
});