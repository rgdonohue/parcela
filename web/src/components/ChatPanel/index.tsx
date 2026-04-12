import { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../../types/api';
import './ChatPanel.css';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  isLoading: boolean;
}

export function ChatPanel({
  messages,
  onSendMessage,
  isLoading,
}: ChatPanelProps) {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (trimmed && !isLoading) {
      onSendMessage(trimmed);
      setInputValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const exampleQueries = [
    { category: 'housing', query: 'Which neighborhoods have the most short-term rentals?' },
    { category: 'transit', query: 'Show residential parcels within 300m of a bus stop' },
    { category: 'equity', query: 'Census tracts where median income is below 40000' },
  ];

  return (
    <div className="chat-panel" role="region" aria-label="Chat">
      <div className="chat-header">
        <h2>Parcela</h2>
        <p className="chat-subtitle">
          Explore Santa Fe housing, land use, and equity
        </p>
      </div>

      <div
        className="chat-messages"
        role="log"
        aria-live="polite"
        aria-label="Conversation history"
      >
        {messages.length === 0 && (
          <div className="chat-welcome">
            <p>
              Ask a question about Santa Fe in plain English. For example:
            </p>
            <ul className="example-queries">
              {exampleQueries.map(({ category, query }, i) => (
                <li key={i} className="example-query-item">
                  <button
                    type="button"
                    className="example-query-btn"
                    onClick={() => setInputValue(query)}
                    disabled={isLoading}
                  >
                    <span className={`example-query-tag tag-${category}`}>{category}</span>
                    {query}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`chat-message ${message.role}`}
            role={message.role === 'assistant' ? 'status' : undefined}
          >
            <div className="message-content">
              {message.role === 'assistant' && message.equityNarrative && (
                <span className="chat-equity-label">Housing equity analysis</span>
              )}
              {message.content}
              {message.error && (
                <div className="message-error" role="alert">{message.error}</div>
              )}
              {message.metadata && (
                <div className="message-meta">
                  {message.metadata.count} features found in{' '}
                  {message.metadata.executionTimeMs}ms
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="chat-message assistant" role="status" aria-label="Loading response">
            <div className="message-content loading">
              <span className="loading-dots" aria-hidden="true">
                <span>.</span>
                <span>.</span>
                <span>.</span>
              </span>
              <span className="sr-only">Processing your query...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-form" onSubmit={handleSubmit}>
        <label htmlFor="chat-input" className="sr-only">
          Ask a question about Santa Fe
        </label>
        <textarea
          id="chat-input"
          ref={inputRef}
          className="chat-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question about Santa Fe..."
          disabled={isLoading}
          rows={2}
          aria-describedby={isLoading ? 'chat-loading-hint' : undefined}
        />
        {isLoading && (
          <span id="chat-loading-hint" className="sr-only">
            Please wait, processing your query
          </span>
        )}
        <button
          type="submit"
          className="chat-submit-btn"
          disabled={!inputValue.trim() || isLoading}
          aria-label={isLoading ? 'Processing query' : 'Send message'}
        >
          →
        </button>
      </form>
    </div>
  );
}
