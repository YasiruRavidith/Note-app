// web/src/components/RichTextEditor.jsx
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import MDEditor from '@uiw/react-md-editor';
import { io } from 'socket.io-client';
import { SOCKET_URL } from '../config/endpoints';

const RichTextEditor = ({ 
  noteId, 
  initialContent = '', 
  onContentChange, 
  readOnly = false,
  className = '',
  showPreview = true 
}) => {
  const [content, setContent] = useState(initialContent);
  const [isConnected, setIsConnected] = useState(false);
  const [collaborators, setCollaborators] = useState([]);
  const [socket, setSocket] = useState(null);

  // Apply operation from other users
  const applyOperation = useCallback((operation) => {
    setContent(prevContent => {
      // Simple operational transform - in production, use a proper OT library
      switch (operation.type) {
        case 'insert':
          return prevContent.slice(0, operation.position) + 
                 operation.text + 
                 prevContent.slice(operation.position);
        case 'delete':
          return prevContent.slice(0, operation.position) + 
                 prevContent.slice(operation.position + operation.length);
        case 'replace':
          return operation.newContent;
        default:
          return prevContent;
      }
    });
  }, []);

  // Initialize socket connection for collaborative editing
  useEffect(() => {
    if (!noteId || readOnly) return;

    const socketInstance = io(SOCKET_URL);
    setSocket(socketInstance);

    socketInstance.on('connect', () => {
      setIsConnected(true);
      // Join the note room for collaborative editing
      socketInstance.emit('join-note', { noteId });
    });

    socketInstance.on('disconnect', () => {
      setIsConnected(false);
    });

    // Handle real-time text operations
    socketInstance.on('text-operation', (operation) => {
      if (operation.noteId === noteId) {
        applyOperation(operation);
      }
    });

    // Handle collaborator updates
    socketInstance.on('collaborators-updated', (data) => {
      if (data.noteId === noteId) {
        setCollaborators(data.collaborators);
      }
    });

    return () => {
      socketInstance.emit('leave-note', { noteId });
      socketInstance.disconnect();
    };
  }, [noteId, readOnly, applyOperation]);

  // Handle content changes and emit operations
  const handleContentChange = useCallback((newContent) => {
    if (newContent === content) return;

    const operation = {
      type: 'replace',
      noteId,
      newContent,
      position: 0,
      timestamp: Date.now(),
      userId: 'current-user' // Should be actual user ID
    };

    setContent(newContent);

    // Emit operation to other collaborators
    if (socket && isConnected && !readOnly) {
      socket.emit('text-operation', operation);
    }

    // Notify parent component
    if (onContentChange) {
      onContentChange(newContent);
    }
  }, [content, noteId, socket, isConnected, readOnly, onContentChange]);

  // Update content when initialContent changes
  useEffect(() => {
    if (initialContent !== content) {
      setContent(initialContent);
    }
  }, [initialContent, content]);

  // Custom toolbar configuration
  const toolbarConfig = useMemo(() => [
    ['bold', 'italic', 'strikethrough'],
    ['title1', 'title2', 'title3', 'title4', 'title5', 'title6'],
    ['hr', 'quote', 'unorderedListCommand', 'orderedListCommand'],
    ['link', 'code', 'image'],
    ['table', 'codeBlock'],
    showPreview ? ['preview'] : []
  ], [showPreview]);

  return (
    <div className={`rich-text-editor ${className}`}>
      {/* Collaboration status */}
      {!readOnly && noteId && (
        <div className="flex items-center justify-between mb-2 text-sm text-gray-400">
          <div className="flex items-center space-x-2">
            <div className="flex items-center gap-1">
              {isConnected ? (
                <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-3 h-3 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              )}
              <span>{isConnected ? 'Connected' : 'Offline'}</span>
            </div>
            {collaborators.length > 0 && (
              <span>• {collaborators.length} collaborator{collaborators.length > 1 ? 's' : ''}</span>
            )}
          </div>
          <div className="flex space-x-1">
            {collaborators.map((collaborator, index) => (
              <div
                key={collaborator.id}
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold`}
                style={{ backgroundColor: `hsl(${index * 137.5}, 70%, 60%)` }}
                title={collaborator.name}
              >
                {collaborator.name.charAt(0).toUpperCase()}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rich text editor */}
      <div data-color-mode="dark" className="rich-editor-container">
        <MDEditor
          value={content}
          onChange={handleContentChange}
          preview={showPreview ? 'edit' : 'edit'}
          hideToolbar={readOnly}
          visibleDragBar={false}
          textareaProps={{
            placeholder: 'Start writing your note...',
            style: {
              fontSize: 14,
              lineHeight: 1.6,
              backgroundColor: '#1f2937',
              color: '#ffffff',
              border: 'none',
              resize: 'vertical'
            }
          }}
          height={400}
          commands={toolbarConfig.flat()}
          extraCommands={[]}
        />
      </div>

      {/* Markdown guide (collapsible) */}
      {!readOnly && (
        <details className="mt-2 text-sm text-gray-400">
          <summary className="cursor-pointer hover:text-gray-300 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Markdown Guide
          </summary>
          <div className="mt-2 space-y-1 text-xs bg-gray-800 p-3 rounded">
            <p><code>**bold**</code> → <strong>bold</strong></p>
            <p><code>*italic*</code> → <em>italic</em></p>
            <p><code># Heading 1</code> → Large heading</p>
            <p><code>## Heading 2</code> → Medium heading</p>
            <p><code>- List item</code> → Bullet point</p>
            <p><code>1. Numbered</code> → Numbered list</p>
            <p><code>`code`</code> → <code>inline code</code></p>
            <p><code>[link](url)</code> → Clickable link</p>
          </div>
        </details>
      )}
    </div>
  );
};

export default RichTextEditor;