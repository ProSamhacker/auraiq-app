'use client';

import { FC, useState } from "react";
import { Message } from "../lib/types";
import { BotIcon, UserIcon, CopyIcon, CheckIcon } from "./Icons";
import { FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
// ✅ FIXED IMPORT — CJS path works in Next.js 15 (Turbopack)
import { oneDark } from "@/styles/oneDark";


const customCodeStyle = {
  ...oneDark,
  'pre[class*="language-"]': {
    ...oneDark['pre[class*="language-"]'],
    padding: '1rem',
    lineHeight: '1.5',
  },
  'code[class*="language-"]': {
    ...oneDark['code[class*="language-"]'],
    lineHeight: '1.5',
  },
};

interface ChatBubbleProps {
  message: Message;
}

const ChatBubble: FC<ChatBubbleProps> = ({ message }) => {
  const isUser = message.sender === "user";
  const [isCopied, setIsCopied] = useState(false);

  // Extract attachments from message text
  let promptText = message.text;
  let attachedFiles: string[] = [];
  const attachmentRegex = /\[ATTACHMENTS:(.*?)\]/;
  const match = message.text.match(attachmentRegex);

  if (match && match[1]) {
    promptText = message.text.replace(attachmentRegex, "").trim();
    attachedFiles = match[1].split("|||");
  }

  // Copy message text
  const handleCopy = () => {
    const textToCopy = promptText || message.text;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      });
    } else {
      // fallback for insecure contexts
      const textarea = document.createElement("textarea");
      textarea.value = textToCopy;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  // Custom Markdown rendering
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
      const match = /language-(\\w+)/.exec(className || "");
      return !inline && match ? (
        <div className="overflow-x-auto bg-[#0d1117] rounded-md my-2 text-xs md:text-sm">
          <SyntaxHighlighter
            style={customCodeStyle}
            language={match[1]}
            PreTag="div"
            {...props}
          >
            {String(children).replace(/\\n$/, "")}
          </SyntaxHighlighter>
        </div>
      ) : (
        <code
          className="bg-gray-700 rounded-md px-1.5 py-0.5 break-words"
          {...props}
        >
          {children}
        </code>
      );
    },
  };

  return (
    <div
      className={`relative flex items-start gap-2 my-4 ${
        isUser ? "justify-end" : ""
      }`}
    >
      {/* Bot Icon (left) */}
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
          <BotIcon className="w-5 h-5 text-gray-400" />
        </div>
      )}

      {/* Message Bubble */}
      <div
        className={`relative w-fit max-w-[90%] md:max-w-xl lg:max-w-3xl p-3 rounded-2xl ${
          isUser
            ? "bg-blue-600 text-white rounded-br-none"
            : "bg-gray-800 text-gray-300 rounded-bl-none"
        }`}
      >
        <div className="prose prose-invert prose-p:my-2 text-sm leading-relaxed">
          {promptText && (
            <ReactMarkdown components={customComponents}>
              {promptText}
            </ReactMarkdown>
          )}
        </div>

        {/* File Attachments */}
        {isUser && attachedFiles.length > 0 && (
          <div className="mt-3 pt-2 border-t border-white/20">
            <div className="text-xs text-white/70 mb-2">Attached files:</div>
            <div className="flex flex-col gap-1.5">
              {attachedFiles.map((fileName, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 bg-black/20 rounded-md px-2 py-1 text-xs"
                >
                  <FileText className="w-4 h-4 text-white/60 flex-shrink-0" />
                  <span className="truncate">{fileName}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Copy Button for Assistant Messages */}
        {!isUser && (
          <button
            onClick={handleCopy}
            className="absolute -bottom-3 left-2 p-1 bg-gray-700 rounded-full text-gray-400 hover:text-white transition"
          >
            {isCopied ? (
              <CheckIcon className="w-5 h-5 text-green-500" />
            ) : (
              <CopyIcon className="w-5 h-5" />
            )}
          </button>
        )}
      </div>

      {/* User Icon (right) */}
      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
          <UserIcon className="w-5 h-5 text-gray-400" />
        </div>
      )}
    </div>
  );
};

export default ChatBubble;
