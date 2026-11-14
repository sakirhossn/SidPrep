import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { BookOpen, Clock, HelpCircle, Award, Lock, CheckCircle } from 'lucide-react-native';
import { TestItem, TestType } from '@sidprep/contracts';
import { api } from '../../src/api/client';
import { sqliteDb } from '../../src/services/sqliteDatabase';
import { useTheme } from '../../src/context/ThemeContext';
import { Header } from '../../src/components/Header';

const CACHE_KEY_TESTS = 'cache_tests_catalogue';

export default function MockCatalogueScreen() {
  const router = useRouter();
  const { theme, scaledFontSize, radii, touchTarget } = useTheme();

  const [tests, setTests] = useState<TestItem[]>([]);
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadTests = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      const params = selectedType !== 'ALL' ? { type: selectedType } : undefined;
      const res = await api.getTests(params);
      const items: TestItem[] = Array.isArray(res?.items) ? res.items : Array.isArray((res as any)?.data) ? (res as any).data : [];
      if (items.length > 0) {
        setTests(items);
        await sqliteDb.setCache(CACHE_KEY_TESTS, items);
      } else {
        setTests([]);
      }
    } catch {
      // Offline fallback: load from SQLite cache
      const cached = await sqliteDb.getCache<TestItem[]>(CACHE_KEY_TESTS);
      if (Array.isArray(cached) && cached.length > 0) {
        const filtered = selectedType === 'ALL' ? cached : cached.filter(t => t.type === selectedType);
        setTests(filtered);
      } else {
        setTests([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedType]);

  useEffect(() => {
    loadTests();
  }, [loadTests]);

  const filterTabs = [
    { id: 'ALL', label: 'All Mocks' },
    { id: 'FULL_LENGTH', label: 'Full Length' },
    { id: 'SECTIONAL', label: 'Sectional' },
    { id: 'PYQ', label: 'Previous Year' }
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Header title="Mock Tests" subtitle="Authentic exam patterns with negative marking" />

      {/* Filter Tabs Horizontal Scroll */}
      <View style={[styles.filterContainer, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {filterTabs.map((tab) => {
            const isSelected = selectedType === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                onPress={() => setSelectedType(tab.id)}
                style={[
                  styles.filterTab,
                  {
                    minHeight: touchTarget.minTouchSize,
                    backgroundColor: isSelected ? theme.primary : theme.surfaceVariant,
                    borderRadius: radii.md
                  }
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
              >
                <Text
                  style={[
                    styles.filterTabText,
                    {
                      color: isSelected ? theme.textInverse : theme.text,
                      fontSize: scaledFontSize('sm')
                    }
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Tests List */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadTests(true)} />}
      >
        {loading && (!tests || tests.length === 0) ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={theme.primary} />
        ) : (tests && tests.length > 0) ? (
          tests.map((test) => (
            <TouchableOpacity
              key={test.id}
              onPress={() => router.push(`/mock/${test.id}`)}
              style={[
                styles.testCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  borderRadius: radii.lg,
                  minHeight: touchTarget.minTouchSize
                }
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Select test: ${test.title}`}
            >
              {/* Badge Row */}
              <View style={styles.badgeRow}>
                <View style={[styles.typePill, { backgroundColor: theme.primaryContainer }]}>
                  <Text style={[styles.typePillText, { color: theme.primary, fontSize: scaledFontSize('xs') }]}>
                    {test.type ? test.type.replace(/_/g, ' ') : 'MOCK'}
                  </Text>
                </View>

                {test.pyqYear && (
                  <View style={[styles.pyqPill, { backgroundColor: theme.warningBg }]}>
                    <Text style={[styles.pyqPillText, { color: theme.warning, fontSize: scaledFontSize('xs') }]}>
                      PYQ {test.pyqYear}
                    </Text>
                  </View>
                )}

                <View style={styles.rightBadge}>
                  {test.isLocked ? (
                    <View style={styles.lockRow}>
                      <Lock size={14} color={theme.textMuted} />
                      <Text style={[styles.lockText, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                        Locked
                      </Text>
                    </View>
                  ) : (
                    <View style={[styles.freePill, { backgroundColor: theme.successBg }]}>
                      <Text style={[styles.freePillText, { color: theme.success, fontSize: scaledFontSize('xs') }]}>
                        Free Access
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              <Text style={[styles.testTitle, { color: theme.text, fontSize: scaledFontSize('base') }]}>
                {test.title}
              </Text>

              {test.description ? (
                <Text
                  style={[styles.testDesc, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}
                  numberOfLines={2}
                >
                  {test.description}
                </Text>
              ) : null}

              {/* Specs Row */}
              <View style={[styles.specsRow, { borderTopColor: theme.border }]}>
                <View style={styles.specItem}>
                  <Clock size={14} color={theme.textSubtle} />
                  <Text style={[styles.specText, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                    {test.durationMinutes} Mins
                  </Text>
                </View>

                <View style={styles.specItem}>
                  <HelpCircle size={14} color={theme.textSubtle} />
                  <Text style={[styles.specText, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                    {test.totalQuestions} Questions
                  </Text>
                </View>

                <View style={styles.specItem}>
                  <Award size={14} color={theme.textSubtle} />
                  <Text style={[styles.specText, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                    {test.totalMarks} Marks
                  </Text>
                </View>
              </View>

              {/* Past Attempt info if available */}
              {test.userLastAttempt && (
                <View style={[styles.lastAttemptBox, { backgroundColor: theme.surfaceVariant }]}>
                  <CheckCircle size={14} color={theme.success} />
                  <Text style={[styles.lastAttemptText, { color: theme.text, fontSize: scaledFontSize('xs') }]}>
                    Last Score: <Text style={{ fontWeight: '700' }}>{test.userLastAttempt.score}</Text> / {test.totalMarks}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyCard}>
            <HelpCircle size={36} color={theme.textMuted} />
            <Text style={[styles.emptyTitle, { color: theme.text, fontSize: scaledFontSize('base') }]}>
              No tests in this category
            </Text>
            <Text style={[styles.emptySubtitle, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
              Select "All Mocks" to browse available question sets
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  filterContainer: {
    borderBottomWidth: 1,
    paddingVertical: 10
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
    paddingBottom: 32,
    gap: 12
  },
  testCard: {
    padding: 16,
    borderWidth: 1,
    gap: 10
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  typePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  typePillText: {
    fontWeight: '700'
  },
  pyqPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  pyqPillText: {
    fontWeight: '700'
  },
  rightBadge: {
    marginLeft: 'auto'
  },
  lockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  lockText: {
    fontWeight: '600'
  },
  freePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  freePillText: {
    fontWeight: '700'
  },
  testTitle: {
    fontWeight: '700',
    lineHeight: 22
  },
  testDesc: {
    lineHeight: 18
  },
  specsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1
  },
  specItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  specText: {
    fontWeight: '500'
  },
  lastAttemptBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 6,
    gap: 6,
    marginTop: 2
  },
  lastAttemptText: {
    fontWeight: '500'
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 8
  },
  emptyTitle: {
    fontWeight: '700',
    marginTop: 8
  },
  emptySubtitle: {
    textAlign: 'center'
  }
});
