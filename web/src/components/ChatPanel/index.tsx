import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatMessage } from '../../types/api';
import './ChatPanel.css';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  onClear: () => void;
  isLoading: boolean;
}

export function ChatPanel({
  messages,
  onSendMessage,
  onClear,
  isLoading,
}: ChatPanelProps) {
  const { t, i18n } = useTranslation();
  const currentLang: 'en' | 'es' = i18n.language.startsWith('es') ? 'es' : 'en';
  const setLang = (lang: 'en' | 'es') => {
    if (lang !== currentLang) void i18n.changeLanguage(lang);
  };
  const [inputValue, setInputValue] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const displayedElapsedSeconds = isLoading ? elapsedSeconds : 0;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isLoading) {
      return;
    }
    const start = performance.now();
    const id = window.setInterval(() => {
      setElapsedSeconds(Math.floor((performance.now() - start) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, [isLoading]);

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

  const exampleQueries = t('examples.queries', { returnObjects: true }) as Array<{ category: string; query: string }>;

  return (
    <div className="chat-panel" role="region" aria-label={t('chat.regionLabel')}>
      <div className="chat-header">
        <div className="chat-header-top">
          <h2>{t('app.title')}</h2>
          <div className="chat-header-actions">
            <div className="lang-toggle" role="group" aria-label={t('language.label')}>
              <button
                type="button"
                className="lang-option"
                aria-pressed={currentLang === 'en'}
                onClick={() => setLang('en')}
              >
                EN
              </button>
              <button
                type="button"
                className="lang-option"
                aria-pressed={currentLang === 'es'}
                onClick={() => setLang('es')}
              >
                ES
              </button>
            </div>
            <button
              type="button"
              className="new-query-btn"
              onClick={onClear}
              disabled={messages.length === 0 || isLoading}
              aria-label={t('chat.newQueryLabel')}
            >
              {t('chat.newQuery')}
            </button>
          </div>
        </div>
        <p className="chat-subtitle">
          {t('app.subtitle')}
        </p>
      </div>

      <div
        className="chat-messages"
        role="log"
        aria-live="polite"
        aria-label={t('chat.conversationHistory')}
      >
        {messages.length === 0 && (
          <div className="chat-welcome">
            <p>{t('chat.welcomeIntro')}</p>
            <ul className="example-queries">
              {exampleQueries.map(({ category, query }, i) => (
                <li key={i} className="example-query-item">
                  <button
                    type="button"
                    className="example-query-btn"
                    onClick={() => setInputValue(query)}
                    disabled={isLoading}
                  >
                    <span className={`example-query-tag tag-${category}`}>
                      {t(`examples.categories.${category}`, { defaultValue: category })}
                    </span>
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
              {message.role === 'assistant' ? (
                <p className="chat-summary">{message.content}</p>
              ) : (
                message.content
              )}
              {message.error && (
                <div className="message-error" role="alert">{message.error}</div>
              )}
              {message.metadata && (
                <div className="message-meta">
                  {t('chat.featuresFound', {
                    count: message.metadata.count,
                    ms: message.metadata.executionTimeMs,
                  })}
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="chat-message assistant" role="status" aria-label={t('chat.loadingResponse')}>
            <div className="message-content loading">
              <span className="loading-dots" aria-hidden="true">
                <span>.</span>
                <span>.</span>
                <span>.</span>
              </span>
              <span className="loading-elapsed" aria-hidden="true">
                {displayedElapsedSeconds > 0
                  ? t('chat.processingQuerySeconds', { seconds: displayedElapsedSeconds })
                  : t('chat.processingQuery')}
              </span>
              <span className="sr-only">
                {displayedElapsedSeconds > 0
                  ? t('chat.processingQuerySeconds', { seconds: displayedElapsedSeconds })
                  : t('chat.processingQuery')}
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-form" onSubmit={handleSubmit}>
        <label htmlFor="chat-input" className="sr-only">
          {t('chat.inputLabel')}
        </label>
        <textarea
          id="chat-input"
          ref={inputRef}
          className="chat-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('chat.inputPlaceholder')}
          disabled={isLoading}
          rows={2}
          aria-describedby={isLoading ? 'chat-loading-hint' : undefined}
        />
        {isLoading && (
          <span id="chat-loading-hint" className="sr-only">
            {t('chat.processingQueryHint')}
          </span>
        )}
        <button
          type="submit"
          className="chat-submit-btn"
          disabled={!inputValue.trim() || isLoading}
          aria-label={isLoading ? t('chat.sending') : t('chat.send')}
        >
          →
        </button>
      </form>
    </div>
  );
}
