// mobile/app/note-edit.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Markdown from 'react-native-markdown-display';
import { syncService } from '../src/services/SyncService';
import FileUpload from '../src/components/FileUpload';
import AttachmentList from '../src/components/AttachmentList';

const NoteEditPage = () => {
  const router = useRouter();
  const { noteId, title: initialTitle, content: initialContent } = useLocalSearchParams();
  
  const [title, setTitle] = useState(initialTitle || '');
  const [content, setContent] = useState(initialContent || '');
  const [isLoading, setIsLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [attachmentRefresh, setAttachmentRefresh] = useState(0);

  const loadNote = useCallback(async () => {
    try {
      setIsLoading(true);
      const note = await syncService.getNoteById(noteId);
      if (note) {
        setTitle(note.title || '');
        setContent(note.content || '');
      }
    } catch (error) {
      console.error('Failed to load note:', error);
      Alert.alert('Error', 'Failed to load note');
    } finally {
      setIsLoading(false);
    }
  }, [noteId]);

  // Load existing note if editing
  useEffect(() => {
    if (noteId && noteId !== 'new') {
      loadNote();
    }
  }, [noteId, loadNote]);

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a title');
      return;
    }

    setIsSaving(true);
    try {
      const noteData = {
        title: title.trim(),
        content: content.trim(),
      };

      let savedNote;
      if (noteId && noteId !== 'new') {
        // Update existing note
        savedNote = await syncService.updateNote(noteId, noteData);
      } else {
        // Create new note
        savedNote = await syncService.createNote(noteData);
      }

      console.log('✅ Note saved successfully:', savedNote.title);
      Alert.alert('Success', 'Note saved successfully', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error) {
      console.error('❌ Failed to save note:', error);
      Alert.alert('Error', 'Failed to save note. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    if (title.trim() || content.trim()) {
      Alert.alert(
        'Discard Changes',
        'Are you sure you want to discard your changes?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => router.back() }
        ]
      );
    } else {
      router.back();
    }
  };

  // Auto-save functionality (save locally)
  useEffect(() => {
    const autoSaveTimer = setTimeout(() => {
      if (title || content) {
        // Save to local storage for draft recovery
        // This could be enhanced with actual auto-save to server
      }
    }, 2000);

    return () => clearTimeout(autoSaveTimer);
  }, [title, content]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading note...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleDiscard} style={styles.headerButton}>
            <Text style={styles.headerButtonText}>Cancel</Text>
          </TouchableOpacity>
          
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>
              {noteId && noteId !== 'new' ? 'Edit Note' : 'New Note'}
            </Text>
          </View>

          <View style={styles.headerRight}>
            <TouchableOpacity 
              onPress={() => setShowPreview(!showPreview)} 
              style={styles.previewButton}
            >
              <Text style={styles.previewButtonText}>
                {showPreview ? '📝' : '👁️'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={handleSave} 
              style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text style={styles.saveButtonText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Content */}
        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
          {/* Title Input */}
          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={setTitle}
            placeholder="Note title..."
            placeholderTextColor="#6B7280"
            multiline
          />

          {/* Content Editor/Preview Toggle */}
          {showPreview ? (
            /* Markdown Preview */
            <View style={styles.previewContainer}>
              <Text style={styles.previewLabel}>Preview</Text>
              <ScrollView style={styles.markdownContainer}>
                <Markdown style={markdownStyles}>
                  {content || '*No content to preview*'}
                </Markdown>
              </ScrollView>
            </View>
          ) : (
            /* Content Input */
            <View style={styles.editorContainer}>
              <Text style={styles.editorLabel}>Content (Markdown supported)</Text>
              <TextInput
                style={styles.contentInput}
                value={content}
                onChangeText={setContent}
                placeholder="Start writing... Use **bold**, *italic*, # headings, - lists"
                placeholderTextColor="#6B7280"
                multiline
                textAlignVertical="top"
              />
            </View>
          )}

          {/* Markdown Help */}
          <View style={styles.helpContainer}>
            <Text style={styles.helpTitle}>Markdown Quick Reference:</Text>
            <Text style={styles.helpText}>**bold** *italic* # Heading</Text>
            <Text style={styles.helpText}>- List item | 1. Numbered list</Text>
            <Text style={styles.helpText}>`code` | [link](url)</Text>
          </View>

          {/* Attachments Section */}
          {noteId && (
            <View style={styles.attachmentsContainer}>
              <TouchableOpacity
                style={styles.attachmentToggle}
                onPress={() => setShowAttachments(!showAttachments)}
              >
                <Text style={styles.attachmentToggleText}>
                  {showAttachments ? '📎 Hide Attachments' : '📎 Show Attachments'}
                </Text>
              </TouchableOpacity>

              {showAttachments && (
                <View style={styles.attachmentContent}>
                  <FileUpload 
                    noteId={noteId}
                    onUploadComplete={(results) => {
                      console.log('Files uploaded:', results);
                      setAttachmentRefresh(prev => prev + 1);
                    }}
                    onUploadError={(error) => {
                      console.error('Upload failed:', error);
                    }}
                  />

                  <AttachmentList 
                    noteId={noteId}
                    refresh={attachmentRefresh}
                    onAttachmentDeleted={() => {
                      setAttachmentRefresh(prev => prev + 1);
                    }}
                  />
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  keyboardView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#9CA3AF',
    marginTop: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  headerButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  headerButtonText: {
    color: '#9CA3AF',
    fontSize: 16,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  previewButtonText: {
    fontSize: 18,
  },
  saveButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  saveButtonDisabled: {
    backgroundColor: '#6B7280',
  },
  saveButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  titleInput: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 20,
    padding: 12,
    backgroundColor: '#1F2937',
    borderRadius: 8,
    minHeight: 60,
  },
  editorContainer: {
    flex: 1,
  },
  editorLabel: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 8,
  },
  contentInput: {
    fontSize: 16,
    color: 'white',
    backgroundColor: '#1F2937',
    borderRadius: 8,
    padding: 12,
    minHeight: 300,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    lineHeight: 24,
  },
  previewContainer: {
    flex: 1,
  },
  previewLabel: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 8,
  },
  markdownContainer: {
    backgroundColor: '#1F2937',
    borderRadius: 8,
    padding: 12,
    minHeight: 300,
  },
  helpContainer: {
    marginTop: 20,
    padding: 12,
    backgroundColor: '#1F2937',
    borderRadius: 8,
  },
  helpTitle: {
    color: '#D1D5DB',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  helpText: {
    color: '#9CA3AF',
    fontSize: 12,
    marginBottom: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  attachmentsContainer: {
    marginTop: 16,
  },
  attachmentToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#1F2937',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
  },
  attachmentToggleText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#D1D5DB',
  },
  attachmentContent: {
    marginTop: 12,
  },
});

// Markdown styles for preview
const markdownStyles = {
  body: {
    color: '#D1D5DB',
    fontSize: 16,
    lineHeight: 24,
  },
  heading1: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  heading2: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  heading3: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  paragraph: {
    marginBottom: 12,
  },
  code_inline: {
    backgroundColor: '#374151',
    color: '#F3F4F6',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  code_block: {
    backgroundColor: '#0F172A',
    color: '#F3F4F6',
    padding: 12,
    borderRadius: 8,
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginVertical: 8,
  },
  bullet_list: {
    marginBottom: 8,
  },
  ordered_list: {
    marginBottom: 8,
  },
  list_item: {
    marginBottom: 4,
  },
  blockquote: {
    backgroundColor: '#1F2937',
    borderLeftWidth: 4,
    borderLeftColor: '#6B7280',
    paddingLeft: 12,
    paddingVertical: 8,
    marginVertical: 8,
    fontStyle: 'italic',
  },
  strong: {
    fontWeight: 'bold',
    color: 'white',
  },
  em: {
    fontStyle: 'italic',
    color: '#F3F4F6',
  },
};

export default NoteEditPage;