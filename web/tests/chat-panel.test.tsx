/**
 * Tests for the ChatPanel component.
 *
 * Covers: rendering, form submission, keyboard shortcuts,
 * example queries, loading states, and accessibility.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatPanel } from '../src/components/ChatPanel';

const defaultProps = {
  messages: [],
  onSendMessage: vi.fn(),
  isLoading: false,
};

describe('ChatPanel', () => {
  it('renders header and input', () => {
    render(<ChatPanel {...defaultProps} />);

    expect(screen.getByText('Santa Fe Spatial Chat')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('shows example queries when no messages', () => {
    render(<ChatPanel {...defaultProps} />);

    expect(screen.getByText(/neighborhoods.*short-term rentals/i)).toBeInTheDocument();
    expect(screen.getByText(/residential parcels.*bus stop/i)).toBeInTheDocument();
  });

  it('hides examples when messages exist', () => {
    const messages = [
      {
        id: '1',
        role: 'user' as const,
        content: 'Show parcels',
        timestamp: new Date(),
      },
    ];

    render(<ChatPanel {...defaultProps} messages={messages} />);

    expect(screen.queryByText(/neighborhoods.*short-term rentals/i)).not.toBeInTheDocument();
  });

  it('populates input when example query clicked', () => {
    render(<ChatPanel {...defaultProps} />);

    const buttons = screen.getAllByRole('button');
    const exampleBtn = buttons.find((btn) =>
      btn.textContent?.includes('neighborhoods')
    );
    fireEvent.click(exampleBtn!);

    expect(screen.getByRole('textbox')).toHaveValue(
      'Which neighborhoods have the most short-term rentals?'
    );
  });

  it('calls onSendMessage on form submit', () => {
    const onSendMessage = vi.fn();
    render(<ChatPanel {...defaultProps} onSendMessage={onSendMessage} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Show parcels' } });
    fireEvent.submit(input.closest('form')!);

    expect(onSendMessage).toHaveBeenCalledWith('Show parcels');
  });

  it('submits on Enter key', () => {
    const onSendMessage = vi.fn();
    render(<ChatPanel {...defaultProps} onSendMessage={onSendMessage} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Show parcels' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

    expect(onSendMessage).toHaveBeenCalledWith('Show parcels');
  });

  it('does not submit on Shift+Enter', () => {
    const onSendMessage = vi.fn();
    render(<ChatPanel {...defaultProps} onSendMessage={onSendMessage} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Show parcels' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });

    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it('disables input and button while loading', () => {
    render(<ChatPanel {...defaultProps} isLoading={true} />);

    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Thinking...' })).toBeDisabled();
  });

  it('does not submit empty input', () => {
    const onSendMessage = vi.fn();
    render(<ChatPanel {...defaultProps} onSendMessage={onSendMessage} />);

    fireEvent.submit(screen.getByRole('textbox').closest('form')!);

    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it('renders messages with correct roles', () => {
    const messages = [
      {
        id: '1',
        role: 'user' as const,
        content: 'Show parcels',
        timestamp: new Date(),
      },
      {
        id: '2',
        role: 'assistant' as const,
        content: 'Found 5 parcels.',
        timestamp: new Date(),
      },
    ];

    render(<ChatPanel {...defaultProps} messages={messages} />);

    expect(screen.getByText('Show parcels')).toBeInTheDocument();
    expect(screen.getByText('Found 5 parcels.')).toBeInTheDocument();
  });

  it('shows error messages', () => {
    const messages = [
      {
        id: '1',
        role: 'assistant' as const,
        content: 'Error occurred',
        timestamp: new Date(),
        error: 'Query failed',
      },
    ];

    render(<ChatPanel {...defaultProps} messages={messages} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Query failed');
  });

  it('has proper accessibility: labeled textarea and log region', () => {
    render(<ChatPanel {...defaultProps} />);

    expect(screen.getByRole('region', { name: 'Chat' })).toBeInTheDocument();
    expect(screen.getByLabelText(/ask a question/i)).toBeInTheDocument();
  });

  it('shows loading indicator with sr-only text', () => {
    render(<ChatPanel {...defaultProps} isLoading={true} />);

    expect(screen.getByText('Processing your query...')).toBeInTheDocument();
  });
});
