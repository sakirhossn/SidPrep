import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { FileText, Download, ShieldCheck, Search, Filter } from 'lucide-react-native';
import { ResourceItem } from '@sidprep/contracts';
import { api } from '../../src/api/client';
import { sqliteDb } from '../../src/services/sqliteDatabase';
import { useTheme } from '../../src/context/ThemeContext';
import { Header } from '../../src/components/Header';
import { FilePreviewModal } from '../../src/components/FilePreviewModal';

const CACHE_KEY_RESOURCES = 'cache_resources_list';

const DEFAULT_RESOURCES: ResourceItem[] = [
  {
    id: 'res-cgl-quant-formulas',
    title: 'SSC CGL Quantitative Aptitude High-Speed Formula Handbook',
    description: 'Complete arithmetic and advance math formulas with geometry theorems and algebra shortcuts.',
    fileType: 'PDF',
    fileSizeBytes: 2450000,
    fileSizeFormatted: '2.4 MB',
    language: 'en',
    examId: 'ssc-cgl',
    examTitle: 'SSC CGL 2026',
    subjectName: 'Quantitative Aptitude',
    uploadedAt: '2026-02-15T00:00:00Z',
    sourceAttribution: 'SidPrep Content Team',
    previewAllowed: true,
    downloadAllowed: false,
    offlineAllowed: true,
    isOfflineCached: false
  },
  {
    id: 'res-rrb-science-notes',
    title: 'RRB NTPC General Science Revision Notes (Physics & Chemistry)',
    description: 'Essential NCERT-based summary covering SI units, periodic table, and mechanics laws.',
    fileType: 'PDF',
    fileSizeBytes: 1850000,
    fileSizeFormatted: '1.8 MB',
    language: 'en',
    examId: 'rrb-ntpc',
    examTitle: 'RRB NTPC',
    subjectName: 'General Science',
    uploadedAt: '2026-02-20T00:00:00Z',
    sourceAttribution: 'SidPrep Science Faculty',
    previewAllowed: true,
    downloadAllowed: false,
    offlineAllowed: true,
    isOfflineCached: false
  }
];

export default function ResourcesScreen() {
  const { theme, scaledFontSize, radii, touchTarget } = useTheme();

  const [resources, setResources] = useState<ResourceItem[]>(DEFAULT_RESOURCES);
  const [selectedFileType, setSelectedFileType] = useState<string>('ALL');
  const [activePreviewResource, setActivePreviewResource] = useState<ResourceItem | null>(null);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadResources = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      const res = await api.getResources();
      const items = Array.isArray(res?.items) ? res.items : Array.isArray((res as any)?.data) ? (res as any).data : [];
      if (items.length > 0) {
        setResources(items);
        await sqliteDb.setCache(CACHE_KEY_RESOURCES, items);
      } else {
        setResources(DEFAULT_RESOURCES);
      }
    } catch {
      const cached = await sqliteDb.getCache<ResourceItem[]>(CACHE_KEY_RESOURCES);
      if (Array.isArray(cached) && cached.length > 0) {
        setResources(cached);
      } else {
        setResources(DEFAULT_RESOURCES);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadResources();
  }, [loadResources]);

  const fileTypeFilters = [
    { id: 'ALL', label: 'All Files' },
    { id: 'PDF', label: 'PDF Handouts' },
    { id: 'DOCX', label: 'Notes (DOCX)' }
  ];

  const filteredResources = selectedFileType === 'ALL'
    ? (resources ?? [])
    : (resources ?? []).filter(r => r?.fileType === selectedFileType);

  const handleOpenPreview = (item: ResourceItem) => {
    setActivePreviewResource(item);
    setPreviewModalVisible(true);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Header title="Resource Library" subtitle="Verified formula books and study notes" showBack={true} />

      {/* Filter Tabs */}
      <View style={[styles.filterBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {fileTypeFilters.map((tab) => {
            const isSelected = selectedFileType === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                onPress={() => setSelectedFileType(tab.id)}
                style={[
                  styles.filterTab,
                  {
                    minHeight: touchTarget.minTouchSize,
                    backgroundColor: isSelected ? theme.primary : theme.surfaceVariant,
                    borderRadius: radii.md
                  }
                ]}
              >
                <Text
                  style={[
                    styles.filterTabText,
                    { color: isSelected ? theme.textInverse : theme.text, fontSize: scaledFontSize('sm') }
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadResources(true)} />}
      >
        {loading && (!resources || resources.length === 0) ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={theme.primary} />
        ) : (
          (filteredResources ?? []).map((item) => (
            <TouchableOpacity
              key={item.id}
              onPress={() => handleOpenPreview(item)}
              style={[
                styles.itemCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  borderRadius: radii.lg,
                  minHeight: touchTarget.minTouchSize
                }
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Preview resource: ${item.title}`}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.typeBadge, { backgroundColor: theme.primaryContainer }]}>
                  <Text style={[styles.typeText, { color: theme.primary, fontSize: scaledFontSize('xs') }]}>
                    {item.fileType} • {item.fileSizeFormatted}
                  </Text>
                </View>

                {item.downloadAllowed ? (
                  <View style={[styles.policyPill, { backgroundColor: theme.successBg }]}>
                    <ShieldCheck size={12} color={theme.success} />
                    <Text style={[styles.policyPillText, { color: theme.success, fontSize: scaledFontSize('xs') }]}>
                      Download Allowed
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.policyPill, { backgroundColor: theme.surfaceVariant }]}>
                    <Text style={[styles.policyPillText, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                      Preview Only
                    </Text>
                  </View>
                )}
              </View>

              <Text style={[styles.title, { color: theme.text, fontSize: scaledFontSize('base') }]}>
                {item.title}
              </Text>

              <Text style={[styles.desc, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]} numberOfLines={2}>
                {item.description}
              </Text>

              <View style={[styles.footerRow, { borderTopColor: theme.border }]}>
                <Text style={[styles.examSubject, { color: theme.textSubtle, fontSize: scaledFontSize('xs') }]}>
                  {item.examTitle} • {item.subjectName}
                </Text>
                <Text style={[styles.previewActionText, { color: theme.primary, fontSize: scaledFontSize('xs') }]}>
                  Tap to Preview →
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* File Preview Modal */}
      <FilePreviewModal
        visible={previewModalVisible}
        onClose={() => setPreviewModalVisible(false)}
        resource={activePreviewResource}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  filterBar: {
    paddingVertical: 10,
    borderBottomWidth: 1
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8
  },
  filterTab: {
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center'
  },
  filterTabText: {
    fontWeight: '700'
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 12
  },
  itemCard: {
    padding: 16,
    borderWidth: 1,
    gap: 10
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  typeText: {
    fontWeight: '700'
  },
  policyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 4
  },
  policyPillText: {
    fontWeight: '600'
  },
  title: {
    fontWeight: '700',
    lineHeight: 22
  },
  desc: {
    lineHeight: 18
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1
  },
  examSubject: {
    fontWeight: '500'
  },
  previewActionText: {
    fontWeight: '700'
  }
});
