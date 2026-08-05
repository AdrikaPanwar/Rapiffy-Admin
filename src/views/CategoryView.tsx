import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BottomNavBar } from '../components/BottomNavBar';

const { width: windowWidth } = Dimensions.get('window');
const BASE_URL = "https://rapiffy-backend-1.onrender.com";

export interface CategoryViewProps {
  onNavigate?: (screen: 'login' | 'forgot_password' | 'home' | 'category' | 'coverage' | 'order' | 'profile') => void;
  authToken?: string; 
}

export const CategoryView: React.FC<CategoryViewProps> = ({ onNavigate, authToken }) => {
  const [categoriesList, setCategoriesList] = useState<string[]>([]);
  const [productsList, setProductsList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        let token = authToken;
        if (!token) {
          token = (await AsyncStorage.getItem('user_auth_token')) || undefined;
        }

        if (!token) {
          if (isMounted) {
            setIsLoading(false);
            setErrorMessage('Session token missing. Please log in again.');
          }
          return;
        }

        const response = await fetch(`${BASE_URL}/v1/admin/catalog/my-products`, {
          method: 'GET',
          headers: {
            'accept': '*/*',
            'Authorization': `Bearer ${token.trim()}`
          }
        });

        if (!response.ok) {
          if (isMounted) {
            setIsLoading(false);
            setErrorMessage(`Server error: ${response.status}`);
          }
          return;
        }

        const data = await response.json();
        const safeData = Array.isArray(data) ? data : [];

        let extractedCats: string[] = [];
        let allProds: any[] = [];

        safeData.forEach(group => {
          if (group && group.categoryName) {
            extractedCats.push(String(group.categoryName));
          }
          if (group && Array.isArray(group.products)) {
            allProds = [...allProds, ...group.products];
          }
          if (group && Array.isArray(group.subCategories)) {
            group.subCategories.forEach((sub: any) => {
              if (sub && Array.isArray(sub.products)) {
                allProds = [...allProds, ...sub.products];
              }
            });
          }
        });

        if (isMounted) {
          setCategoriesList(extractedCats);
          setProductsList(allProds);
          setIsLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setIsLoading(false);
          setErrorMessage(err?.message || 'Network request failed');
        }
      }
    };

    loadData();
    return () => { isMounted = false; };
  }, [authToken]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFBF7" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Products & Categories</Text>
      </View>

      {/* Content Body */}
      <View style={styles.body}>
        {isLoading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color="#D2691E" />
            <Text style={styles.loadingText}>Loading Catalog...</Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.centerBox}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionHeading}>Categories ({categoriesList.length})</Text>
            <View style={styles.chipRow}>
              {categoriesList.length === 0 ? (
                <Text style={styles.subText}>No categories found.</Text>
              ) : (
                categoriesList.map((cat, idx) => (
                  <View key={idx} style={styles.chip}>
                    <Text style={styles.chipText}>{cat}</Text>
                  </View>
                ))
              )}
            </View>

            <Text style={[styles.sectionHeading, { marginTop: 20 }]}>Products ({productsList.length})</Text>
            {productsList.length === 0 ? (
              <Text style={styles.subText}>No products available.</Text>
            ) : (
              productsList.map((prod, idx) => (
                <View key={idx} style={styles.productCard}>
                  <Text style={styles.productName} numberOfLines={1}>{prod?.productName || 'Unnamed Product'}</Text>
                  <Text style={styles.productPrice}>₹{prod?.sellingPrice ?? 0}</Text>
                </View>
              ))
            )}
          </ScrollView>
        )}
      </View>

      <BottomNavBar onNavigate={onNavigate} currentActive="category" />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFBF7' },
  header: { height: 55, borderBottomWidth: 1, borderBottomColor: '#F0E2D3', justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#2B1E1A' },
  body: { flex: 1 },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { marginTop: 10, fontSize: 13, color: '#D2691E', fontWeight: '700' },
  errorText: { fontSize: 13, color: '#D32F2F', textAlign: 'center', fontWeight: '600' },
  scrollContent: { padding: 16, paddingBottom: 100 },
  sectionHeading: { fontSize: 15, fontWeight: '800', color: '#5C4033', marginBottom: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { backgroundColor: '#F5E6D3', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 8, marginBottom: 8 },
  chipText: { fontSize: 12, fontWeight: '700', color: '#5C4033' },
  subText: { fontSize: 12, color: '#A89685' },
  productCard: { backgroundColor: '#FFFFFF', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#F0E2D3', marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  productName: { fontSize: 13, fontWeight: '700', color: '#2B1E1A', flex: 1, marginRight: 10 },
  productPrice: { fontSize: 13, fontWeight: '800', color: '#D2691E' }
});