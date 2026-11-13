import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Platform } from 'react-native';
import { X, Download, ShieldCheck, FileText, AlertCircle, ShieldAlert } from 'lucide-react-native';
import { WebView } from 'react-native-webview';
import { ResourceItem } from '@sidprep/contracts';
import { api } from '../api/client';
import { useTheme } from '../context/ThemeContext';
import { telemetry } from '../services/telemetry';

interface FilePreviewModalProps {
  visible: boolean;
  onClose: () => void;
  resource: ResourceItem | null;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  visible,
  onClose,
  resource
}) => {
  const { theme, scaledFontSize, radii, touchTarget } = useTheme();
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccessMessage, setDownloadSuccessMessage] = useState<string | null>(null);

  if (!resource) return null;

  const handleDownload = async () => {
    if (!resource.downloadAllowed) {
      Alert.alert(
        'Download Restricted',
        'This material is available for in-app preview only in accordance with admin copyright and publishing policies.'
      );
      return;
    }

    setIsDownloading(true);
    setDownloadSuccessMessage(null);
    telemetry.track('DOWNLOAD_STARTED', { resourceId: resource.id });

    try {
      const ticket = await api.getDownloadTicket(resource.id);
      setIsDownloading(false);
      setDownloadSuccessMessage(`Authorized download link generated. Valid until: ${new Date(ticket.expiresAt).toLocaleTimeString()}`);
    } catch (err: any) {
      setIsDownloading(false);
      telemetry.track('DOWNLOAD_FAILED', { resourceId: resource.id, error: String(err.message) });
      Alert.alert('Download Error', err.message || 'Unable to request download ticket at this time.');
    }
  };

  const previewTargetUrl = resource.fileType === 'DOCX'
    ? resource.sanitizedDocxPdfPreviewUrl
    : resource.previewUrl;

  const fullPreviewUrl = previewTargetUrl
    ? previewTargetUrl.startsWith('http')
      ? previewTargetUrl
      : `${api.getBaseUrl()}${previewTargetUrl}`
    : null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {/* Top Header */}
        <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          <View style={styles.headerTitleBox}>
            <Text
              style={[styles.headerTitle, { color: theme.text, fontSize: scaledFontSize('base') }]}
              numberOfLines={1}
            >
              {resource.title}
            </Text>
            <Text style={[styles.headerSub, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
              {resource.fileType} • {resource.fileSizeFormatted}
            </Text>
          </View>

          <TouchableOpacity
            onPress={onClose}
            style={[
              styles.closeBtn,
              { minWidth: touchTarget.minTouchSize, minHeight: touchTarget.minTouchSize }
            ]}
            accessibilityRole="button"
            accessibilityLabel="Close document preview"
          >
            <X size={24} color={theme.text} />
          </TouchableOpacity>
        </View>

        {/* Content Preview Area */}
        <ScrollView style={styles.contentScroll} contentContainerStyle={styles.scrollContent}>
          {/* Metadata Card */}
          <View style={[styles.metaCard, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.md }]}>
            <View style={styles.policyRow}>
              <View style={[styles.policyPill, { backgroundColor: theme.primaryContainer }]}>
                <ShieldCheck size={14} color={theme.primary} />
                <Text style={[styles.policyText, { color: theme.primary, fontSize: scaledFontSize('xs') }]}>
                  {resource.downloadAllowed ? 'Preview & Download Permitted' : 'In-App Preview Only'}
                </Text>
              </View>

              <Text style={[styles.sourceText, { color: theme.textSubtle, fontSize: scaledFontSize('xs') }]}>
                Source: {resource.sourceAttribution}
              </Text>
            </View>

            <Text style={[styles.descText, { color: theme.text, fontSize: scaledFontSize('sm') }]}>
              {resource.description}
            </Text>

            <View style={styles.detailsRow}>
              <Text style={[styles.detailItem, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                Exam: <Text style={{ color: theme.text, fontWeight: '600' }}>{resource.examTitle}</Text>
              </Text>
              <Text style={[styles.detailItem, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                Subject: <Text style={{ color: theme.text, fontWeight: '600' }}>{resource.subjectName}</Text>
              </Text>
              {resource.pageCount && (
                <Text style={[styles.detailItem, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                  Pages: <Text style={{ color: theme.text, fontWeight: '600' }}>{resource.pageCount}</Text>
                </Text>
              )}
            </View>
          </View>

          {/* In-App Safe Viewer Canvas / Embedded WebView */}
          {fullPreviewUrl && resource.fileType === 'PDF' ? (
            <View
              style={[
                styles.webViewCard,
                { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.md }
              ]}
            >
              <WebView
                source={{ uri: fullPreviewUrl }}
                style={styles.webView}
                startInLoadingState={true}
                renderLoading={() => (
                  <View style={styles.webLoading}>
                    <ActivityIndicator size="large" color={theme.primary} />
                    <Text style={{ color: theme.textMuted, fontSize: scaledFontSize('xs'), marginTop: 8 }}>
                      Streaming document bytes...
                    </Text>
                  </View>
                )}
                scalesPageToFit={true}
                originWhitelist={['*']}
              />
            </View>
          ) : (
            <View
              style={[
                styles.viewerCanvas,
                { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.md }
              ]}
            >
              <FileText size={48} color={theme.primary} />
              <Text style={[styles.canvasTitle, { color: theme.text, fontSize: scaledFontSize('base') }]}>
                {resource.fileType === 'DOCX' ? 'Sanitized DOCX Preview' : 'Progressive Document Viewer'}
              </Text>
              <Text style={[styles.canvasNotice, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                Loaded securely without macro execution or local binary extraction.
              </Text>
              {fullPreviewUrl ? (
                <View style={[styles.streamPill, { backgroundColor: theme.surfaceVariant }]}>
                  <Text style={[styles.streamText, { color: theme.primary, fontSize: scaledFontSize('xs') }]}>
                    Secure Channel: {fullPreviewUrl}
                  </Text>
                </View>
              ) : null}
            </View>
          )}

          {/* Screenshot & Digital Protection Notice */}
          <View
            style={[
              styles.disclaimerBox,
              { backgroundColor: theme.surfaceVariant, borderColor: theme.border, borderRadius: radii.sm }
            ]}
          >
            <ShieldAlert size={14} color={theme.textMuted} />
            <Text style={[styles.disclaimerText, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
              Digital Protection Notice: Displaying PDF contents on screen cannot guarantee prevention of copying or screenshots. SidPrep enforces token expiration and role-based permissions at the API layer.
            </Text>
          </View>

          {/* Download Action Section — Strictly Gated */}
          {resource.downloadAllowed ? (
            <View style={styles.downloadSection}>
              <TouchableOpacity
                onPress={handleDownload}
                disabled={isDownloading}
                style={[
                  styles.downloadBtn,
                  {
                    minHeight: touchTarget.minTouchSize,
                    backgroundColor: theme.primary,
                    borderRadius: radii.md
                  }
                ]}
                accessibilityRole="button"
                accessibilityLabel="Download full document"
              >
                {isDownloading ? (
                  <ActivityIndicator color={theme.textInverse} />
                ) : (
                  <>
                    <Download size={20} color={theme.textInverse} />
                    <Text style={[styles.downloadBtnText, { color: theme.textInverse, fontSize: scaledFontSize('base') }]}>
                      Download Document ({resource.fileSizeFormatted})
                    </Text>
                  </>
                )}
              </TouchableOpacity>
              {downloadSuccessMessage && (
                <View style={[styles.noticeBox, { backgroundColor: theme.successBg, borderColor: theme.successBorder }]}>
                  <Text style={[styles.noticeText, { color: theme.success, fontSize: scaledFontSize('xs') }]}>
                    {downloadSuccessMessage}
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={[styles.noticeBox, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
              <AlertCircle size={16} color={theme.textMuted} />
              <Text style={[styles.noticeText, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                Offline download disabled for this file per admin distribution policy.
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1
  },
  headerTitleBox: {
    flex: 1,
    marginRight: 12
  },
  headerTitle: {
    fontWeight: '700'
  },
  headerSub: {
    marginTop: 2
  },
  closeBtn: {
    justifyContent: 'center',
    alignItems: 'center'
  },
  contentScroll: {
    flex: 1
  },
  scrollContent: {
    padding: 16,
    gap: 16
  },
  metaCard: {
    padding: 16,
    borderWidth: 1,
    gap: 12
  },
  policyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  policyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4
  },
  policyText: {
    fontWeight: '600'
  },
  sourceText: {
    fontWeight: '500'
  },
  descText: {
    lineHeight: 20
  },
  detailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0'
  },
  detailItem: {
    fontWeight: '500'
  },
  viewerCanvas: {
    padding: 32,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 260,
    gap: 12
  },
  canvasTitle: {
    fontWeight: '700',
    marginTop: 8
  },
  canvasNotice: {
    textAlign: 'center',
    maxWidth: 280
  },
  streamPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 8
  },
  streamText: {
    fontWeight: '500'
  },
  downloadSection: {
    gap: 8
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    gap: 8
  },
  downloadBtnText: {
    fontWeight: '700'
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8
  },
  noticeText: {
    flex: 1,
    lineHeight: 18,
    fontWeight: '500'
  },
  webViewCard: {
    height: 380,
    borderWidth: 1,
    overflow: 'hidden'
  },
  webView: {
    flex: 1
  },
  webLoading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)'
  },
  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 10,
    borderWidth: 1,
    gap: 8,
    marginTop: 4
  },
  disclaimerText: {
    flex: 1,
    lineHeight: 16,
    fontWeight: '400'
  }
});
