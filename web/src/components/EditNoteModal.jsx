// web/src/components/EditNoteModal.jsx
import React, { useState, useEffect } from 'react';
import RichTextEditor from './RichTextEditor';
import FileUpload from './FileUpload';
import AttachmentList from './AttachmentList';

const EditNoteModal = ({ note, onClose, onSave }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [attachmentRefresh, setAttachmentRefresh] = useState(0);
  const [showAttachments, setShowAttachments] = useState(false);

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
      {/* Modal Content - Made larger for rich text editor */}
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-white">Edit Note</h2>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="text-sm bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded"
            >
              {showPreview ? 'Hide Preview' : 'Show Preview'}
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Title Input */}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Note title..."
          className="w-full bg-gray-700 text-white p-3 rounded-md mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
        />

        {/* Rich Text Editor */}
        <div className="mb-4">
          <RichTextEditor
            noteId={note.id}
            initialContent={content}
            onContentChange={(newContent) => setContent(newContent || '')}
            showPreview={showPreview}
            className="min-h-[400px]"
          />
        </div>

        {/* Attachments Section */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-medium text-white">Attachments</h3>
            <button
              onClick={() => setShowAttachments(!showAttachments)}
              className="text-sm bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded flex items-center gap-2"
            >
              <svg className={`w-4 h-4 transition-transform ${showAttachments ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              {showAttachments ? 'Hide' : 'Show'} Attachments
            </button>
          </div>

          {showAttachments && (
            <div className="space-y-4">
              {/* File Upload */}
              <FileUpload 
                noteId={note.id}
                onUploadComplete={(results) => {
                  console.log('Files uploaded:', results);
                  setAttachmentRefresh(prev => prev + 1);
                }}
                onUploadError={(error) => {
                  console.error('Upload failed:', error);
                  alert('Upload failed: ' + error.message);
                }}
              />

              {/* Attachment List */}
              <AttachmentList 
                noteId={note.id}
                refresh={attachmentRefresh}
                onAttachmentDeleted={() => {
                  setAttachmentRefresh(prev => prev + 1);
                }}
              />
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-4 pt-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-6 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditNoteModal;