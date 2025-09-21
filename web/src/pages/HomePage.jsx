// web/src/pages/HomePage.jsx
import React, { useState, useEffect } from 'react';
import axiosClient from '../api/axiosClient';
import EditNoteModal from '../components/EditNoteModal';
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
    if (window.confirm('Are you sure you want to delete this note?')) {
      try {
        await axiosClient.delete(`/notes/${noteId}`);
        // Optimistic update
        setNotes(notes.filter((note) => note.id !== noteId));
      } catch (error) {
        console.error('Failed to delete note:', error);
      }
    }
  };

  const handleSaveNote = async (updatedNote) => {
    try {
      const response = await axiosClient.put(`/notes/${updatedNote.id}`, {
        title: updatedNote.title,
        content: updatedNote.content,
      });
      // Optimistic update
      setNotes(notes.map((note) => (note.id === updatedNote.id ? response.data : note)));
      setEditingNote(null);
    } catch (error) {
      console.error('Failed to update note:', error);
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
            {/* ... create note form (no changes here) ... */}
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
              placeholder="Note content..."
              rows="4"
              className="w-full bg-gray-700 text-white p-3 rounded-md mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            ></textarea>
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded">
              Save Note
            </button>
          </form>

          <div>
            <h2 className="text-2xl font-semibold mb-4">Your Notes</h2>
            {isLoading ? (
              <p>Loading notes...</p>
            ) : notes.length > 0 ? (
              <div className="space-y-4">
                {notes.map((note) => (
                  <div key={note.id} className="bg-gray-800 p-4 rounded-lg flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-xl">{note.title}</h3>
                      {/* Use whitespace-pre-wrap to respect newlines in the content */}
                      <p className="text-gray-300 mt-2 whitespace-pre-wrap">{note.content}</p>
                    </div>
                    {/* NEW: Buttons for Edit and Delete */}
                    <div className="flex space-x-2 flex-shrink-0 ml-4">
                      <button
                        onClick={() => setEditingNote(note)} // Set the note to be edited
                        className="text-blue-400 hover:text-blue-300"
                        aria-label="Edit note"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteNote(note.id)} // Call delete handler
                        className="text-red-500 hover:text-red-400"
                        aria-label="Delete note"
                      >
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