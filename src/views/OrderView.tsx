import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomNavBar } from '../components/BottomNavBar';

export interface OrderViewProps {
  onNavigate?: (screen: any) => void;
}

export const OrderView: React.FC<OrderViewProps> = ({ onNavigate }) => {
  return (
    <SafeAreaView style={styles.viewMainWrapper}>
      <View style={styles.centerContainer}>
        <Text style={styles.hiText}>Hi</Text>
      </View>
      <BottomNavBar onNavigate={onNavigate} currentActive="order" />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  viewMainWrapper: { flex: 1, backgroundColor: '#FFFBF7' },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hiText: { fontSize: 32, fontWeight: '800', color: '#2B1E1A' },
});