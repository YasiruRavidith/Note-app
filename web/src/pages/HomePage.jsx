// web/src/pages/HomePage.jsx
import React, { useState, useEffect } from 'react';
import axiosClient from '../api/axiosClient';
import EditNoteModal from '../components/EditNoteModal';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { io } from 'socket.io-client'; // <-- NEW: Import io
import { SOCKET_URL } from '../config/endpoints';

// NEW: Establish the socket connection outside of the component
// This prevents it from reconnecting on every re-render
const socket = io(SOCKET_URL);

const HomePage = () => {
  const [notes, setNotes] = useState([]);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [editingNote, setEditingNote] = useState(null);

  // Effect for fetching initial notes and setting up socket listeners
  useEffect(() => {
    // Fetch initial notes
    const fetchNotes = async () => {
      try {
        const response = await axiosClient.get('/notes');
        setNotes(response.data);
      } catch (error) {
        console.error('Failed to fetch notes:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchNotes();

    // NEW: Socket.IO event listeners
    const handleNoteCreated = (newNote) => {
      // Add the new note to the state, but check if it's already there
      // to avoid duplicates from the optimistic update.
      setNotes((prevNotes) =>
         prevNotes.some(note => note.id === newNote.id)
         ? prevNotes
         : [newNote, ...prevNotes]
      );
    };

    const handleNoteUpdated = (updatedNote) => {
      setNotes((prevNotes) =>
        prevNotes.map((note) => (note.id === updatedNote.id ? updatedNote : note))
      );
    };

    const handleNoteDeleted = (deletedNote) => {
      setNotes((prevNotes) => prevNotes.filter((note) => note.id !== deletedNote.id));
    };

    socket.on('note:created', handleNoteCreated);
    socket.on('note:updated', handleNoteUpdated);
    socket.on('note:deleted', handleNoteDeleted);

    // NEW: Cleanup function to remove listeners when the component unmounts
    return () => {
      socket.off('note:created', handleNoteCreated);
      socket.off('note:updated', handleNoteUpdated);
      socket.off('note:deleted', handleNoteDeleted);
    };
  }, []); // The empty dependency array ensures this runs only once on mount

  const handleCreateNote = async (e) => {
    e.preventDefault();
    if (!newNoteTitle.trim()) return;
    try {
      // The POST request will trigger the backend to emit 'note:created'
      // which all clients (including this one) will receive.
      const response = await axiosClient.post('/notes', {
        title: newNoteTitle,
        content: newNoteContent,
      });
      // Optimistic update for instant UI feedback
      setNotes([response.data, ...notes]);
      setNewNoteTitle('');
      setNewNoteContent('');
    } catch (error) {
      console.error('Failed to create note:', error);
    }
  };

  const handleDeleteNote = async (noteId) => {
    console.log('🗑 Delete button clicked for note:', noteId);
    if (window.confirm('Are you sure you want to delete this note?')) {
      try {
        console.log('→ Sending delete request to:', `/notes/${noteId}`);
        await axiosClient.delete(`/notes/${noteId}`);
        // Optimistic update
        setNotes(notes.filter((note) => note.id !== noteId));
        console.log('✓ Note deleted successfully');
      } catch (error) {
        console.error('✗ Failed to delete note:', error);
        alert('Failed to delete note: ' + (error.response?.data?.message || error.message));
      }
    }
  };

  const handleSaveNote = async (updatedNote) => {
    console.log('💾 Save note called for:', updatedNote.id, updatedNote.title);
    try {
      console.log('📡 Sending update request to:', `/notes/${updatedNote.id}`);
      const response = await axiosClient.put(`/notes/${updatedNote.id}`, {
        title: updatedNote.title,
        content: updatedNote.content,
      });
      // Optimistic update
      setNotes(notes.map((note) => (note.id === updatedNote.id ? response.data : note)));
      setEditingNote(null);
      console.log('✅ Note updated successfully');
    } catch (error) {
      console.error('❌ Failed to update note:', error);
      alert('Failed to update note: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    window.location.href = '/login';
  };

  return (
    <> {/* Use a Fragment to allow the modal to be a sibling */}
      <div className="bg-gray-900 min-h-screen text-white p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto">
          <header className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold">My Notes</h1>
            <button onClick={handleLogout} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded">
              Logout
            </button>
          </header>

          <form onSubmit={handleCreateNote} className="bg-gray-800 p-6 rounded-lg mb-8">
            <h2 className="text-2xl font-semibold mb-4">Create a New Note</h2>
            <input
              type="text"
              value={newNoteTitle}
              onChange={(e) => setNewNoteTitle(e.target.value)}
              placeholder="Note Title"
              className="w-full bg-gray-700 text-white p-3 rounded-md mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <textarea
              value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
              placeholder="Start writing... (Supports Markdown: **bold**, *italic*, # headings, - lists)"
              rows="6"
              className="w-full bg-gray-700 text-white p-3 rounded-md mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              style={{ resize: 'vertical' }}
            ></textarea>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">
                Use Markdown syntax for formatting
              </span>
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded transition-colors">
                Create Note
              </button>
            </div>
          </form>

          <div>
            <h2 className="text-2xl font-semibold mb-4">Your Notes</h2>
            {isLoading ? (
              <p>Loading notes...</p>
            ) : notes.length > 0 ? (
              <div className="space-y-4">
                {notes.map((note) => (
                  <div key={note.id} className="bg-gray-800 p-4 rounded-lg flex justify-between items-start">
                    <div className="flex-1 mr-4">
                      <h3 className="font-bold text-xl mb-2">{note.title}</h3>
                      {/* Render markdown content */}
                      <div className="text-gray-300 prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          components={{
                            // Custom styling for markdown elements
                            h1: ({children}) => <h1 className="text-lg font-bold mb-2">{children}</h1>,
                            h2: ({children}) => <h2 className="text-base font-bold mb-2">{children}</h2>,
                            h3: ({children}) => <h3 className="text-sm font-bold mb-1">{children}</h3>,
                            p: ({children}) => <p className="mb-2 last:mb-0">{children}</p>,
                            code: ({inline, children}) => 
                              inline 
                                ? <code className="bg-gray-700 px-1 rounded text-sm">{children}</code>
                                : <code className="block bg-gray-900 p-2 rounded text-sm overflow-x-auto">{children}</code>,
                            ul: ({children}) => <ul className="list-disc list-inside mb-2">{children}</ul>,
                            ol: ({children}) => <ol className="list-decimal list-inside mb-2">{children}</ol>,
                            blockquote: ({children}) => <blockquote className="border-l-4 border-gray-500 pl-4 italic">{children}</blockquote>,
                          }}
                        >
                          {note.content || 'No content'}
                        </ReactMarkdown>
                      </div>
                    </div>
                    {/* Action buttons */}
                    <div className="flex space-x-2 flex-shrink-0">
                      <button
                        onClick={() => {
                          console.log('✏️ Edit button clicked for note:', note.id, note.title);
                          setEditingNote(note);
                        }}
                        className="text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                        aria-label="Edit note"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteNote(note.id)}
                        className="text-red-500 hover:text-red-400 transition-colors flex items-center gap-1"
                        aria-label="Delete note"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400">You haven't created any notes yet.</p>
            )}
          </div>
        </div>
      </div>
      {/* NEW: Render the modal conditionally */}
      <EditNoteModal
        note={editingNote}
        onClose={() => setEditingNote(null)}
        onSave={handleSaveNote}
      />
    </>
  );
};

export default HomePage;