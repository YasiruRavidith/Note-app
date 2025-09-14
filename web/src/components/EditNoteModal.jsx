// web/src/components/EditNoteModal.jsx
import React, { useState, useEffect } from 'react';

const EditNoteModal = ({ note, onClose, onSave }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  // When the 'note' prop changes, update the form's state
  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setContent(note.content || '');
    }
  }, [note]);

  if (!note) return null; // Don't render anything if no note is selected

  const handleSave = () => {
    onSave({ ...note, title, content });
  };

  return (
    // Modal Backdrop
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      {/* Modal Content */}
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-lg">
        <h2 className="text-2xl font-bold mb-4">Edit Note</h2>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-gray-700 text-white p-3 rounded-md mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows="6"
          className="w-full bg-gray-700 text-white p-3 rounded-md mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
        ></textarea>
        <div className="flex justify-end space-x-4">
          <button
            onClick={onClose}
            className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditNoteModal;