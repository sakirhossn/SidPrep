import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Download, AlertTriangle, Sparkles, Bell, ShieldCheck } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAppUpdate } from '../context/UpdateContext';

export function AutoUpdateChecker() {
  const { theme } = useTheme();
  const {
    installedApp,
    presentation,
    showPermissionExplanation,
    dismissOptionalUpdate,
    openUpdateAction,
    acceptPermissionExplanation,
    declinePermissionExplanation,
  } = useAppUpdate();

  if (showPermissionExplanation) {
    return (
      <Modal
        transparent
        animationType="fade"
        visible={true}
        onRequestClose={declinePermissionExplanation}
      >
        <View style={styles.overlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
            <View style={styles.header}>
              <View style={styles.iconContainer}>
                <Bell size={24} color="#DFF19B" />
              </View>
              <Text style={[styles.title, { color: theme.text }]}>
                Stay Updated with SidPrep
              </Text>
              <Text style={[styles.subCaption, { color: theme.textMuted }]}>
                App Release Notifications
              </Text>
            </View>

            <View style={styles.body}>
              <Text style={[styles.releaseNotes, { color: theme.text }]}>
                Allow notifications to be alerted when a new SidPrep update, exam feature, or important test-sync fix is ready. You can continue using the app normally if you choose not to enable them.
              </Text>
            </View>

            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.updateButton, { backgroundColor: '#1E3C2C' }]}
                onPress={acceptPermissionExplanation}
                activeOpacity={0.8}
              >
                <ShieldCheck size={18} color="#ffffff" style={{ marginRight: 8 }} />
                <Text style={styles.updateButtonText}>Enable Update Alerts</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.laterButton}
                onPress={declinePermissionExplanation}
                activeOpacity={0.7}
              >
                <Text style={[styles.laterButtonText, { color: theme.textMuted }]}>
                  Not Now
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  if (
    presentation.action !== 'SHOW_MANDATORY_UPDATE' &&
    presentation.action !== 'SHOW_OPTIONAL_UPDATE'
  ) {
    return null;
  }

  const release = presentation.release;
  const isMandatory = presentation.action === 'SHOW_MANDATORY_UPDATE';

  return (
    <Modal
      transparent
      animationType="fade"
      visible={true}
      onRequestClose={() => {
        if (!isMandatory) dismissOptionalUpdate(release.id);
      }}
    >
      <View style={styles.overlay}>
        <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Sparkles size={24} color="#DFF19B" />
            </View>
            <Text style={[styles.title, { color: theme.text }]}>
              {isMandatory ? 'Update Required' : 'New Update Available'}
            </Text>
            <Text
              style={[
                styles.versionBadge,
                { backgroundColor: '#1E3C2C', color: '#DFF19B' },
              ]}
            >
              v{release.version} (Build {release.buildNumber}) • Installed: v
              {installedApp.appVersion}
            </Text>
          </View>

          <View style={styles.body}>
            <Text style={[styles.notesHeader, { color: theme.textMuted }]}>
              What’s New:
            </Text>
            <Text style={[styles.releaseNotes, { color: theme.text }]}>
              {release.releaseNotes ||
                'Bug fixes, security enhancements, and improved exam runner reliability.'}
            </Text>

            {release.requiresNativeBinary && (
              <Text style={[styles.installNotice, { color: theme.textMuted }]}>
                Opens your platform store or package installer and requires OS confirmation to install.
              </Text>
            )}

            {isMandatory && (
              <View style={styles.mandatoryNotice}>
                <AlertTriangle size={14} color="#f59e0b" />
                <Text style={styles.mandatoryText}>
                  This version is below the minimum supported release (v
                  {release.minSupportedVersion}) or marked critical. Please update to continue safely.
                </Text>
              </View>
            )}
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.updateButton, { backgroundColor: '#1E3C2C' }]}
              onPress={() => openUpdateAction(release.downloadUrl)}
              activeOpacity={0.8}
            >
              <Download size={18} color="#ffffff" style={{ marginRight: 8 }} />
              <Text style={styles.updateButtonText}>Update Now</Text>
            </TouchableOpacity>

            {!isMandatory && (
              <TouchableOpacity
                style={styles.laterButton}
                onPress={() => dismissOptionalUpdate(release.id)}
                activeOpacity={0.7}
              >
                <Text style={[styles.laterButtonText, { color: theme.textMuted }]}>
                  Later
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
    textAlign: 'center',
  },
  subCaption: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  versionBadge: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    overflow: 'hidden',
    textAlign: 'center',
  },
  body: {
    marginVertical: 10,
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
  installNotice: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 10,
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
