import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Download,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Smartphone,
} from 'lucide-react-native';
import type { UpdateCheckResponse } from '@sidprep/contracts';
import { api } from '../src/api/client';
import { useTheme } from '../src/context/ThemeContext';
import { useAppUpdate } from '../src/context/UpdateContext';
import { Header } from '../src/components/Header';

export default function AppUpdateScreen() {
  const { releaseId } = useLocalSearchParams<{ releaseId?: string }>();
  const router = useRouter();
  const { theme, radii, scaledFontSize, touchTarget } = useTheme();
  const {
    installedApp,
    openUpdateAction,
    dismissOptionalUpdate,
  } = useAppUpdate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UpdateCheckResponse | null>(null);

  const fetchLiveRelease = async () => {
    setLoading(true);
    setError(null);
    try {
      // Always recheck the live published status when opening the update screen
      // so a withdrawn release is never presented as installable.
      const res = await api.checkReleaseUpdates({
        platform: installedApp.platform,
        channel: installedApp.releaseChannel,
        version: installedApp.appVersion,
        buildNumber: installedApp.buildNumber,
        releaseId: typeof releaseId === 'string' ? releaseId : undefined,
      });
      setResult(res);
    } catch (err: any) {
      setError(err?.message || 'Unable to verify published release status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLiveRelease();
  }, [releaseId]);

  const handleLater = () => {
    if (result?.latestRelease?.id && !result.isMandatory) {
      dismissOptionalUpdate(result.latestRelease.id);
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)' as any);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Header
        title="App Update"
        subtitle="Release verification & installation"
        showBack={!result?.isMandatory}
      />

      <ScrollView contentContainerStyle={styles.content}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              borderRadius: radii.lg,
            },
          ]}
        >
          <View style={styles.versionRow}>
            <View style={styles.versionBox}>
              <Text style={[styles.label, { color: theme.textMuted }]}>
                Installed Version
              </Text>
              <Text style={[styles.versionValue, { color: theme.text }]}>
                v{installedApp.appVersion} (Build {installedApp.buildNumber})
              </Text>
              <Text style={[styles.metaSub, { color: theme.textSubtle }]}>
                {installedApp.platform} • {installedApp.releaseChannel}
              </Text>
            </View>
            <Smartphone size={28} color={theme.primary} />
          </View>
        </View>

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={[styles.statusText, { color: theme.textMuted }]}>
              Verifying live release availability...
            </Text>
          </View>
        ) : error ? (
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.surface,
                borderColor: theme.error,
                borderRadius: radii.lg,
              },
            ]}
          >
            <AlertTriangle size={24} color={theme.error} />
            <Text style={[styles.heading, { color: theme.text, marginTop: 8 }]}>
              Offline or Unreachable
            </Text>
            <Text style={[styles.bodyText, { color: theme.textMuted }]}>
              {error}
            </Text>
            <TouchableOpacity
              onPress={fetchLiveRelease}
              style={[
                styles.primaryBtn,
                { backgroundColor: theme.primary, minHeight: touchTarget.minTouchSize },
              ]}
            >
              <RefreshCw size={16} color="#FFFFFF" />
              <Text style={styles.primaryBtnText}>Retry Check</Text>
            </TouchableOpacity>
          </View>
        ) : result?.requestedReleaseWithdrawn ? (
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.surface,
                borderColor: theme.warning,
                borderRadius: radii.lg,
              },
            ]}
          >
            <ShieldAlert size={28} color={theme.warning} />
            <Text style={[styles.heading, { color: theme.text, marginTop: 10 }]}>
              Release Withdrawn
            </Text>
            <Text style={[styles.bodyText, { color: theme.textMuted }]}>
              The release associated with this notification was withdrawn by the SidPrep team and is no longer available for installation.
            </Text>
            {result.updateAvailable && result.latestRelease ? (
              <View style={{ marginTop: 14 }}>
                <Text style={[styles.bodyText, { color: theme.text }]}>
                  Another verified release (v{result.latestRelease.version}) is available below.
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={handleLater}
                style={[
                  styles.secondaryBtn,
                  { borderColor: theme.border, minHeight: touchTarget.minTouchSize },
                ]}
              >
                <Text style={[styles.secondaryBtnText, { color: theme.text }]}>
                  Return to App
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        {!loading && !error && result && !result.updateAvailable && !result.requestedReleaseWithdrawn && (
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.surface,
                borderColor: theme.verified,
                borderRadius: radii.lg,
              },
            ]}
          >
            <CheckCircle2 size={28} color={theme.verified} />
            <Text style={[styles.heading, { color: theme.text, marginTop: 10 }]}>
              You’re Up to Date
            </Text>
            <Text style={[styles.bodyText, { color: theme.textMuted }]}>
              Your installed SidPrep app (v{installedApp.appVersion}) matches the latest published release.
            </Text>
            <TouchableOpacity
              onPress={fetchLiveRelease}
              style={[
                styles.secondaryBtn,
                { borderColor: theme.border, minHeight: touchTarget.minTouchSize },
              ]}
            >
              <RefreshCw size={15} color={theme.primary} />
              <Text style={[styles.secondaryBtnText, { color: theme.primary }]}>
                Check Again
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !error && result?.updateAvailable && result.latestRelease && (
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.surface,
                borderColor: result.isMandatory ? theme.warning : theme.primary,
                borderRadius: radii.lg,
              },
            ]}
          >
            <View style={styles.badgeRow}>
              <Text
                style={[
                  styles.badge,
                  {
                    backgroundColor: result.isMandatory ? '#F59E0B22' : '#1E3C2C',
                    color: result.isMandatory ? '#D97706' : '#DFF19B',
                  },
                ]}
              >
                {result.isMandatory ? 'MANDATORY UPDATE' : 'AVAILABLE UPDATE'}
              </Text>
              <Text style={[styles.metaSub, { color: theme.textMuted }]}>
                v{result.latestRelease.version} (Build {result.latestRelease.buildNumber})
              </Text>
            </View>

            <Text style={[styles.heading, { color: theme.text, marginTop: 10 }]}>
              What’s New in v{result.latestRelease.version}
            </Text>
            <Text style={[styles.bodyText, { color: theme.text }]}>
              {result.latestRelease.releaseNotes ||
                'Includes latest improvements, exam runner reliability updates, and security enhancements.'}
            </Text>

            <View style={[styles.infoNotice, { borderColor: theme.border }]}>
              <Text style={[styles.infoNoticeText, { color: theme.textMuted }]}>
                {result.latestRelease.requiresNativeBinary
                  ? 'This update includes native changes and requires installing a new app binary through your approved store or Android package installer (OS confirmation required).'
                  : 'Follow the approved store or download link below to update safely.'}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => openUpdateAction(result.latestRelease?.downloadUrl)}
              style={[
                styles.primaryBtn,
                {
                  backgroundColor: '#1E3C2C',
                  minHeight: touchTarget.minTouchSize,
                  marginTop: 16,
                },
              ]}
            >
              <Download size={18} color="#FFFFFF" />
              <Text style={styles.primaryBtnText}>Update to v{result.latestRelease.version}</Text>
            </TouchableOpacity>

            {!result.isMandatory && (
              <TouchableOpacity
                onPress={handleLater}
                style={[
                  styles.secondaryBtn,
                  { borderColor: theme.border, minHeight: touchTarget.minTouchSize },
                ]}
              >
                <Text style={[styles.secondaryBtnText, { color: theme.textMuted }]}>
                  Later
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  card: { padding: 18, borderWidth: 1 },
  versionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  versionBox: { flex: 1 },
  label: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  versionValue: { fontSize: 18, fontWeight: '800', marginTop: 4 },
  metaSub: { fontSize: 12, marginTop: 2 },
  centerBox: { padding: 36, alignItems: 'center', gap: 12 },
  statusText: { fontSize: 13 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { fontSize: 10, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' },
  heading: { fontSize: 17, fontWeight: '800', marginBottom: 6 },
  bodyText: { fontSize: 14, lineHeight: 20 },
  infoNotice: { marginTop: 14, padding: 12, borderRadius: 10, borderWidth: 1 },
  infoNoticeText: { fontSize: 12, lineHeight: 17 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 10,
  },
  secondaryBtnText: { fontSize: 13, fontWeight: '700' },
});
