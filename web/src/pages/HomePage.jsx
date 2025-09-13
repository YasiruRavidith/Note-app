// web/src/pages/HomePage.jsx
import React, { useState, useEffect } from 'react';
import axiosClient from '../api/axiosClient'; // <-- Use our new client

const HomePage = () => {
  const [notes, setNotes] = useState([]);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Fetch notes when the component loads
  useEffect(() => {
    const fetchNotes = async () => {
      try {
        const response = await axiosClient.get('/notes');
        setNotes(response.data);
      } catch (error) {
        console.error('Failed to fetch notes:', error);
        // If token is invalid (401), we could redirect to login here
      } finally {
        setIsLoading(false);
      }
    };
    fetchNotes();
  }, []);

  const handleCreateNote = async (e) => {
    e.preventDefault();
    if (!newNoteTitle.trim()) return; // Don't create empty notes

    try {
      const response = await axiosClient.post('/notes', {
        title: newNoteTitle,
        content: newNoteContent,
      });
      setNotes([response.data, ...notes]); // Add the new note to the top of the list
      setNewNoteTitle('');
      setNewNoteContent('');
    } catch (error) {
      console.error('Failed to create note:', error);
      alert('Error: Could not create the note.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    window.location.href = '/login';
  };

  return (
    <div className="bg-gray-900 min-h-screen text-white p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">My Notes</h1>
          <button
            onClick={handleLogout}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
          >
            Logout
          </button>
        </header>

        {/* Create Note Form */}
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
            placeholder="Note content..."
            rows="4"
            className="w-full bg-gray-700 text-white p-3 rounded-md mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
          ></textarea>
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded"
          >
            Save Note
          </button>
        </form>

        {/* Notes List */}
        <div>
          <h2 className="text-2xl font-semibold mb-4">Your Notes</h2>
          {isLoading ? (
            <p>Loading notes...</p>
          ) : notes.length > 0 ? (
            <div className="space-y-4">
              {notes.map((note) => (
                <div key={note.id} className="bg-gray-800 p-4 rounded-lg">
                  <h3 className="font-bold text-xl">{note.title}</h3>
                  <p className="text-gray-300 mt-2">{note.content}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400">You haven't created any notes yet.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default HomePage;