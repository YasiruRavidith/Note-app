// mobile/src/components/AttachmentList.js
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, Alert, StyleSheet, Linking } from 'react-native';
import axiosClient from '../api/axiosClient';

const AttachmentList = ({ noteId, refresh, onAttachmentDeleted }) => {
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);

  const fetchAttachments = async () => {
    try {
      setLoading(true);
      const response = await axiosClient.get(`/notes/${noteId}/attachments`);
      setAttachments(response.data);
    } catch (error) {
      console.error('Failed to fetch attachments:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (noteId) {
      fetchAttachments();
    }
  }, [noteId, refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (attachmentId, fileName) => {
    Alert.alert(
      'Delete Attachment',
      `Are you sure you want to delete "${fileName}"?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(attachmentId);
              await axiosClient.delete(`/attachments/${attachmentId}`);
              
              setAttachments(prev => prev.filter(att => att.id !== attachmentId));
              
              if (onAttachmentDeleted) {
                onAttachmentDeleted(attachmentId);
              }

              console.log('✅ Attachment deleted successfully');
            } catch (error) {
              console.error('❌ Failed to delete attachment:', error);
              Alert.alert('Error', 'Failed to delete attachment: ' + (error.response?.data?.message || error.message));
            } finally {
              setDeleting(null);
            }
          },
        },
      ]
    );
  };

  const handleDownload = async (attachment) => {
    try {
      // Open the URL in the default browser/app
      await Linking.openURL(attachment.url);
    } catch (error) {
      console.error('Failed to open attachment:', error);
      Alert.alert('Error', 'Failed to open attachment');
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (mimeType) => {
    if (mimeType.startsWith('image/')) {
      return '🖼️';
    }
    if (mimeType === 'application/pdf') {
      return '📄';
    }
    if (mimeType.includes('document') || mimeType.includes('word')) {
      return '📝';
    }
    return '📎';
  };

  const renderAttachment = ({ item }) => (
    <View style={styles.attachmentItem}>
      <View style={styles.attachmentInfo}>
        <Text style={styles.fileIcon}>{getFileIcon(item.mimeType)}</Text>
        
        <View style={styles.attachmentDetails}>
          <Text style={styles.fileName} numberOfLines={1}>
            {item.originalName}
          </Text>
          <Text style={styles.fileInfo}>
            {formatFileSize(item.size)} • {new Date(item.createdAt).toLocaleDateString()}
          </Text>
        </View>
      </View>

      <View style={styles.attachmentActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handleDownload(item)}
        >
          <Text style={styles.actionButtonText}>📥</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.deleteButton]}
          onPress={() => handleDelete(item.id, item.originalName)}
          disabled={deleting === item.id}
        >
          <Text style={styles.actionButtonText}>
            {deleting === item.id ? '⏳' : '🗑️'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading attachments...</Text>
        </View>
      </View>
    );
  }

  if (attachments.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>No attachments yet</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.headerText}>
        Attachments ({attachments.length})
      </Text>
      
      <FlatList
        data={attachments}
        renderItem={renderAttachment}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  headerText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F3F4F6',
    marginBottom: 12,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  loadingText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  emptyText: {
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  attachmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#374151',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#4B5563',
  },
  attachmentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  fileIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  attachmentDetails: {
    flex: 1,
    minWidth: 0,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F9FAFB',
    marginBottom: 2,
  },
  fileInfo: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  attachmentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  actionButton: {
    padding: 8,
    marginLeft: 4,
  },
  deleteButton: {
    opacity: 0.8,
  },
  actionButtonText: {
    fontSize: 16,
  },
});

export default AttachmentList;