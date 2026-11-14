import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Linking, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { ShieldCheck, ExternalLink, Bookmark, HelpCircle, AlertTriangle } from 'lucide-react-native';
import { CurrentAffairBrief } from '@sidprep/contracts';
import { api } from '../../src/api/client';
import { sqliteDb } from '../../src/services/sqliteDatabase';
import { useTheme } from '../../src/context/ThemeContext';
import { Header } from '../../src/components/Header';

const CACHE_KEY_AFFAIRS = 'cache_current_affairs';

export default function CurrentAffairsScreen() {
  const router = useRouter();
  const { theme, scaledFontSize, radii, touchTarget } = useTheme();

  const [articles, setArticles] = useState<CurrentAffairBrief[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAffairs = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      const res = await api.getCurrentAffairs();
      const items = Array.isArray(res?.items) ? res.items : Array.isArray((res as any)?.data) ? (res as any).data : [];
      if (items.length > 0) {
        setArticles(items);
        await sqliteDb.setCache(CACHE_KEY_AFFAIRS, items);
      } else {
        setArticles([]);
      }
    } catch {
      // Offline fallback
      const cached = await sqliteDb.getCache<CurrentAffairBrief[]>(CACHE_KEY_AFFAIRS);
      if (Array.isArray(cached) && cached.length > 0) {
        setArticles(cached);
      } else {
        setArticles([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAffairs();
  }, [loadAffairs]);

  const categories = [
    { id: 'ALL', label: 'All Updates' },
    { id: 'ECONOMY_BANKING', label: 'Economy & Banking' },
    { id: 'RAILWAYS_DEFENCE', label: 'Railways & Defence' },
    { id: 'GOVERNMENT_SCHEMES', label: 'Govt Schemes' },
    { id: 'POLITY_GOVERNANCE', label: 'Polity' }
  ];

  const filteredArticles = selectedCategory === 'ALL'
    ? (articles ?? [])
    : (articles ?? []).filter(a => a?.category === selectedCategory);

  const openSource = (url: string) => {
    Linking.openURL(url);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Header title="Daily Current Affairs" subtitle="Fact-checked exam briefs with official citations" />

      {/* Category Pills */}
      <View style={[styles.categoryContainer, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                onPress={() => setSelectedCategory(cat.id)}
                style={[
                  styles.catChip,
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
                    styles.catChipText,
                    { color: isSelected ? theme.textInverse : theme.text, fontSize: scaledFontSize('sm') }
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAffairs(true)} />}
      >
        {/* Daily Quiz Promotion Banner */}
        <TouchableOpacity
          onPress={() => router.push('/study-plan')}
          style={[
            styles.quizBanner,
            { backgroundColor: theme.primaryContainer, borderColor: theme.primaryLight, borderRadius: radii.lg }
          ]}
          accessibilityRole="button"
          accessibilityLabel="Take today's current affairs quiz"
        >
          <View style={styles.quizBannerContent}>
            <Text style={[styles.quizBannerTitle, { color: theme.primary, fontSize: scaledFontSize('base') }]}>
              Daily Current Affairs Quiz
            </Text>
            <Text style={[styles.quizBannerSub, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
              5 High-yield questions derived from today's verified official briefs.
            </Text>
          </View>
          <View style={[styles.quizActionBtn, { backgroundColor: theme.primary }]}>
            <HelpCircle size={18} color={theme.textInverse} />
          </View>
        </TouchableOpacity>

        {loading && (!articles || articles.length === 0) ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={theme.primary} />
        ) : (filteredArticles && filteredArticles.length > 0) ? (
          filteredArticles.map((item) => (
            <View
              key={item.id}
              style={[
                styles.articleCard,
                { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.lg }
              ]}
            >
              {/* Card Meta Top Row */}
              <View style={styles.cardTopRow}>
                <View style={styles.tagGroup}>
                  <View style={[styles.catBadge, { backgroundColor: theme.surfaceVariant }]}>
                    <Text style={[styles.catBadgeText, { color: theme.primary, fontSize: scaledFontSize('xs') }]}>
                      {item.categoryLabel}
                    </Text>
                  </View>
                  <View style={[styles.verifiedPill, { backgroundColor: theme.verifiedBg }]}>
                    <ShieldCheck size={12} color={theme.verified} />
                    <Text style={[styles.verifiedText, { color: theme.verified, fontSize: scaledFontSize('xs') }]}>
                      Official Verified
                    </Text>
                  </View>
                </View>

                <Text style={[styles.dateText, { color: theme.textSubtle, fontSize: scaledFontSize('xs') }]}>
                  {new Date(item.publishedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </Text>
              </View>

              {/* Title */}
              <Text style={[styles.articleTitle, { color: theme.text, fontSize: scaledFontSize('lg') }]}>
                {item.title}
              </Text>

              {/* Correction notice if issued */}
              {item.hasCorrection && item.correctionNote && (
                <View style={[styles.correctionBox, { backgroundColor: theme.warningBg, borderColor: theme.warningBorder }]}>
                  <AlertTriangle size={14} color={theme.warning} />
                  <Text style={[styles.correctionText, { color: theme.warning, fontSize: scaledFontSize('xs') }]}>
                    Editorial Correction: {item.correctionNote}
                  </Text>
                </View>
              )}

              {/* Concise Summary */}
              <Text style={[styles.articleSummary, { color: theme.text, fontSize: scaledFontSize('sm') }]}>
                {item.summary}
              </Text>

              {/* High-yield Revision Pointers */}
              {item.revisionPointers && item.revisionPointers.length > 0 && (
                <View style={[styles.revisionBox, { backgroundColor: theme.surfaceSubtle, borderRadius: radii.md }]}>
                  <Text style={[styles.revisionHeading, { color: theme.primary, fontSize: scaledFontSize('xs') }]}>
                    EXAM REVISION POINTERS
                  </Text>
                  {(item.revisionPointers ?? []).map((p, idx) => (
                    <Text key={idx} style={[styles.pointerText, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                      • {p}
                    </Text>
                  ))}
                </View>
              )}

              {/* Source Attribution & Link */}
              <View style={[styles.cardFooter, { borderTopColor: theme.border }]}>
                <Text style={[styles.sourceText, { color: theme.textSubtle, fontSize: scaledFontSize('xs') }]}>
                  Source: <Text style={{ color: theme.text, fontWeight: '600' }}>{item.sourceName}</Text>
                </Text>

                <TouchableOpacity
                  onPress={() => openSource(item.sourceUrl)}
                  style={[
                    styles.sourceLinkBtn,
                    { minHeight: touchTarget.minTouchSize, minWidth: touchTarget.minTouchSize }
                  ]}
                  accessibilityRole="link"
                  accessibilityLabel={`Read official source for ${item.title}`}
                >
                  <Text style={[styles.sourceLinkText, { color: theme.primary, fontSize: scaledFontSize('xs') }]}>
                    Official Link
                  </Text>
                  <ExternalLink size={12} color={theme.primary} />
                </TouchableOpacity>
              </View>
            </View>
          ))
        ) : (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 8 }}>
            <HelpCircle size={36} color={theme.textMuted} />
            <Text style={{ fontWeight: '700', marginTop: 8, color: theme.text, fontSize: scaledFontSize('base') }}>
              No updates in this category
            </Text>
            <Text style={{ textAlign: 'center', color: theme.textMuted, fontSize: scaledFontSize('xs') }}>
              Select "All Updates" or check back later
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
  categoryContainer: {
    borderBottomWidth: 1,
    paddingVertical: 10
  },
  categoryScroll: {
    paddingHorizontal: 16,
    gap: 8
  },
  catChip: {
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center'
  },
  catChipText: {
    fontWeight: '700'
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 16
  },
  quizBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderWidth: 1,
    gap: 12
  },
  quizBannerContent: {
    flex: 1
  },
  quizBannerTitle: {
    fontWeight: '800',
    marginBottom: 2
  },
  quizBannerSub: {
    lineHeight: 16
  },
  quizActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  articleCard: {
    padding: 16,
    borderWidth: 1,
    gap: 10
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  tagGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  catBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6
  },
  catBadgeText: {
    fontWeight: '700'
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 4
  },
  verifiedText: {
    fontWeight: '600'
  },
  dateText: {
    fontWeight: '500'
  },
  articleTitle: {
    fontWeight: '800',
    lineHeight: 24
  },
  correctionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    gap: 6
  },
  correctionText: {
    flex: 1,
    fontWeight: '600'
  },
  articleSummary: {
    lineHeight: 22
  },
  revisionBox: {
    padding: 12,
    gap: 6,
    marginTop: 4
  },
  revisionHeading: {
    fontWeight: '800',
    letterSpacing: 0.5
  },
  pointerText: {
    lineHeight: 18
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1
  },
  sourceText: {
    flex: 1
  },
  sourceLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    justifyContent: 'center'
  },
  sourceLinkText: {
    fontWeight: '700'
  }
});
