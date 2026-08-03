import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomNavBar } from '../components/BottomNavBar';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ProfileViewProps {
  onNavigate?: (screen: any) => void;
  onLogout?: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ onNavigate, onLogout }) => {
  
  const handleLogoutPress = () => {
    Alert.alert(
      "Log Out",
      "Are you sure you want to log out?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Log Out", 
          style: "destructive", 
          onPress: async () => {
            if (onLogout) {
              onLogout();
            }
          } 
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.viewMainWrapper}>
      <View style={styles.centerContainer}>
        <Text style={styles.hiText}>Profile</Text>

        {/* LOGOUT BUTTON */}
        <TouchableOpacity 
          style={styles.logoutButton} 
          onPress={handleLogoutPress}
          activeOpacity={0.8}
        >
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity>
      </View>

      <BottomNavBar onNavigate={onNavigate} currentActive="profile" />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  viewMainWrapper: { flex: 1, backgroundColor: '#FFFBF7' },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  hiText: { fontSize: 28, fontWeight: '800', color: '#2B1E1A', marginBottom: 30 },
  logoutButton: {
    backgroundColor: '#D2691E',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#2B1E1A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  logoutButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});