// mobile/src/components/FileUpload.js
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'react-native-document-picker';
import axiosClient from '../api/axiosClient';

const FileUpload = ({ noteId, onUploadComplete, onUploadError }) => {
  const [uploading, setUploading] = useState(false);

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
        allowsMultipleSelection: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        await uploadFile(result.assets[0]);
      }
    } catch (error) {
      console.error('Image picker error:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.pick({
        type: [
          DocumentPicker.types.images,
          DocumentPicker.types.pdf,
          DocumentPicker.types.doc,
          DocumentPicker.types.docx,
          DocumentPicker.types.plainText,
        ],
        allowMultiSelection: false,
      });

      if (result && result.length > 0) {
        await uploadFile(result[0]);
      }
    } catch (error) {
      if (!DocumentPicker.isCancel(error)) {
        console.error('Document picker error:', error);
        Alert.alert('Error', 'Failed to pick document');
      }
    }
  };

  const uploadFile = async (file) => {
    try {
      setUploading(true);

      // Validate file size (10MB limit)
      if (file.size && file.size > 10 * 1024 * 1024) {
        Alert.alert('Error', 'File is too large. Maximum size is 10MB.');
        return;
      }

      // Create FormData
      const formData = new FormData();
      
      // Handle different file structures from ImagePicker vs DocumentPicker
      const fileToUpload = {
        uri: file.uri,
        type: file.type || file.mimeType || 'image/jpeg',
        name: file.name || file.fileName || `image_${Date.now()}.jpg`,
      };

      formData.append('file', fileToUpload);
      formData.append('noteId', noteId);

      console.log('📤 Uploading file:', fileToUpload.name);

      const response = await axiosClient.post('/attachments/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      console.log('✅ File uploaded successfully:', response.data);
      
      if (onUploadComplete) {
        onUploadComplete([response.data]);
      }

      Alert.alert('Success', `${fileToUpload.name} uploaded successfully!`);
      
    } catch (error) {
      console.error('❌ Upload failed:', error);
      
      const errorMessage = error.response?.data?.message || error.message || 'Upload failed';
      Alert.alert('Upload Failed', errorMessage);
      
      if (onUploadError) {
        onUploadError(error);
      }
    } finally {
      setUploading(false);
    }
  };

  const showUploadOptions = () => {
    Alert.alert(
      'Upload File',
      'Choose the type of file to upload',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Photo/Image',
          onPress: pickImage,
        },
        {
          text: 'Document',
          onPress: pickDocument,
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.uploadButton, uploading && styles.uploadButtonDisabled]}
        onPress={showUploadOptions}
        disabled={uploading}
      >
        <Text style={styles.uploadButtonText}>
          {uploading ? '📤 Uploading...' : '📎 Attach File'}
        </Text>
      </TouchableOpacity>
      
      {uploading && (
        <Text style={styles.uploadingText}>
          Please wait while your file is being uploaded...
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#1F2937',
    borderRadius: 8,
    margin: 8,
  },
  uploadButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 6,
    alignItems: 'center',
  },
  uploadButtonDisabled: {
    backgroundColor: '#6B7280',
    opacity: 0.6,
  },
  uploadButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  uploadingText: {
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
});

export default FileUpload;