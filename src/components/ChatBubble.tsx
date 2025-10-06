// src/components/ChatBubble.tsx

import { FC, useState } from "react";
import { Message } from "../lib/types";
import { BotIcon, UserIcon, CopyIcon, CheckIcon } from "./Icons";
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface ChatBubbleProps {
  message: Message;
}

const ChatBubble: FC<ChatBubbleProps> = ({ message }) => {
  const isUser = message.sender === "user";
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = () => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(message.text).then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      });
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = message.text;
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      } catch (err) {
        console.error('Fallback copy failed', err);
      }
      document.body.removeChild(textArea);
    }
  };

  const customComponents = {
    // MODIFICATION: Replaced 'any' with a specific type and removed the unused 'node'
    code({ inline, className, children, ...props }: {
      inline?: boolean;
      className?: string;
      children?: React.ReactNode;
    }) {
      const match = /language-(\w+)/.exec(className || '');
      return !inline && match ? (
        <SyntaxHighlighter
          style={oneDark}
          language={match[1]}
          PreTag="div"
          {...props}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      ) : (
        <code className="bg-gray-700 rounded-md px-1.5 py-0.5" {...props}>
          {children}
        </code>
      );
    },
  };

  return (
    <div className={`relative flex items-start gap-4 my-4 ${isUser ? "justify-end" : ""}`}>
      {!isUser && (
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
          <BotIcon className="w-6 h-6 text-gray-400" />
        </div>
      )}
      
      <div className={`relative max-w-xl p-4 rounded-2xl ${isUser ? "bg-blue-600 text-white rounded-br-none" : "bg-gray-800 text-gray-300 rounded-bl-none"}`}>
        <div className="prose prose-invert prose-p:my-2">
          <ReactMarkdown components={customComponents}>
            {message.text}
          </ReactMarkdown>
        </div>

        {!isUser && (
          <button 
            onClick={handleCopy}
            className="absolute -bottom-3 left-2 p-1 bg-gray-700 rounded-full text-gray-400"
          >
            {isCopied ? (
              <CheckIcon className="w-5 h-5 text-green-500" />
            ) : (
              <CopyIcon className="w-5 h-5" />
            )}
          </button>
        )}
      </div>
      
      {isUser && (
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
          <UserIcon className="w-6 h-6 text-gray-400" />
        </div>
      )}
    </div>
  );
};

export default ChatBubble;