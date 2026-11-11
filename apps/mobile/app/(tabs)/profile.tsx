import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Mail,
  User,
  Phone,
  BookOpen,
  Globe,
  Type,
  Moon,
  Bell,
  Download,
  Trash2,
  LogOut,
  KeyRound,
  ShieldCheck,
  Eye,
  EyeOff,
  CheckCircle2,
  Laptop,
  Check,
  X,
} from 'lucide-react-native';
import {
  SupportedLanguage,
  validatePasswordPolicy,
  estimatePasswordStrength,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from '@sidprep/contracts';
import { api } from '../../src/api/client';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { Header } from '../../src/components/Header';

export default function ProfileScreen() {
  const router = useRouter();
  const { theme, isDark, themeMode, setThemeMode, fontScale, setFontScale, scaledFontSize, radii, touchTarget } = useTheme();
  const { user, logout, updatePreferences, changePassword } = useAuth();

  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [digestEnabled, setDigestEnabled] = useState(true);

  // Change Password State
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [revokeSessionsLoading, setRevokeSessionsLoading] = useState(false);

  const passwordPolicy = validatePasswordPolicy(newPassword);
  const passwordStrength = estimatePasswordStrength(newPassword);
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;
  const canSubmitPassword = currentPassword.length > 0 && passwordPolicy.isValid && passwordsMatch && !passwordLoading;

  const handleLanguageChange = async (lang: SupportedLanguage) => {
    try {
      await updatePreferences({ preferredLanguage: lang });
    } catch {
      // Ignored
    }
  };

  const handleChangePasswordSubmit = async () => {
    if (!passwordPolicy.isValid) {
      Alert.alert('Password Policy', passwordPolicy.errors[0] || 'Password does not meet requirements.');
      return;
    }
    if (!passwordsMatch) {
      Alert.alert('Mismatch', 'New passwords do not match.');
      return;
    }

    setPasswordLoading(true);
    try {
      await changePassword(currentPassword, newPassword, confirmPassword);
      Alert.alert(
        'Password Changed',
        'Your password has been successfully updated. All other active sessions have been revoked.'
      );
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowChangePassword(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update password.');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleRevokeAllOtherSessions = async () => {
    Alert.alert(
      'Revoke Other Devices',
      'Are you sure you want to sign out of all other devices and web browsers?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out Other Devices',
          style: 'destructive',
          onPress: async () => {
            setRevokeSessionsLoading(true);
            try {
              await api.revokeSession();
              Alert.alert('Sessions Revoked', 'All other login sessions have been terminated.');
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to revoke other sessions.');
            } finally {
              setRevokeSessionsLoading(false);
            }
          },
        },
      ]
    );
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
        },
      },
    ]);
  };

  const handleDataExport = async () => {
    try {
      const res = await api.requestDataExport();
      Alert.alert(
        'Export Queued',
        `Ticket ID: ${res.requestId}\nStatus: ${res.status}\n\nAn encrypted archive of your attempts and study history is being compiled and will be delivered to your registered email.`
      );
    } catch (e: any) {
      Alert.alert('Export Error', e.message || 'Unable to queue export request. Please try again later.');
    }
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
          onPress: async () => {
            try {
              const res = await api.requestAccountDeletion();
              Alert.alert(
                'Deletion Request Registered',
                `Ticket ID: ${res.requestId}\nStatus: ${res.status}\n\nOur compliance officer will process your deletion per statutory guidelines.`
              );
            } catch (e: any) {
              Alert.alert('Request Error', e.message || 'Unable to register deletion request.');
            }
          },
        },
      ]
    );
  };

  const displayName = user
    ? (user as any).isSingleName
      ? (user as any).firstName || 'Candidate'
      : `${(user as any).firstName || ''} ${(user as any).lastName || ''}`.trim() || 'Candidate'
    : 'Candidate';

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Header title="Student Profile" subtitle="Account, credentials & preferences" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Account Details Card */}
        <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.lg }]}>
          <Text style={[styles.sectionHeading, { color: theme.primary, fontSize: scaledFontSize('xs') }]}>
            ACCOUNT &amp; IDENTITY
          </Text>

          {/* Student Name */}
          <View style={styles.detailRow}>
            <User size={18} color={theme.textMuted} />
            <View style={styles.detailTextCol}>
              <Text style={[styles.detailLabel, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                Full Legal Name
              </Text>
              <Text style={[styles.detailValue, { color: theme.text, fontSize: scaledFontSize('base') }]}>
                {displayName}
              </Text>
            </View>
          </View>

          {/* Email */}
          <View style={styles.detailRow}>
            <Mail size={18} color={theme.textMuted} />
            <View style={styles.detailTextCol}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.detailLabel, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                  Registered Email
                </Text>
                <View style={styles.verifiedTag}>
                  <CheckCircle2 size={12} color="#10B981" />
                  <Text style={styles.verifiedTagText}>Verified</Text>
                </View>
              </View>
              <Text style={[styles.detailValue, { color: theme.text, fontSize: scaledFontSize('base') }]}>
                {user?.email ?? 'student@example.com'}
              </Text>
            </View>
          </View>

          {/* Phone */}
          {user?.phone ? (
            <View style={styles.detailRow}>
              <Phone size={18} color={theme.textMuted} />
              <View style={styles.detailTextCol}>
                <Text style={[styles.detailLabel, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                  Mobile Number
                </Text>
                <Text style={[styles.detailValue, { color: theme.text, fontSize: scaledFontSize('base') }]}>
                  +91 {user.phone}
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* Security & Password Card */}
        <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.lg }]}>
          <Text style={[styles.sectionHeading, { color: theme.primary, fontSize: scaledFontSize('xs') }]}>
            SECURITY &amp; CREDENTIALS
          </Text>

          <TouchableOpacity
            style={[styles.settingRow, { minHeight: touchTarget.minTouchSize }]}
            onPress={() => setShowChangePassword(!showChangePassword)}
          >
            <View style={styles.rowLeft}>
              <KeyRound size={20} color={theme.textMuted} />
              <View>
                <Text style={[styles.rowTitle, { color: theme.text, fontSize: scaledFontSize('base') }]}>
                  Change Account Password
                </Text>
                <Text style={[styles.rowSub, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                  Update credentials &amp; revoke other sessions
                </Text>
              </View>
            </View>
            <Text style={[styles.editLink, { color: theme.primary, fontSize: scaledFontSize('sm') }]}>
              {showChangePassword ? 'Close' : 'Update'}
            </Text>
          </TouchableOpacity>

          {/* Change Password Expansion Form */}
          {showChangePassword && (
            <View style={[styles.changePasswordBox, { backgroundColor: theme.surfaceVariant, borderRadius: radii.md, borderColor: theme.border }]}>
              {/* Current Password */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: theme.text, fontSize: scaledFontSize('xs') }]}>
                  Current Password
                </Text>
                <View style={[styles.textInputBox, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                  <TextInput
                    style={[styles.textInput, { color: theme.text }]}
                    placeholder="Enter current password"
                    placeholderTextColor={theme.textMuted}
                    secureTextEntry={!showCurrent}
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                  />
                  <TouchableOpacity onPress={() => setShowCurrent(!showCurrent)}>
                    {showCurrent ? <EyeOff size={16} color={theme.textMuted} /> : <Eye size={16} color={theme.textMuted} />}
                  </TouchableOpacity>
                </View>
              </View>

              {/* New Password */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: theme.text, fontSize: scaledFontSize('xs') }]}>
                  New Password (8–14 characters)
                </Text>
                <View style={[styles.textInputBox, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                  <TextInput
                    style={[styles.textInput, { color: theme.text }]}
                    placeholder="Enter new password"
                    placeholderTextColor={theme.textMuted}
                    secureTextEntry={!showNew}
                    value={newPassword}
                    onChangeText={setNewPassword}
                  />
                  <TouchableOpacity onPress={() => setShowNew(!showNew)}>
                    {showNew ? <EyeOff size={16} color={theme.textMuted} /> : <Eye size={16} color={theme.textMuted} />}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Confirm Password */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: theme.text, fontSize: scaledFontSize('xs') }]}>
                  Confirm New Password
                </Text>
                <View style={[styles.textInputBox, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                  <TextInput
                    style={[styles.textInput, { color: theme.text }]}
                    placeholder="Re-enter new password"
                    placeholderTextColor={theme.textMuted}
                    secureTextEntry={!showConfirm}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                  />
                  <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)}>
                    {showConfirm ? <EyeOff size={16} color={theme.textMuted} /> : <Eye size={16} color={theme.textMuted} />}
                  </TouchableOpacity>
                </View>
                {confirmPassword.length > 0 && !passwordsMatch && (
                  <Text style={{ color: theme.error, fontSize: 11, marginTop: 4 }}>Passwords do not match.</Text>
                )}
              </View>

              {/* Live Checklist */}
              {newPassword.length > 0 && (
                <View style={styles.policyBox}>
                  <Text style={[styles.strengthTxt, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                    Strength: <Text style={{ color: passwordStrength.level === 'Strong' ? '#10B981' : passwordStrength.level === 'Medium' ? '#F59E0B' : '#EF4444', fontWeight: '700' }}>{passwordStrength.level}</Text>
                  </Text>
                  <View style={styles.checkRow}>
                    {newPassword.length > PASSWORD_MAX_LENGTH ? <X size={12} color="#EF4444" /> : passwordPolicy.criteria.minLength && passwordPolicy.criteria.maxLength ? <Check size={12} color="#10B981" /> : <Text style={{ color: theme.textMuted, fontSize: 10 }}>○</Text>}
                    <Text style={[styles.checkTxt, { color: newPassword.length > PASSWORD_MAX_LENGTH ? '#EF4444' : theme.textMuted }]}>
                      8–14 characters {newPassword.length > PASSWORD_MAX_LENGTH && '(Overlength)'}
                    </Text>
                  </View>
                  <View style={styles.checkRow}>
                    {passwordPolicy.criteria.hasUppercase ? <Check size={12} color="#10B981" /> : <Text style={{ color: theme.textMuted, fontSize: 10 }}>○</Text>}
                    <Text style={[styles.checkTxt, { color: theme.textMuted }]}>Uppercase (A–Z)</Text>
                  </View>
                  <View style={styles.checkRow}>
                    {passwordPolicy.criteria.hasLowercase ? <Check size={12} color="#10B981" /> : <Text style={{ color: theme.textMuted, fontSize: 10 }}>○</Text>}
                    <Text style={[styles.checkTxt, { color: theme.textMuted }]}>Lowercase (a–z)</Text>
                  </View>
                  <View style={styles.checkRow}>
                    {passwordPolicy.criteria.hasNumber ? <Check size={12} color="#10B981" /> : <Text style={{ color: theme.textMuted, fontSize: 10 }}>○</Text>}
                    <Text style={[styles.checkTxt, { color: theme.textMuted }]}>Number (0–9)</Text>
                  </View>
                  <View style={styles.checkRow}>
                    {passwordPolicy.criteria.hasSymbol ? <Check size={12} color="#10B981" /> : <Text style={{ color: theme.textMuted, fontSize: 10 }}>○</Text>}
                    <Text style={[styles.checkTxt, { color: theme.textMuted }]}>Special symbol (!@#$)</Text>
                  </View>
                </View>
              )}

              <TouchableOpacity
                style={[styles.savePasswordBtn, { backgroundColor: theme.primary, borderRadius: radii.md, opacity: canSubmitPassword ? 1 : 0.5 }]}
                onPress={handleChangePasswordSubmit}
                disabled={!canSubmitPassword}
              >
                {passwordLoading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.savePasswordBtnText}>Save New Password</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Session Management */}
          <TouchableOpacity
            style={[styles.settingRow, { minHeight: touchTarget.minTouchSize }]}
            onPress={handleRevokeAllOtherSessions}
            disabled={revokeSessionsLoading}
          >
            <View style={styles.rowLeft}>
              <Laptop size={20} color={theme.textMuted} />
              <View>
                <Text style={[styles.rowTitle, { color: theme.text, fontSize: scaledFontSize('base') }]}>
                  Active Devices &amp; Sessions
                </Text>
                <Text style={[styles.rowSub, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
                  Sign out of all other browsers &amp; mobile apps
                </Text>
              </View>
            </View>
            {revokeSessionsLoading ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Text style={[styles.editLink, { color: theme.error, fontSize: scaledFontSize('sm') }]}>
                Revoke All
              </Text>
            )}
          </TouchableOpacity>
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
                  {user?.selectedExamIds?.join(', ').toUpperCase() || (user as any)?.targetExams?.join(', ').toUpperCase() || 'SSC CGL'}
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
                { id: 'bn', label: 'বাংলা' },
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
                        minHeight: touchTarget.minTouchSize,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.langPillText,
                        { color: isSelected ? theme.textInverse : theme.text, fontSize: scaledFontSize('sm') },
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
                { scale: 1.3, label: 'X-Large' },
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
                        minHeight: touchTarget.minTouchSize,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.langPillText,
                        { color: isSelected ? theme.textInverse : theme.text, fontSize: scaledFontSize('sm') },
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

        {/* Data & Compliance */}
        <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.lg }]}>
          <Text style={[styles.sectionHeading, { color: theme.primary, fontSize: scaledFontSize('xs') }]}>
            DATA &amp; COMPLIANCE
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
            { minHeight: touchTarget.minTouchSize, borderColor: theme.error, backgroundColor: theme.errorBg, borderRadius: radii.md },
          ]}
          accessibilityRole="button"
        >
          <LogOut size={20} color={theme.error} />
          <Text style={[styles.logoutText, { color: theme.error, fontSize: scaledFontSize('base') }]}>
            Sign Out
          </Text>
        </TouchableOpacity>

        {/* App Version Info */}
        <View style={styles.appInfoBox}>
          <Text style={[styles.appVersionText, { color: theme.textMuted, fontSize: scaledFontSize('xs') }]}>
            SidPrep 2.0 Student App • v2.0.0 (Build 2026.03)
          </Text>
          <Text style={[styles.appLegalText, { color: theme.textSubtle, fontSize: scaledFontSize('xs') }]}>
            All exam notices &amp; questions are admin-verified from official exam body gazettes.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  sectionCard: {
    padding: 16,
    borderWidth: 1,
  },
  sectionHeading: {
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  detailTextCol: {
    flex: 1,
  },
  detailLabel: {
    fontWeight: '500',
  },
  detailValue: {
    fontWeight: '700',
    marginTop: 2,
  },
  verifiedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#10B98118',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  verifiedTagText: {
    color: '#10B981',
    fontWeight: '700',
    fontSize: 10,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  settingRowStacked: {
    paddingVertical: 10,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  rowTitle: {
    fontWeight: '600',
  },
  rowSub: {
    marginTop: 2,
  },
  editLink: {
    fontWeight: '700',
  },
  changePasswordBox: {
    padding: 14,
    borderWidth: 1,
    marginTop: 8,
    marginBottom: 8,
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontWeight: '600',
    marginBottom: 4,
  },
  textInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 42,
  },
  textInput: {
    flex: 1,
    paddingVertical: 4,
    fontSize: 13,
  },
  policyBox: {
    padding: 8,
    borderRadius: 6,
    gap: 4,
    marginBottom: 12,
  },
  strengthTxt: {
    marginBottom: 4,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  checkTxt: {
    fontSize: 11,
  },
  savePasswordBtn: {
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  savePasswordBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  langPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  langPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  langPillText: {
    fontWeight: '600',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    paddingVertical: 12,
  },
  logoutText: {
    fontWeight: '700',
  },
  appInfoBox: {
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  appVersionText: {
    fontWeight: '600',
  },
  appLegalText: {
    textAlign: 'center',
    lineHeight: 16,
  },
});
