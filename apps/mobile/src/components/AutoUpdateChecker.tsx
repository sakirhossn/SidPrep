import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Modal } from 'react-native';
import Constants from 'expo-constants';
import { Download, RefreshCw, X, AlertTriangle, Sparkles } from 'lucide-react-native';
import { api } from '../api/client';
import { useTheme } from '../context/ThemeContext';

interface VersionInfo {
  currentVersion: string;
  minVersion: string;
  apkUrl: string;
  releaseNotes: string;
  publishedAt: string;
}

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.replace(/^v/, '').split('.').map(Number);
  const parts2 = v2.replace(/^v/, '').split('.').map(Number);
  const len = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < len; i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

export function AutoUpdateChecker() {
  const { theme } = useTheme();
  const [updateInfo, setUpdateInfo] = useState<VersionInfo | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const localVersion = Constants.expoConfig?.version || '2.0.0';

  useEffect(() => {
    let isMounted = true;
    const checkForUpdates = async () => {
      try {
        const res = await api.checkAppVersion();
        if (!isMounted || !res?.currentVersion) return;

        // Check if server version is newer than current running app
        if (compareVersions(res.currentVersion, localVersion) > 0) {
          setUpdateInfo(res);
          setModalVisible(true);
        }
      } catch (err) {
        // Silently skip if offline or server unreachable
      }
    };

    checkForUpdates();
    return () => {
      isMounted = false;
    };
  }, [localVersion]);

  if (!updateInfo || dismissed) return null;

  const isMandatory = compareVersions(updateInfo.minVersion, localVersion) > 0;

  const handleDownloadUpdate = async () => {
    const targetUrl = updateInfo.apkUrl || 'https://github.com/sakirhossn/SidPrep/releases/latest/download/SidPrep-Student-release.apk';
    try {
      await Linking.openURL(targetUrl);
    } catch {
      try {
        await Linking.openURL('https://github.com/sakirhossn/SidPrep/releases/latest');
      } catch {
        Linking.openURL('https://sidprep.in/app');
      }
    }
  };

  return (
    <Modal
      transparent
      animationType="fade"
      visible={modalVisible}
      onRequestClose={() => {
        if (!isMandatory) setDismissed(true);
      }}
    >
      <View style={styles.overlay}>
        <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Sparkles size={24} color="#DFF19B" />
            </View>
            <Text style={[styles.title, { color: theme.text }]}>New Update Available</Text>
            <Text style={[styles.versionBadge, { backgroundColor: '#1E3C2C', color: '#DFF19B' }]}>
              v{updateInfo.currentVersion} Available (Current: v{localVersion})
            </Text>
          </View>

          {/* Release Notes */}
          <View style={styles.body}>
            <Text style={[styles.notesHeader, { color: theme.textMuted }]}>What's New:</Text>
            <Text style={[styles.releaseNotes, { color: theme.text }]}>
              {updateInfo.releaseNotes || 'Bug fixes, performance improvements, and enhanced exam test runner.'}
            </Text>

            {isMandatory && (
              <View style={styles.mandatoryNotice}>
                <AlertTriangle size={14} color="#f59e0b" />
                <Text style={styles.mandatoryText}>
                  This is a critical update required for syncing exam tests.
                </Text>
              </View>
            )}
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.updateButton, { backgroundColor: '#1E3C2C' }]}
              onPress={handleDownloadUpdate}
              activeOpacity={0.8}
            >
              <Download size={18} color="#ffffff" style={{ marginRight: 8 }} />
              <Text style={styles.updateButtonText}>Download & Install APK</Text>
            </TouchableOpacity>

            {!isMandatory && (
              <TouchableOpacity
                style={styles.laterButton}
                onPress={() => setDismissed(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.laterButtonText, { color: theme.textMuted }]}>
                  Remind Me Later
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: '#1E3C2C',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  versionBadge: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  body: {
    marginVertical: 12,
  },
  notesHeader: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  releaseNotes: {
    fontSize: 14,
    lineHeight: 20,
  },
  mandatoryNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    padding: 10,
    borderRadius: 12,
    marginTop: 12,
  },
  mandatoryText: {
    fontSize: 11,
    color: '#d97706',
    fontWeight: '600',
    flex: 1,
  },
  buttonContainer: {
    marginTop: 20,
    gap: 10,
  },
  updateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
  },
  updateButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  laterButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  laterButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
