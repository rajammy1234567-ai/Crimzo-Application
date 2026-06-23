import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  StatusBar,
  Modal,
  Clipboard,
  TextInput,
} from 'react-native';
import { KeyboardAwareScrollView, KeyboardModalFrame } from '../../components/KeyboardAware';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import * as ImagePicker from 'expo-image-picker';

import { apiFetch, apiGet, apiUpload } from '../../lib/apiClient';

export default function EditProfileScreen() {
  const { user, token, updateUser } = useAuth();
  const router = useRouter();
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [showAvatarPreview, setShowAvatarPreview] = useState(false);
  const [tempAvatarUri, setTempAvatarUri] = useState<string | null>(null);

  // Profile fields
  const [nickname, setNickname] = useState(user?.username || `User${user?.id || '000'}`);
  const [gender, setGender] = useState('Male');
  const [age, setAge] = useState('23');
  const [region, setRegion] = useState('India');
  const [location, setLocation] = useState('Hidden');
  const [language, setLanguage] = useState('English');
  const [secondLanguage, setSecondLanguage] = useState('');
  const [tags, setTags] = useState('');
  const [selfIntro, setSelfIntro] = useState(user?.bio || '');
  const [avatar, setAvatar] = useState(user?.avatar || '');

  // Edit Modal State
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editField, setEditField] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      try {
        const data = await apiGet<{
          success?: boolean;
          profile?: {
            username?: string;
            bio?: string;
            country?: string;
            avatar?: string;
            gender?: string;
            age?: string;
            language?: string;
            second_language?: string;
            tags?: string;
            show_location?: boolean;
          };
        }>('/api/user/profile/full', token);
        if (data.success && data.profile) {
          const p = data.profile;
          setNickname(p.username || nickname);
          setSelfIntro(p.bio || '');
          setRegion(p.country || 'India');
          setAvatar(p.avatar || '');
          setGender(p.gender || 'Male');
          setAge(p.age || '');
          setLanguage(p.language || 'English');
          setSecondLanguage(p.second_language || '');
          setTags(p.tags || '');
          setLocation(p.show_location ? 'Visible' : 'Hidden');
        }
      } catch (e) {
        console.error('Load profile edit error:', e);
      }
    };
    load();
  }, [token]);

  const copyToClipboard = () => {
    Clipboard.setString(String(user?.crimzo_id || user?.id || ''));
    Alert.alert('Copied', 'Crimzo ID copied to clipboard!');
  };

  const pickAvatar = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setTempAvatarUri(result.assets[0].uri);
        setShowAvatarPreview(true);
      }
    } catch (e) {
      console.error('Pick avatar error:', e);
    }
  };

  const confirmAvatar = async () => {
    if (!tempAvatarUri) return;
    setShowAvatarPreview(false);
    setAvatarUploading(true);

    try {
      const formData = new FormData();
      formData.append('media', {
        uri: tempAvatarUri,
        type: 'image/jpeg',
        name: 'avatar.jpg',
      } as any);

      const data = await apiUpload<{ success?: boolean; avatar?: string }>(
        '/api/user/avatar',
        formData,
        token,
      );
      if (data.success && data.avatar) {
        setAvatar(data.avatar);
        updateUser({ ...user, avatar: data.avatar });
      } else {
        setAvatar(tempAvatarUri);
      }
    } catch (e) {
      setAvatar(tempAvatarUri);
    }
    setTempAvatarUri(null);
    setAvatarUploading(false);
  };

  const updateProfileField = async (field: string, value: string) => {
    try {
      const body = field === 'show_location'
        ? { show_location: value === 'true' }
        : { [field]: value };
      const data = await apiFetch<{ success?: boolean; error?: string; profile?: Record<string, unknown> }>(
        '/api/user/profile',
        {
          method: 'PUT',
          token,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (data.success) {
        if (field === 'show_location') {
          updateUser({ ...user, show_location: value === 'true' } as any);
        } else {
          updateUser({ ...user, [field]: value } as any);
        }
        if (field === 'username') setNickname(value);
        if (field === 'country') setRegion(value);
        if (field === 'bio') setSelfIntro(value);
        if (field === 'age') setAge(value);
        if (field === 'language') setLanguage(value);
        if (field === 'second_language') setSecondLanguage(value);
        if (field === 'tags') setTags(value);
        if (field === 'gender') setGender(value);
      } else {
        Alert.alert('Error', data.error || 'Failed to update profile');
      }
    } catch (e) {
      console.error('Update profile error:', e);
      Alert.alert('Error', 'Network error. Please try again.');
    }
  };

  const saveEditModal = async () => {
    setIsSaving(true);
    await updateProfileField(editField, editValue);
    setIsSaving(false);
    setEditModalVisible(false);
  };

  const openEditModal = (label: string, field: string, currentValue: string) => {
    setEditLabel(label);
    setEditField(field);
    setEditValue(currentValue);
    setEditModalVisible(true);
  };

  const handleFieldPress = (field: string, currentValue: string) => {
    switch (field) {
      case 'nickname':
        openEditModal('Nickname', 'username', nickname);
        break;
      case 'region':
        openEditModal('Region / Country', 'country', region);
        break;
      case 'selfIntro':
        openEditModal('Self Introduction', 'bio', selfIntro);
        break;
      case 'gender':
        Alert.alert('Select Gender', '', [
          { text: 'Male', onPress: async () => { setGender('Male'); await updateProfileField('gender', 'Male'); } },
          { text: 'Female', onPress: async () => { setGender('Female'); await updateProfileField('gender', 'Female'); } },
          { text: 'Other', onPress: async () => { setGender('Other'); await updateProfileField('gender', 'Other'); } },
          { text: 'Cancel', style: 'cancel' },
        ]);
        break;
      case 'age':
        openEditModal('Age', 'age', age);
        break;
      case 'location':
        Alert.alert('Location Display', '', [
          { text: 'Show', onPress: async () => { setLocation('Visible'); await updateProfileField('show_location', 'true'); } },
          { text: 'Hidden', onPress: async () => { setLocation('Hidden'); await updateProfileField('show_location', 'false'); } },
          { text: 'Cancel', style: 'cancel' },
        ]);
        break;
      case 'language':
        Alert.alert('Select Language', '', [
          { text: 'English', onPress: async () => { setLanguage('English'); await updateProfileField('language', 'English'); } },
          { text: 'Hindi', onPress: async () => { setLanguage('Hindi'); await updateProfileField('language', 'Hindi'); } },
          { text: 'Cancel', style: 'cancel' },
        ]);
        break;
      case 'secondLanguage':
        openEditModal('Second Language', 'second_language', secondLanguage);
        break;
      case 'tags':
        openEditModal('Tags', 'tags', tags);
        break;
      case 'cosmetics':
        router.push('/profile/stickers' as any);
        break;
      default:
        break;
    }
  };

  const profileFields = [
    { label: 'Nickname', value: nickname, field: 'nickname', hasArrow: true },
    { label: 'Gender', value: gender, field: 'gender', hasArrow: false },
    { label: 'Age', value: age, field: 'age', hasArrow: true },
    { label: 'Regions', value: region, field: 'region', hasArrow: true, showFlag: true },
    { label: 'Location', value: location, field: 'location', hasArrow: true },
    { label: 'Language', value: language, field: 'language', hasArrow: false, valueColor: '#9333EA' },
    { label: 'Second Language', value: secondLanguage || '', field: 'secondLanguage', hasArrow: true },
    { label: 'Tags', value: tags || '', field: 'tags', hasArrow: true },
    { label: 'Self-introduction', value: selfIntro || '', field: 'selfIntro', hasArrow: true },
    { label: 'Cosmetics', value: '', field: 'cosmetics', hasArrow: true },
  ];

  const linkedAccounts = [
    { label: 'Email', value: user?.email ? 'Linked' : 'Not linked', route: null as string | null },
    { label: 'Phone', value: 'Add in Wallet', route: '/profile/wallet' },
    { label: 'Settings', value: 'Privacy & more', route: '/profile/settings' },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAwareScrollView style={styles.scroll} includeTopInset>
        {/* Avatar Row */}
        <TouchableOpacity style={styles.avatarRow} onPress={pickAvatar} activeOpacity={0.7}>
          <Text style={styles.fieldLabel}>My Avatar</Text>
          <View style={styles.avatarRight}>
            {avatarUploading ? (
              <ActivityIndicator size="small" color="#9333EA" />
            ) : avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatarImage} />
            ) : (
              <View style={[styles.avatarImage, styles.avatarPlaceholder]}>
                <Ionicons name="person" size={24} color="#999" />
              </View>
            )}
            <Ionicons name="chevron-forward" size={20} color="#C9C9C9" />
          </View>
        </TouchableOpacity>

        {/* ID Row */}
        <View style={styles.menuItem}>
          <Text style={styles.fieldLabel}>ID</Text>
          <View style={styles.idRight}>
            <Text style={styles.idValue}>{user?.crimzo_id || 'Generating...'}</Text>
            <TouchableOpacity style={styles.copyBtn} onPress={copyToClipboard}>
              <Text style={styles.copyText}>Copy</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Profile Fields */}
        <View style={styles.fieldsContainer}>
          {profileFields.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.menuItem, index < profileFields.length - 1 && styles.menuItemBorder]}
              onPress={() => handleFieldPress(item.field, item.value)}
              activeOpacity={0.6}
            >
              <Text style={styles.fieldLabel}>{item.label}</Text>
              <View style={styles.fieldRight}>
                {item.showFlag && <Text style={styles.flagIcon}>🇮🇳</Text>}
                <Text style={[styles.fieldValue, item.valueColor && { color: item.valueColor }]}>
                  {item.value}
                </Text>
                {item.hasArrow && <Ionicons name="chevron-forward" size={20} color="#C9C9C9" />}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Linked Accounts Section */}
        <View style={styles.linkedContainer}>
          {linkedAccounts.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.menuItem, index < linkedAccounts.length - 1 && styles.menuItemBorder]}
              activeOpacity={0.6}
              onPress={() => item.route && router.push(item.route as any)}
              disabled={!item.route}
            >
              <Text style={styles.fieldLabel}>{item.label}</Text>
              <View style={styles.fieldRight}>
                <Text style={styles.fieldValue}>{item.value}</Text>
                {item.route ? <Ionicons name="chevron-forward" size={20} color="#C9C9C9" /> : null}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </KeyboardAwareScrollView>

      {/* Avatar Preview Modal */}
      <Modal visible={showAvatarPreview} animationType="fade" transparent statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Profile Photo</Text>
            {tempAvatarUri && (
              <Image source={{ uri: tempAvatarUri }} style={styles.modalImage} />
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalBtn}
                onPress={() => { setShowAvatarPreview(false); setTempAvatarUri(null); pickAvatar(); }}
              >
                <Ionicons name="crop" size={20} color="#9333EA" />
                <Text style={styles.modalBtnText}>Re-crop</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalDoneBtn]} onPress={confirmAvatar}>
                <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                <Text style={[styles.modalBtnText, { color: '#FFF' }]}>Done</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => { setShowAvatarPreview(false); setTempAvatarUri(null); }}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Generic Text Edit Modal */}
      <Modal visible={editModalVisible} animationType="slide" transparent statusBarTranslucent>
        <KeyboardModalFrame style={styles.modalOverlay}>
          <View style={styles.inputModalContent}>
            <Text style={styles.inputModalTitle}>Edit {editLabel}</Text>

            <View style={styles.inputWrap}>
              <TextInput
                style={styles.textInput}
                value={editValue}
                onChangeText={setEditValue}
                placeholder={`Enter your ${editLabel.toLowerCase()}`}
                placeholderTextColor="#999"
                autoFocus
                multiline={editField === 'bio'}
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#F0F0F0', borderColor: '#E0E0E0' }]}
                onPress={() => setEditModalVisible(false)}
                disabled={isSaving}
              >
                <Text style={[styles.modalBtnText, { color: '#666' }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, styles.modalDoneBtn]}
                onPress={saveEditModal}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="save" size={18} color="#FFF" />
                    <Text style={[styles.modalBtnText, { color: '#FFF' }]}>Save</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardModalFrame>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 16,
    backgroundColor: '#FFF',
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#1A1A1A',
    fontSize: 18,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 12,
  },
  avatarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatarImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarPlaceholder: {
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  fieldsContainer: {
    backgroundColor: '#FFF',
    marginTop: 12,
  },
  linkedContainer: {
    backgroundColor: '#FFF',
    marginTop: 12,
  },
  fieldLabel: {
    color: '#1A1A1A',
    fontSize: 16,
    fontWeight: '400',
  },
  fieldRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  fieldValue: {
    color: '#999',
    fontSize: 15,
  },
  flagIcon: {
    fontSize: 16,
    marginRight: 4,
  },
  idRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  idValue: {
    color: '#999',
    fontSize: 15,
  },
  copyBtn: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  copyText: {
    color: '#666',
    fontSize: 13,
    fontWeight: '500',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    width: '80%',
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
  },
  modalTitle: {
    color: '#1A1A1A',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
  },
  modalImage: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 3,
    borderColor: '#9333EA',
    marginBottom: 24,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(147,51,234,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(147,51,234,0.2)',
  },
  modalDoneBtn: {
    backgroundColor: '#9333EA',
    borderColor: '#9333EA',
  },
  modalBtnText: {
    color: '#9333EA',
    fontSize: 15,
    fontWeight: '700',
  },
  modalCancel: {
    marginTop: 16,
    paddingVertical: 8,
  },
  modalCancelText: {
    color: 'rgba(0,0,0,0.4)',
    fontSize: 14,
    fontWeight: '600',
  },
  // Input modal styles
  inputModalContent: {
    width: '90%',
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 24,
  },
  inputModalTitle: {
    color: '#1A1A1A',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 20,
    textAlign: 'center',
  },
  inputWrap: {
    backgroundColor: '#F5F5F5',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 24,
    minHeight: 56,
  },
  textInput: {
    fontSize: 16,
    color: '#1A1A1A',
  },
});
