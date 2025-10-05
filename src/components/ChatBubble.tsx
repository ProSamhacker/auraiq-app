// src/components/ChatBubble.tsx

import { FC } from "react";
import { Message } from "../lib/types";
import { BotIcon, UserIcon } from "./Icons";

interface ChatBubbleProps {
  message: Message;
}

const ChatBubble: FC<ChatBubbleProps> = ({ message }) => {
  const isUser = message.sender === "user";
  return (
    <div className={`flex items-start gap-4 my-4 ${isUser ? "justify-end" : ""}`}>
      {!isUser && (
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
          <BotIcon className="w-6 h-6 text-gray-400" />
        </div>
      )}
      <div className={`max-w-xl p-4 rounded-2xl ${isUser ? "bg-blue-600 text-white rounded-br-none" : "bg-gray-800 text-gray-300 rounded-bl-none"}`}>
        <p style={{ whiteSpace: "pre-wrap" }}>{message.text}</p>
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