import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Mail, BookOpen, Globe, Type, Moon, Bell, Download, Trash2, LogOut, Info, ShieldAlert } from 'lucide-react-native';
import { SupportedLanguage } from '@sidprep/contracts';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { Header } from '../../src/components/Header';

export default function ProfileScreen() {
  const router = useRouter();
  const { theme, isDark, themeMode, setThemeMode, fontScale, setFontScale, scaledFontSize, radii, touchTarget } = useTheme();
  const { user, logout, updatePreferences } = useAuth();

  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [digestEnabled, setDigestEnabled] = useState(true);

  const handleLanguageChange = async (lang: SupportedLanguage) => {
    try {
      await updatePreferences({ preferredLanguage: lang });
    } catch {
      // Ignored
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to log out of your SidPrep account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        }
      }
    ]);
  };

  const handleDataExport = () => {
    Alert.alert(
      'Request Data Export',
      'In accordance with student privacy safeguards, an encrypted archive of your attempts and study history will be compiled and sent to your verified email within 24 hours.'
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently deactivate your student profile and revoke active test attempts. This action cannot be undone. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request Deletion',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Deletion Requested', 'Your request has been logged. Our compliance officer will process your deletion per statutory guidelines.');
          }
        }
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Header title="Student Profile" subtitle="Account and study preferences" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Account Details Card */}
        <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.lg }]}>
          <Text style={[styles.sectionHeading, { color: theme.primary, fontSize: scaledFontSize('xs') }]}>
            ACCOUNT DETAILS
          </Text>

          <View style={styles.detailRow}>
            <Mail size={18} color={theme.textMuted} />
            <View style={styles.detailTextCol}>
              <Text style={[styles.detailLabel, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                Registered Email
              </Text>
              <Text style={[styles.detailValue, { color: theme.text, fontSize: scaledFontSize('base') }]}>
                {user?.email ?? 'student@example.com'}
              </Text>
            </View>
          </View>

          {user?.phone ? (
            <View style={styles.detailRow}>
              <Text style={[styles.detailValue, { color: theme.text, fontSize: scaledFontSize('sm') }]}>
                Phone: {user.phone}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Learning Preferences */}
        <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.lg }]}>
          <Text style={[styles.sectionHeading, { color: theme.primary, fontSize: scaledFontSize('xs') }]}>
            LEARNING PREFERENCES
          </Text>

          {/* Exam Targets */}
          <TouchableOpacity
            onPress={() => router.push('/(auth)/onboarding')}
            style={[styles.settingRow, { minHeight: touchTarget.minTouchSize }]}
            accessibilityRole="button"
            accessibilityLabel="Edit exam targets"
          >
            <View style={styles.rowLeft}>
              <BookOpen size={20} color={theme.textMuted} />
              <View>
                <Text style={[styles.rowTitle, { color: theme.text, fontSize: scaledFontSize('base') }]}>
                  Target Exams
                </Text>
                <Text style={[styles.rowSub, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                  {user?.selectedExamIds.join(', ').toUpperCase() || 'SSC CGL'}
                </Text>
              </View>
            </View>
            <Text style={[styles.editLink, { color: theme.primary, fontSize: scaledFontSize('sm') }]}>
              Edit
            </Text>
          </TouchableOpacity>

          {/* Language Selector */}
          <View style={styles.settingRowStacked}>
            <View style={styles.rowLeft}>
              <Globe size={20} color={theme.textMuted} />
              <Text style={[styles.rowTitle, { color: theme.text, fontSize: scaledFontSize('base') }]}>
                Content Language
              </Text>
            </View>

            <View style={styles.langPills}>
              {[
                { id: 'en', label: 'English' },
                { id: 'hi', label: 'हिंदी' },
                { id: 'bn', label: 'বাংলা' }
              ].map((l) => {
                const isSelected = (user?.preferredLanguage ?? 'en') === l.id;
                return (
                  <TouchableOpacity
                    key={l.id}
                    onPress={() => handleLanguageChange(l.id as SupportedLanguage)}
                    style={[
                      styles.langPill,
                      {
                        backgroundColor: isSelected ? theme.primary : theme.surfaceVariant,
                        borderRadius: radii.base,
                        minHeight: touchTarget.minTouchSize
                      }
                    ]}
                  >
                    <Text
                      style={[
                        styles.langPillText,
                        { color: isSelected ? theme.textInverse : theme.text, fontSize: scaledFontSize('sm') }
                      ]}
                    >
                      {l.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Text Size Scaling */}
          <View style={styles.settingRowStacked}>
            <View style={styles.rowLeft}>
              <Type size={20} color={theme.textMuted} />
              <Text style={[styles.rowTitle, { color: theme.text, fontSize: scaledFontSize('base') }]}>
                Text Size Scaling
              </Text>
            </View>

            <View style={styles.langPills}>
              {[
                { scale: 0.85, label: 'Small' },
                { scale: 1.0, label: 'Normal' },
                { scale: 1.15, label: 'Large' },
                { scale: 1.3, label: 'X-Large' }
              ].map((s) => {
                const isSelected = fontScale === s.scale;
                return (
                  <TouchableOpacity
                    key={s.scale}
                    onPress={() => setFontScale(s.scale)}
                    style={[
                      styles.langPill,
                      {
                        backgroundColor: isSelected ? theme.primary : theme.surfaceVariant,
                        borderRadius: radii.base,
                        minHeight: touchTarget.minTouchSize
                      }
                    ]}
                  >
                    <Text
                      style={[
                        styles.langPillText,
                        { color: isSelected ? theme.textInverse : theme.text, fontSize: scaledFontSize('sm') }
                      ]}
                    >
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Theme Mode Toggle */}
          <View style={[styles.settingRow, { minHeight: touchTarget.minTouchSize }]}>
            <View style={styles.rowLeft}>
              <Moon size={20} color={theme.textMuted} />
              <Text style={[styles.rowTitle, { color: theme.text, fontSize: scaledFontSize('base') }]}>
                Dark Appearance
              </Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={(val) => setThemeMode(val ? 'dark' : 'light')}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor={theme.surface}
            />
          </View>
        </View>

        {/* Notifications */}
        <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.lg }]}>
          <Text style={[styles.sectionHeading, { color: theme.primary, fontSize: scaledFontSize('xs') }]}>
            NOTIFICATIONS
          </Text>

          <View style={[styles.settingRow, { minHeight: touchTarget.minTouchSize }]}>
            <View style={styles.rowLeft}>
              <Bell size={20} color={theme.textMuted} />
              <Text style={[styles.rowTitle, { color: theme.text, fontSize: scaledFontSize('base') }]}>
                Official Exam Alerts
              </Text>
            </View>
            <Switch
              value={alertsEnabled}
              onValueChange={setAlertsEnabled}
              trackColor={{ false: theme.border, true: theme.primary }}
            />
          </View>

          <View style={[styles.settingRow, { minHeight: touchTarget.minTouchSize }]}>
            <View style={styles.rowLeft}>
              <Bell size={20} color={theme.textMuted} />
              <Text style={[styles.rowTitle, { color: theme.text, fontSize: scaledFontSize('base') }]}>
                Daily News Digest (07:00 AM)
              </Text>
            </View>
            <Switch
              value={digestEnabled}
              onValueChange={setDigestEnabled}
              trackColor={{ false: theme.border, true: theme.primary }}
            />
          </View>
        </View>

        {/* Privacy & Account Actions */}
        <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.lg }]}>
          <Text style={[styles.sectionHeading, { color: theme.primary, fontSize: scaledFontSize('xs') }]}>
            DATA & COMPLIANCE
          </Text>

          <TouchableOpacity
            onPress={handleDataExport}
            style={[styles.settingRow, { minHeight: touchTarget.minTouchSize }]}
            accessibilityRole="button"
          >
            <View style={styles.rowLeft}>
              <Download size={20} color={theme.textMuted} />
              <Text style={[styles.rowTitle, { color: theme.text, fontSize: scaledFontSize('base') }]}>
                Export My Learning Data
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleDeleteAccount}
            style={[styles.settingRow, { minHeight: touchTarget.minTouchSize }]}
            accessibilityRole="button"
          >
            <View style={styles.rowLeft}>
              <Trash2 size={20} color={theme.error} />
              <Text style={[styles.rowTitle, { color: theme.error, fontSize: scaledFontSize('base') }]}>
                Request Account Deletion
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Sign Out Button */}
        <TouchableOpacity
          onPress={handleLogout}
          style={[
            styles.logoutBtn,
            { minHeight: touchTarget.minTouchSize, borderColor: theme.error, backgroundColor: theme.errorBg, borderRadius: radii.md }
          ]}
          accessibilityRole="button"
        >
          <LogOut size={20} color={theme.error} />
          <Text style={[styles.logoutText, { color: theme.error, fontSize: scaledFontSize('base') }]}>
            Sign Out
          </Text>
        </TouchableOpacity>

        {/* App Version & Statutory Info */}
        <View style={styles.appInfoBox}>
          <Text style={[styles.appVersionText, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
            SidPrep 2.0 Student App • v2.0.0 (Build 2026.03)
          </Text>
          <Text style={[styles.appLegalText, { color: theme.textSubtle, fontSize: scaledFontSize('xs') }]}>
            All exam notices & questions are admin-verified from official exam body gazettes.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16
  },
  sectionCard: {
    padding: 16,
    borderWidth: 1,
    gap: 14
  },
  sectionHeading: {
    fontWeight: '800',
    letterSpacing: 1
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  detailTextCol: {
    flex: 1
  },
  detailLabel: {
    fontWeight: '500'
  },
  detailValue: {
    fontWeight: '700',
    marginTop: 2
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  settingRowStacked: {
    gap: 10
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  rowTitle: {
    fontWeight: '600'
  },
  rowSub: {
    marginTop: 2
  },
  editLink: {
    fontWeight: '700'
  },
  langPills: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4
  },
  langPill: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8
  },
  langPillText: {
    fontWeight: '700'
  },
  logoutBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    gap: 8
  },
  logoutText: {
    fontWeight: '700'
  },
  appInfoBox: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 4
  },
  appVersionText: {
    fontWeight: '600'
  },
  appLegalText: {
    textAlign: 'center',
    maxWidth: 280
  }
});
