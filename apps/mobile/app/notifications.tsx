import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { Bell, ShieldCheck, ExternalLink, Calendar, BookOpen, AlertCircle } from 'lucide-react-native';
import { NotificationItem } from '@sidprep/contracts';
import { useTheme } from '../src/context/ThemeContext';
import { Header } from '../src/components/Header';

export default function NotificationsScreen() {
  const { theme, scaledFontSize, radii, touchTarget } = useTheme();

  // Initial notifications list
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: 'notif-1',
      type: 'OFFICIAL_EXAM_ALERT',
      title: 'SSC CGL 2026 Tier-I Revised Normalization Notice',
      body: 'Staff Selection Commission has issued an official clarification regarding multi-shift score normalization.',
      examCode: 'SSC_CGL',
      isOfficialVerified: true,
      officialSourceUrl: 'https://ssc.gov.in/notices/cgl-normalization-2026',
      receivedAt: '2026-03-02T10:00:00Z',
      isRead: false
    },
    {
      id: 'notif-2',
      type: 'CURRENT_AFFAIRS_DIGEST',
      title: 'Daily Digest: RBI Repo Rate & Railway Kavach 4.0',
      body: 'Today\'s 2 high-priority briefs are ready for review with 5-minute practice quiz.',
      isOfficialVerified: false,
      receivedAt: '2026-03-03T07:00:00Z',
      isRead: true
    },
    {
      id: 'notif-3',
      type: 'STUDY_REMINDER',
      title: 'Daily Goal Reminder: 25 minutes left',
      body: 'You have completed 35 of your 60-minute daily study target. Revise Quantitative Aptitude to maintain your 4-day streak!',
      isOfficialVerified: false,
      receivedAt: '2026-03-03T18:00:00Z',
      isRead: true
    }
  ]);

  const markAllRead = () => {
    setNotifications(notifications.map(n => ({ ...n, isRead: true })));
  };

  const getIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'OFFICIAL_EXAM_ALERT':
        return <ShieldCheck size={20} color={theme.verified} />;
      case 'CURRENT_AFFAIRS_DIGEST':
        return <Calendar size={20} color={theme.primary} />;
      case 'STUDY_REMINDER':
        return <Bell size={20} color={theme.warning} />;
      default:
        return <AlertCircle size={20} color={theme.textMuted} />;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Header
        title="Notifications"
        subtitle="Official alerts & study reminders"
        showBack={true}
        rightAction={
          <TouchableOpacity
            onPress={markAllRead}
            style={[styles.readAllBtn, { minHeight: touchTarget.minTouchSize }]}
          >
            <Text style={[styles.readAllText, { color: theme.primary, fontSize: scaledFontSize('xs') }]}>
              Mark All Read
            </Text>
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {notifications.map((item) => (
          <View
            key={item.id}
            style={[
              styles.card,
              {
                backgroundColor: item.isRead ? theme.surface : theme.primaryContainer,
                borderColor: item.isRead ? theme.border : theme.primaryLight,
                borderRadius: radii.md
              }
            ]}
          >
            <View style={styles.cardHeader}>
              <View style={styles.iconTitleRow}>
                {getIcon(item.type)}
                <Text style={[styles.title, { color: theme.text, fontSize: scaledFontSize('base') }]}>
                  {item.title}
                </Text>
              </View>

              <Text style={[styles.timeText, { color: theme.textSubtle, fontSize: scaledFontSize('xs') }]}>
                {new Date(item.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>

            <Text style={[styles.bodyText, { color: theme.textMuted, fontSize: scaledFontSize('sm') }]}>
              {item.body}
            </Text>

            {item.isOfficialVerified && item.officialSourceUrl && (
              <TouchableOpacity
                onPress={() => Linking.openURL(item.officialSourceUrl!)}
                style={styles.sourceBtn}
                accessibilityRole="link"
              >
                <Text style={[styles.sourceBtnText, { color: theme.primary, fontSize: scaledFontSize('xs') }]}>
                  View Official Notice Document
                </Text>
                <ExternalLink size={12} color={theme.primary} />
              </TouchableOpacity>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  readAllBtn: {
    justifyContent: 'center',
    paddingHorizontal: 8
  },
  readAllText: {
    fontWeight: '700'
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 12
  },
  card: {
    padding: 16,
    borderWidth: 1,
    gap: 8
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  iconTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8
  },
  title: {
    fontWeight: '700',
    lineHeight: 20
  },
  timeText: {
    fontWeight: '500'
  },
  bodyText: {
    lineHeight: 20
  },
  sourceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4
  },
  sourceBtnText: {
    fontWeight: '700'
  }
});
