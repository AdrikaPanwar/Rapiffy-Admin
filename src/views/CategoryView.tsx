import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  FlatList,
  TouchableOpacity,
  Dimensions,
  Modal,
  StatusBar,
  TextInput,
  Platform,
  Image,
  InteractionManager,
  Alert,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BottomNavBar } from '../components/BottomNavBar';

const { width: windowWidth } = Dimensions.get('window');
const BASE_URL = "https://rapiffy-backend-1.onrender.com";

export interface ProductVariantItem {
  id: number;
  variantName: string;
  brand: string;
  unit: string;
  unitValue: string;
  mrp: number;
  sellingPrice: number;
  stockQuantity: number;
  thresholdQuantity: number;
  imageUrl: string | null; 
  expiryDate: string;
}

export interface CatalogProductItem {
  shopProductId: number;
  masterProductId: number;
  categoryId?: number;
  productName: string;
  shortDescription: string;
  longDescription: string;
  brand: string;
  imageUrl: string | null; 
  mrp: number;
  sellingPrice: number;
  stockQuantity: number;
  thresholdQuantity: number;
  unit: string;
  unitValue: string;
  expiryDate: string | null;
  categoryName: string; 
  hasVariants: boolean;
  variants: ProductVariantItem[];
  unlisted?: boolean;
  active?: boolean;
}

export interface SubCategoryItem {
  subCategoryId: number;
  subCategoryName: string;
  products: CatalogProductItem[];
}

export interface ServerCategoryGroup {
  categoryId?: number;
  categoryName: string;
  subCategories?: SubCategoryItem[];
  products: CatalogProductItem[];
}

export interface CategoryViewProps {
  onNavigate?: (screen: 'login' | 'forgot_password' | 'home' | 'category' | 'coverage' | 'order' | 'profile') => void;
  authToken?: string; 
}

const ProductGridItem = React.memo(({ item, onEdit, onDelete, onToggleVisibility, gridWidth }: { 
  item: CatalogProductItem; 
  onEdit: (item: CatalogProductItem) => void; 
  onDelete: (id: number) => void;
  onToggleVisibility: (id: number, currentActiveState: boolean) => void;
  gridWidth: number;
}) => {
  if (!item) return null;

  const isVisible = item.active !== false;
  const safeName = String(item.productName || 'Product');
  const safeBrand = String(item.brand || 'General');
  const safeUnitVal = String(item.unitValue || '');
  const safeUnitType = String(item.unit || '');

  return (
    <TouchableOpacity 
      style={[styles.productBlockContainer, { maxWidth: (gridWidth / 2) - 10 }, !isVisible && styles.inactiveCardOpacity]}
      onPress={() => onEdit(item)}
      activeOpacity={0.85}
    >
      <View style={styles.topCardFloatingActionBar}>
        <TouchableOpacity 
          style={[styles.productVisibilityBadge, isVisible ? styles.eyeActiveBg : styles.eyeInactiveBg]} 
          onPress={() => onToggleVisibility(item.shopProductId, isVisible)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {isVisible ? (
            <Svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <Path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <Path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
            </Svg>
          ) : (
            <Svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <Path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
              <Path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
              <Path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
              <Path d="M2 2l20 20" />
            </Svg>
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.productPencilBadge} 
          onPress={() => onEdit(item)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"/>
          </Svg>
        </TouchableOpacity>

        {item.unlisted !== false && (
          <TouchableOpacity 
            style={styles.productTrashBadge} 
            onPress={() => onDelete(item.shopProductId)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.trashText}>X</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.blankImageSectionPlaceholder}>
        {item.imageUrl && typeof item.imageUrl === 'string' && item.imageUrl.startsWith('http') ? (
          <Image source={{ uri: item.imageUrl }} style={styles.catalogRenderedImage} />
        ) : (
          <View style={styles.zeptoCoreAssetCircle}>
            <Text style={styles.assetFrameChar}>{safeName.charAt(0).toUpperCase()}</Text>
          </View>
        )}
      </View>

      <View style={styles.productDetailMetaFrame}>
        <Text style={styles.brandMetaLabel} numberOfLines={1}>{safeBrand}</Text>
        <Text style={styles.productNameLabel} numberOfLines={2}>{safeName}</Text>
        <Text style={styles.unitScaleTag}>{safeUnitVal} {safeUnitType}</Text>
        <View style={styles.pricingRowStack}>
          <Text style={styles.sellingPriceVal}>₹{item.sellingPrice ?? 0}</Text>
          <Text style={styles.mrpCrossedVal}>₹{item.mrp ?? 0}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

export const CategoryView: React.FC<CategoryViewProps> = ({ onNavigate, authToken }) => {
  const [serverGroups, setServerGroups] = useState<ServerCategoryGroup[]>([]);
  const [backendCategoryFilteredProducts, setBackendCategoryFilteredProducts] = useState<CatalogProductItem[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [categoriesList, setCategoriesList] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [categoryMetadataMap, setCategoryMetadataMap] = useState<Record<string, number>>({});

  const [showSidebar, setShowSidebar] = useState<boolean>(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState<boolean>(false);
  
  const [isEditingMode, setIsEditingMode] = useState<boolean>(false);
  const [targetEditProductId, setTargetEditProductId] = useState<number | null>(null);

  // MAIN PRODUCT FORM STATES
  const [prodNameInput, setProdNameInput] = useState<string>('');
  const [prodBrandInput, setProdBrandInput] = useState<string>('');
  const [prodShortDesc, setProdShortDesc] = useState<string>('');
  const [prodLongDesc, setProdLongDesc] = useState<string>('');
  const [prodUnitVal, setProdUnitVal] = useState<string>('');
  const [prodUnitType, setProdUnitType] = useState<string>('Kg');
  const [prodPriceInput, setProdPriceInput] = useState<string>('');
  const [prodMrpInput, setProdMrpInput] = useState<string>('');
  const [prodStockQty, setProdStockQty] = useState<string>('0');
  const [prodThresholdQty, setProdThresholdQty] = useState<string>('0');
  const [prodExpiryDate, setProdExpiryDate] = useState<string>('2026-07-26');
  const [prodHasVariants, setProdHasVariants] = useState<boolean>(false);
  const [productImageTarget, setProductImageTarget] = useState<string | null>(null);

  // FULL VARIANT INPUT STATES
  const [vNameInput, setVNameInput] = useState<string>('');
  const [vBrandInput, setVBrandInput] = useState<string>('');
  const [vExpiryDate, setVExpiryDate] = useState<string>('2026-07-26');
  const [vUnitVal, setVUnitVal] = useState<string>('');
  const [vUnitType, setVUnitType] = useState<string>('Kg');
  const [vPriceInput, setVPriceInput] = useState<string>('');
  const [vMrpInput, setVMrpInput] = useState<string>('');
  const [vStockQty, setVStockQty] = useState<string>('0');
  const [vThresholdQty, setVThresholdQty] = useState<string>('0');
  const [variantImageTarget, setVariantImageTarget] = useState<string | null>(null);
  
  const [tempVariantsList, setTempVariantsList] = useState<ProductVariantItem[]>([]);

  useEffect(() => {
    let isMounted = true;
    const fetchFreshJwtAndSync = async () => {
      try {
        let tokenToUse = authToken;
        if (!tokenToUse) {
          tokenToUse = (await AsyncStorage.getItem('user_auth_token')) || undefined;
        }

        if (tokenToUse && isMounted) {
          await syncInventoryFromServer(tokenToUse.trim());
        } else {
          if (isMounted) setIsLoading(false);
        }
      } catch (err) {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchFreshJwtAndSync();
    return () => { isMounted = false; };
  }, [authToken]);

  const syncInventoryFromServer = async (resolvedToken: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${BASE_URL}/v1/admin/catalog/my-products`, {
        method: 'GET',
        headers: {
          'accept': '*/*',
          'Authorization': `Bearer ${resolvedToken}`
        }
      });

      if (!response.ok) {
        setIsLoading(false);
        return;
      }

      const responseText = await response.text();
      let itemsData: any = [];
      try {
        itemsData = JSON.parse(responseText);
      } catch (parseError) {
        setIsLoading(false);
        return;
      }

      const safeItems = Array.isArray(itemsData) ? itemsData : [];
      const normalizedGroups: ServerCategoryGroup[] = safeItems.map((group: any) => {
        let extractedProducts: CatalogProductItem[] = [];

        if (group) {
          if (Array.isArray(group.subCategories)) {
            group.subCategories.forEach((sub: any) => {
              if (sub && Array.isArray(sub.products)) {
                extractedProducts = [...extractedProducts, ...sub.products];
              }
            });
          } else if (Array.isArray(group.products)) {
            extractedProducts = group.products;
          }
        }

        return {
          categoryId: group?.categoryId,
          categoryName: group?.categoryName ? String(group.categoryName) : 'General',
          products: extractedProducts
        };
      });

      setServerGroups(normalizedGroups);
      
      const extractedCategories = normalizedGroups
        .map((group) => group.categoryName)
        .filter(Boolean);
      
      setCategoriesList(extractedCategories);

      const dynamicMap: Record<string, number> = {};
      normalizedGroups.forEach((group) => {
        if (group.categoryName && group.categoryId) {
          dynamicMap[group.categoryName] = group.categoryId;
        }
      });
      setCategoryMetadataMap(dynamicMap);
      
      if (extractedCategories.length > 0) {
        const firstCatName = String(extractedCategories[0]);
        setSelectedCategory(firstCatName);
        const firstCatId = dynamicMap[firstCatName];
        if (firstCatId) {
          fetchCategoryByIdWithFallback(firstCatId, resolvedToken);
        }
      }
    } catch (err) {
      console.log("Sync error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCategoryByIdWithFallback = async (catId: number, overrideToken?: string) => {
    try {
      const token = overrideToken || authToken || (await AsyncStorage.getItem('user_auth_token'));
      if (!token) return;

      const response = await fetch(`${BASE_URL}/v1/admin/catalog/my-products/${catId}`, {
        method: 'GET',
        headers: {
          'accept': '*/*',
          'Authorization': `Bearer ${token.trim()}`
        }
      });

      if (response.ok) {
        const resText = await response.text();
        const data = JSON.parse(resText);
        let extracted: CatalogProductItem[] = [];

        if (data) {
          if (Array.isArray(data.products)) {
            extracted = data.products;
          } else if (Array.isArray(data.subCategories)) {
            data.subCategories.forEach((sub: any) => {
              if (sub && Array.isArray(sub.products)) extracted = [...extracted, ...sub.products];
            });
          } else if (Array.isArray(data)) {
            extracted = data;
          }
        }

        setBackendCategoryFilteredProducts(extracted);
      } else {
        setBackendCategoryFilteredProducts(null);
      }
    } catch (error) {
      setBackendCategoryFilteredProducts(null);
    }
  };

  const handleCategoryClick = (categoryName: string) => {
    setSelectedCategory(categoryName);
    const catId = categoryMetadataMap[categoryName];
    if (catId) {
      fetchCategoryByIdWithFallback(catId);
    } else {
      setBackendCategoryFilteredProducts(null);
    }
  };

  const toggleProductVisibility = useCallback(async (shopProductId: number, currentActiveState: boolean) => {
    const nextActiveState = !currentActiveState;
    const fastToken = authToken || (await AsyncStorage.getItem('user_auth_token'));
    
    if (!fastToken) return;

    // 1. Instantly update local UI state silently without triggering screen blinking / loading spinners
    setServerGroups(prevGroups => (Array.isArray(prevGroups) ? prevGroups : []).map(group => ({
      ...group,
      products: Array.isArray(group.products) 
        ? group.products.map(prod => prod.shopProductId === shopProductId ? { ...prod, active: nextActiveState } : prod)
        : []
    })));

    setBackendCategoryFilteredProducts(prev => 
      prev !== null ? prev.map(p => p.shopProductId === shopProductId ? { ...p, active: nextActiveState } : p) : null
    );

    // 2. Silent backend patch request
    try {
      await fetch(`${BASE_URL}/v1/admin/catalog/visibility/${shopProductId}?active=${nextActiveState}`, {
        method: 'PATCH',
        headers: {
          'accept': '*/*',
          'Authorization': `Bearer ${fastToken.trim()}`
        }
      });
    } catch (error) {
      console.log("Visibility sync error:", error);
    }
  }, [authToken]);

  const pickImageFromDeviceGallery = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.6, 
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setProductImageTarget(result.assets[0].uri);
    }
  };

  const pickVariantImageFromDeviceGallery = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.6, 
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setVariantImageTarget(result.assets[0].uri);
    }
  };

  const openProductForEditingAction = useCallback((item: CatalogProductItem) => {
    if (!item) return;
    setTargetEditProductId(item.shopProductId);
    setIsEditingMode(true);
    setProdNameInput(item.productName || '');
    setProdBrandInput(item.brand || '');
    setProdShortDesc(item.shortDescription || '');
    setProdLongDesc(item.longDescription || '');
    setProdUnitVal(item.unitValue || '');
    setProdUnitType(item.unit || 'Kg');
    setProdPriceInput(item.sellingPrice != null ? item.sellingPrice.toString() : '0');
    setProdMrpInput(item.mrp != null ? item.mrp.toString() : '0');
    setProdStockQty(item.stockQuantity != null ? item.stockQuantity.toString() : '0');
    setProdThresholdQty(item.thresholdQuantity != null ? item.thresholdQuantity.toString() : '0');
    setProdExpiryDate(item.expiryDate || '2026-07-26');
    setProdHasVariants(!!item.hasVariants || (Array.isArray(item.variants) && item.variants.length > 0));
    setProductImageTarget(item.imageUrl === "string" ? null : item.imageUrl);
    
    setTempVariantsList(Array.isArray(item.variants) ? item.variants : []);
    setVariantImageTarget(null);
    
    InteractionManager.runAfterInteractions(() => {
      setIsProductModalOpen(true);
    });
  }, []);

  const closeFormAndWipeDataBuffers = useCallback(() => {
    setProdNameInput('');
    setProdBrandInput('');
    setProdShortDesc('');
    setProdLongDesc('');
    setProdUnitVal('');
    setProdUnitType('Kg');
    setProdPriceInput('');
    setProdMrpInput('');
    setProdStockQty('0');
    setProdThresholdQty('0');
    setProdExpiryDate('2026-07-26');
    setProdHasVariants(false);
    setProductImageTarget(null);
    setVariantImageTarget(null);
    
    setVNameInput('');
    setVBrandInput('');
    setVExpiryDate('2026-07-26');
    setVUnitVal('');
    setVUnitType('Kg');
    setVPriceInput('');
    setVMrpInput('');
    setVStockQty('0');
    setVThresholdQty('0');

    setTempVariantsList([]);
    setIsEditingMode(false);
    setTargetEditProductId(null);
    setIsProductModalOpen(false);
  }, []);

  const saveOrUpdateProductWorkflow = async () => {
    if (!prodNameInput.trim() || !prodPriceInput.trim()) {
      Alert.alert("Fields Missing", "Please complete name and price parameters first.");
      return;
    }

    const fastToken = authToken || (await AsyncStorage.getItem('user_auth_token'));
    if (!fastToken) return;

    const resolvedCategoryId = categoryMetadataMap[selectedCategory] || 1;
    const safeVariants = Array.isArray(tempVariantsList) ? tempVariantsList : [];

    const itemPayload = {
      categoryId: resolvedCategoryId,
      productName: prodNameInput.trim(),
      sellingPrice: parseFloat(prodPriceInput) || 0,
      stockQuantity: parseInt(prodStockQty) || 0,
      shortDescription: prodShortDesc.trim() || 'string',
      longDescription: prodLongDesc.trim() || 'string',
      brand: prodBrandInput.trim() || 'string',
      imageUrl: productImageTarget || "string", 
      mrp: parseFloat(prodMrpInput) || parseFloat(prodPriceInput) || 0,
      thresholdQuantity: parseInt(prodThresholdQty) || 0,
      unit: prodUnitType || 'string',
      unitValue: prodUnitVal || 'string',
      expiryDate: prodExpiryDate || '2026-07-26',
      hasVariants: prodHasVariants || safeVariants.length > 0,
      variants: (prodHasVariants || safeVariants.length > 0) ? safeVariants.map(v => ({
        id: v.id || 0,
        variantName: v.variantName || 'Variant',
        brand: v.brand || prodBrandInput.trim() || 'string',
        unit: v.unit || prodUnitType || 'string',
        unitValue: v.unitValue || prodUnitVal || 'string',
        mrp: v.mrp || v.sellingPrice || 0,
        sellingPrice: v.sellingPrice || 0,
        stockQuantity: v.stockQuantity || 0,
        thresholdQuantity: v.thresholdQuantity || 0,
        imageUrl: v.imageUrl || 'string',
        expiryDate: v.expiryDate || '2026-07-26'
      })) : []
    };

    setIsLoading(true);
    try {
      let endpoint = `${BASE_URL}/v1/admin/catalog/add-unlisted`;
      let reqMethod = 'POST';

      if (isEditingMode && targetEditProductId !== null) {
        endpoint = `${BASE_URL}/v1/admin/catalog/update/${targetEditProductId}`;
        reqMethod = 'PUT';
      }

      const response = await fetch(endpoint, {
        method: reqMethod,
        headers: {
          'accept': '*/*',
          'Authorization': `Bearer ${fastToken.trim()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(itemPayload)
      });

      if (response.status === 200 || response.status === 201) {
        syncInventoryFromServer(fastToken.trim());
        closeFormAndWipeDataBuffers();
        Alert.alert("Success", isEditingMode ? "Product updated successfully!" : "Product added successfully!");
      } else {
        const errBody = await response.json();
        Alert.alert("Server Rejected", errBody.message || "Failed to finalize catalog edits.");
      }
    } catch (err) {
      Alert.alert("Network Issue", "Failed synchronization loop.");
    } finally {
      setIsLoading(false);
    }
  };

  const deleteProductItem = useCallback(async (idToDelete: number) => {
    const fastToken = authToken || (await AsyncStorage.getItem('user_auth_token'));
    if (!fastToken) return;

    try {
      setServerGroups(prev => (Array.isArray(prev) ? prev : []).map(group => ({
        ...group,
        products: Array.isArray(group.products) ? group.products.filter(p => p.shopProductId !== idToDelete) : []
      })));
      setBackendCategoryFilteredProducts(prev => (Array.isArray(prev) ? prev : []).filter(p => p.shopProductId !== idToDelete));
      
      await fetch(`${BASE_URL}/v1/admin/catalog/deactivate/${idToDelete}`, {
        method: 'PUT',
        headers: {
          'accept': '*/*',
          'Authorization': `Bearer ${fastToken.trim()}`
        }
      });
    } catch (err) {}
  }, [authToken]);

  const addVariantToTempList = useCallback(() => {
    if (!vNameInput.trim() || !vPriceInput.trim()) return;
    
    setTempVariantsList(prev => [...(Array.isArray(prev) ? prev : []), {
      id: 0, 
      variantName: vNameInput.trim(),
      brand: vBrandInput.trim() || prodBrandInput.trim() || 'string',
      unit: vUnitType.trim() || prodUnitType || 'string',
      unitValue: vUnitVal.trim() || prodUnitVal || 'string',
      mrp: parseFloat(vMrpInput) || parseFloat(prodMrpInput) || parseFloat(vPriceInput) || 0,
      sellingPrice: parseFloat(vPriceInput) || 0,
      stockQuantity: parseInt(vStockQty) || 0,
      thresholdQuantity: parseInt(vThresholdQty) || 0,
      imageUrl: variantImageTarget || productImageTarget || 'string',
      expiryDate: vExpiryDate || prodExpiryDate || '2026-07-26'
    }]);

    setVNameInput('');
    setVBrandInput('');
    setVExpiryDate('2026-07-26');
    setVUnitVal('');
    setVUnitType('Kg');
    setVPriceInput('');
    setVMrpInput('');
    setVStockQty('0');
    setVThresholdQty('0');
    setVariantImageTarget(null);
  }, [vNameInput, vBrandInput, prodBrandInput, vUnitType, prodUnitType, vUnitVal, prodUnitVal, vMrpInput, prodMrpInput, vPriceInput, vStockQty, vThresholdQty, variantImageTarget, productImageTarget, vExpiryDate, prodExpiryDate]);

  const deleteVariantFromTempList = useCallback((indexToRemove: number) => {
    setTempVariantsList(prev => (Array.isArray(prev) ? prev : []).filter((_, idx) => idx !== indexToRemove));
  }, []);

  const safeCategories = Array.isArray(categoriesList) ? categoriesList : [];

  const filteredGridProducts = useMemo(() => {
    if (backendCategoryFilteredProducts !== null && Array.isArray(backendCategoryFilteredProducts)) {
      return backendCategoryFilteredProducts;
    }

    const groups = Array.isArray(serverGroups) ? serverGroups : [];
    if (groups.length === 0) return [];
    
    const activeCat = selectedCategory || (safeCategories.length > 0 ? safeCategories[0] : "");
    const matchedGroup = groups.find(
      group => group && group.categoryName === activeCat
    ) || groups[0];
    
    return matchedGroup && Array.isArray(matchedGroup.products) ? matchedGroup.products : [];
  }, [backendCategoryFilteredProducts, serverGroups, selectedCategory, safeCategories]);

  const gridAvailableWidth = useMemo(() => {
    return showSidebar ? (windowWidth - 95) : windowWidth;
  }, [showSidebar]);

  const renderGridItem = useCallback(({ item }: { item: CatalogProductItem }) => (
    <ProductGridItem 
      item={item} 
      onEdit={openProductForEditingAction} 
      onDelete={deleteProductItem} 
      onToggleVisibility={toggleProductVisibility}
      gridWidth={gridAvailableWidth}
    />
  ), [openProductForEditingAction, deleteProductItem, toggleProductVisibility, gridAvailableWidth]);

  const keyExtractor = useCallback((item: CatalogProductItem, index: number) => {
    if (item && item.shopProductId != null) {
      return `prod_${item.shopProductId}`;
    }
    return `item_fallback_${index}`;
  }, []);

  return (
    <SafeAreaView style={styles.viewMainWrapper} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFBF7" />

      <View style={styles.topControlHeader}>
        <TouchableOpacity 
          style={[styles.leftPlusActionBtn, showSidebar && { backgroundColor: '#D2691E' }]} 
          onPress={() => setShowSidebar(!showSidebar)} 
          activeOpacity={0.7}
        >
          <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={showSidebar ? "#FFFFFF" : "#D2691E"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <Path d="M4 5h16" />
            <Path d="M4 12h16" />
            <Path d="M4 19h16" />
          </Svg>
        </TouchableOpacity>
        
        <Text style={styles.mainHeaderTitle}>Products & Categories</Text>

        <TouchableOpacity 
          style={[styles.rightPlusActionBtn, isProductModalOpen && { backgroundColor: '#2B1E1A' }]} 
          onPress={() => setIsProductModalOpen(true)} 
          activeOpacity={0.7}
        >
          <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={isProductModalOpen ? "#FFFFFF" : "#2B1E1A"} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <Path d="M12 5v14M5 12h14" />
          </Svg>
        </TouchableOpacity>
      </View>

      <View style={styles.workspaceSplitterContainer}>
        {showSidebar && (
          <View style={styles.leftNavigationSidebar}>
            <ScrollView showsVerticalScrollIndicator={false} removeClippedSubviews={Platform.OS === 'android'}>
              {isLoading && safeCategories.length === 0 ? (
                <ActivityIndicator style={{ marginTop: 30 }} size="small" color="#D2691E" />
              ) : safeCategories.length === 0 ? (
                <View style={{ padding: 10, alignItems: 'center' }}>
                  <Text style={{ fontSize: 10, color: '#A89685', textAlign: 'center', fontWeight: '600', marginTop: 20 }}>No Categories</Text>
                </View>
              ) : (
                safeCategories.map((category, index) => {
                  const safeCatName = String(category || 'General');
                  const isSelectedNode = (selectedCategory || safeCategories[0]) === safeCatName;
                  return (
                    <View key={index} style={[styles.sidebarNodeWrapper, isSelectedNode && styles.sidebarNodeActive]}>
                      <TouchableOpacity style={styles.sidebarNodeButton} onPress={() => handleCategoryClick(safeCatName)} activeOpacity={0.8}>
                        <View style={[styles.nodeIconIndicator, isSelectedNode && styles.nodeIconIndicatorActive]}>
                          <Text style={[styles.indicatorChar, isSelectedNode && styles.indicatorCharActive]}>{safeCatName.charAt(0).toUpperCase()}</Text>
                        </View>
                        <Text style={[styles.sidebarNodeLabelText, isSelectedNode && styles.sidebarNodeLabelActive]}>{safeCatName}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        )}

        <View style={styles.rightProductGridPanel}>
          {isLoading && (!filteredGridProducts || filteredGridProducts.length === 0) ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#D2691E" />
              <Text style={{ fontSize: 12, color: '#A89685', fontWeight: '700', marginTop: 10 }}>Syncing Catalog Metrics...</Text>
            </View>
          ) : (!filteredGridProducts || filteredGridProducts.length === 0) ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
              <Text style={{ fontSize: 13, color: '#5C4033', fontWeight: '700', textAlign: 'center' }}>
                {safeCategories.length === 0 ? "Catalog is Empty" : "No products inside this catalog node"}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredGridProducts}
              keyExtractor={keyExtractor}
              numColumns={2}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.gridContainerVerticalPadding}
              renderItem={renderGridItem}
              removeClippedSubviews={true}
              maxToRenderPerBatch={6}
              windowSize={5}
              initialNumToRender={6}
              updateCellsBatchingPeriod={30}
            />
          )}
        </View>
      </View>

      {/* MODAL: ADD & EDIT */}
      <Modal transparent visible={isProductModalOpen} animationType="slide" onRequestClose={closeFormAndWipeDataBuffers}>
        <View style={styles.centerModalBackgroundOverlay}>
          <View style={styles.productDialogBoxFrame}>
            <View style={styles.drawerHeaderFrame}>
              <Text style={styles.drawerTitleText}>{isEditingMode ? 'Edit / Update Product Detail' : 'Add New Product'}</Text>
              <TouchableOpacity onPress={closeFormAndWipeDataBuffers}><Text style={styles.closeDrawerIconText}>X</Text></TouchableOpacity>
            </View>

            <ScrollView style={{ marginTop: 10 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabelField}>Product Image *</Text>
              <TouchableOpacity style={styles.imageSelectorPreviewContainer} onPress={pickImageFromDeviceGallery}>
                {productImageTarget ? (
                  <Image source={{ uri: productImageTarget }} style={styles.fullPreviewTargetImage} />
                ) : (
                  <Text style={styles.photoTriggerBtnLabel}>Click to select photo from Phone Gallery</Text>
                )}
              </TouchableOpacity>

              <Text style={styles.inputLabelField}>Product Name *</Text>
              <TextInput style={styles.customTextInputRow} placeholder="productName" value={prodNameInput} onChangeText={setProdNameInput} />

              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 0.48 }}>
                  <Text style={styles.inputLabelField}>Brand *</Text>
                  <TextInput style={styles.customTextInputRow} placeholder="brand" value={prodBrandInput} onChangeText={setProdBrandInput} />
                </View>
                <View style={{ flex: 0.48 }}>
                  <Text style={styles.inputLabelField}>Expiry Date</Text>
                  <TextInput style={styles.customTextInputRow} placeholder="2026-07-26" value={prodExpiryDate} onChangeText={setProdExpiryDate} />
                </View>
              </View>

              <Text style={styles.inputLabelField}>Short Description</Text>
              <TextInput style={styles.customTextInputRow} placeholder="shortDescription profile summary" value={prodShortDesc} onChangeText={setProdShortDesc} />

              <Text style={styles.inputLabelField}>Long Description</Text>
              <TextInput style={[styles.customTextInputRow, { height: 50 }]} multiline placeholder="longDescription parameters" value={prodLongDesc} onChangeText={setProdLongDesc} />

              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 0.48 }}>
                  <Text style={styles.inputLabelField}>Unit Value</Text>
                  <TextInput style={styles.customTextInputRow} placeholder="unitValue" value={prodUnitVal} onChangeText={setProdUnitVal} />
                </View>
                <View style={{ flex: 0.48 }}>
                  <Text style={styles.inputLabelField}>Unit Type</Text>
                  <TextInput style={styles.customTextInputRow} placeholder="unit" value={prodUnitType} onChangeText={setProdUnitType} />
                </View>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 0.48 }}>
                  <Text style={styles.inputLabelField}>Selling Price *</Text>
                  <TextInput style={styles.customTextInputRow} placeholder="sellingPrice" keyboardType="numeric" value={prodPriceInput} onChangeText={setProdPriceInput} />
                </View>
                <View style={{ flex: 0.48 }}>
                  <Text style={styles.inputLabelField}>MRP Value *</Text>
                  <TextInput style={styles.customTextInputRow} placeholder="mrp" keyboardType="numeric" value={prodMrpInput} onChangeText={setProdMrpInput} />
                </View>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 0.48 }}>
                  <Text style={styles.inputLabelField}>Stock Qty *</Text>
                  <TextInput style={styles.customTextInputRow} placeholder="stockQuantity" keyboardType="numeric" value={prodStockQty} onChangeText={setProdStockQty} />
                </View>
                <View style={{ flex: 0.48 }}>
                  <Text style={styles.inputLabelField}>Threshold</Text>
                  <TextInput style={styles.customTextInputRow} placeholder="thresholdQuantity" keyboardType="numeric" value={prodThresholdQty} onChangeText={setProdThresholdQty} />
                </View>
              </View>

              {/* VARIANTS SECTION TOGGLE */}
              <TouchableOpacity 
                style={[styles.variantSelectorToggle, { backgroundColor: prodHasVariants ? '#FFF5EA' : '#F5ECE2' }]} 
                onPress={() => setProdHasVariants(!prodHasVariants)}
                activeOpacity={0.8}
              >
                <View style={styles.variantToggleInnerRow}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: prodHasVariants ? '#D2691E' : '#5C4033' }}>
                    Variants
                  </Text>
                  
                  <View style={styles.plusVariantIconButton}>
                    <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M12 5v14M5 12h14" />
                    </Svg>
                  </View>
                </View>
              </TouchableOpacity>

              {prodHasVariants && (
                <View style={styles.variantContainerBox}>
                  <Text style={styles.variantSectionHeaderTitle}>Add Variant Details</Text>
                  
                  {(Array.isArray(tempVariantsList) ? tempVariantsList : []).map((variant, vIdx) => (
                    <View key={vIdx} style={styles.miniVariantStripRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 0.9 }}>
                        {variant?.imageUrl && typeof variant.imageUrl === 'string' && variant.imageUrl.startsWith('http') ? (
                          <Image source={{ uri: variant.imageUrl }} style={styles.miniVariantImageThumb} />
                        ) : null}
                        <Text style={styles.miniVariantText} numberOfLines={1}>
                          {variant ? variant.variantName : 'Variant'} - ₹{variant ? variant.sellingPrice : 0} ({variant ? variant.stockQuantity : 0} in stock)
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => deleteVariantFromTempList(vIdx)}>
                        <Text style={styles.miniVariantDeleteCross}>X</Text>
                      </TouchableOpacity>
                    </View>
                  ))}

                  <Text style={styles.inputLabelField}>Variant Image</Text>
                  <TouchableOpacity style={styles.variantImagePreviewContainer} onPress={pickVariantImageFromDeviceGallery}>
                    {variantImageTarget ? (
                      <Image source={{ uri: variantImageTarget }} style={styles.fullPreviewTargetImage} />
                    ) : (
                      <Text style={styles.photoTriggerBtnLabel}>Click to select variant photo from Phone Gallery</Text>
                    )}
                  </TouchableOpacity>

                  <Text style={styles.inputLabelField}>Variant Name *</Text>
                  <TextInput style={styles.customTextInputRow} placeholder="variantName" value={vNameInput} onChangeText={setVNameInput} />

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <View style={{ flex: 0.48 }}>
                      <Text style={styles.inputLabelField}>Variant Brand</Text>
                      <TextInput style={styles.customTextInputRow} placeholder="brand" value={vBrandInput} onChangeText={setVBrandInput} />
                    </View>
                    <View style={{ flex: 0.48 }}>
                      <Text style={styles.inputLabelField}>Variant Expiry Date</Text>
                      <TextInput style={styles.customTextInputRow} placeholder="2026-07-26" value={vExpiryDate} onChangeText={setVExpiryDate} />
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <View style={{ flex: 0.48 }}>
                      <Text style={styles.inputLabelField}>Unit Value</Text>
                      <TextInput style={styles.customTextInputRow} placeholder="unitValue" value={vUnitVal} onChangeText={setVUnitVal} />
                    </View>
                    <View style={{ flex: 0.48 }}>
                      <Text style={styles.inputLabelField}>Unit Type</Text>
                      <TextInput style={styles.customTextInputRow} placeholder="unit" value={vUnitType} onChangeText={setVUnitType} />
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <View style={{ flex: 0.48 }}>
                      <Text style={styles.inputLabelField}>Selling Price *</Text>
                      <TextInput style={styles.customTextInputRow} placeholder="sellingPrice" keyboardType="numeric" value={vPriceInput} onChangeText={setVPriceInput} />
                    </View>
                    <View style={{ flex: 0.48 }}>
                      <Text style={styles.inputLabelField}>MRP Value</Text>
                      <TextInput style={styles.customTextInputRow} placeholder="mrp" keyboardType="numeric" value={vMrpInput} onChangeText={setVMrpInput} />
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <View style={{ flex: 0.48 }}>
                      <Text style={styles.inputLabelField}>Stock Qty</Text>
                      <TextInput style={styles.customTextInputRow} placeholder="stockQuantity" keyboardType="numeric" value={vStockQty} onChangeText={setVStockQty} />
                    </View>
                    <View style={{ flex: 0.48 }}>
                      <Text style={styles.inputLabelField}>Threshold Qty</Text>
                      <TextInput style={styles.customTextInputRow} placeholder="thresholdQuantity" keyboardType="numeric" value={vThresholdQty} onChangeText={setVThresholdQty} />
                    </View>
                  </View>
                  
                  <TouchableOpacity style={styles.pushVariantBtn} onPress={addVariantToTempList}>
                    <Text style={styles.pushVariantBtnText}>+ Add Variant</Text>
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity style={styles.submitNewProductBtn} onPress={saveOrUpdateProductWorkflow}>
                <Text style={styles.submitCategoryLabel}>{isEditingMode ? 'Submit and Update Product' : 'Submit'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <BottomNavBar onNavigate={onNavigate} currentActive="category" />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  viewMainWrapper: { flex: 1, backgroundColor: '#FFFBF7' },
  topRunningLoader: { position: 'absolute', top: 5, right: 15, zIndex: 999 },
  topControlHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F0E2D3', backgroundColor: '#FFFFFF' },
  leftPlusActionBtn: { padding: 6, borderRadius: 8, backgroundColor: '#FFF5EA' },
  rightPlusActionBtn: { padding: 6, borderRadius: 8, backgroundColor: '#F5ECE2' },
  mainHeaderTitle: { fontSize: 19, fontWeight: '800', color: '#2B1E1A' },
  workspaceSplitterContainer: { flex: 1, flexDirection: 'row' },
  leftNavigationSidebar: { width: 95, backgroundColor: '#F5E6D3', borderRightWidth: 1, borderRightColor: '#E6D4BF' },
  sidebarNodeWrapper: { width: '100%', position: 'relative', borderBottomWidth: 1, borderBottomColor: 'rgba(230,212,191,0.4)' },
  sidebarNodeButton: { width: '100%', alignItems: 'center', paddingVertical: 14 },
  sidebarNodeActive: { backgroundColor: '#FFFFFF', borderLeftWidth: 4, borderLeftColor: '#D2691E' },
  nodeIconIndicator: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFFBF7', alignItems: 'center', justifyContent: 'center', marginBottom: 6, borderWidth: 1, borderColor: '#E6D4BF' },
  nodeIconIndicatorActive: { backgroundColor: '#D2691E', borderColor: '#D2691E' },
  indicatorChar: { fontSize: 15, fontWeight: '800', color: '#5C4033' },
  indicatorCharActive: { color: '#FFFBF7' },
  sidebarNodeLabelText: { fontSize: 10, fontWeight: '700', color: '#5C4033', paddingHorizontal: 4, textAlign: 'center' },
  sidebarNodeLabelActive: { color: '#2B1E1A', fontWeight: '800' },
  rightProductGridPanel: { flex: 1, backgroundColor: '#FFFFFF' },
  gridContainerVerticalPadding: { paddingHorizontal: 6, paddingTop: 8, paddingBottom: 110 },
  productBlockContainer: { flex: 1, backgroundColor: '#FFFBF7', margin: 5, borderRadius: 14, borderWidth: 1, borderColor: '#F0E2D3', overflow: 'hidden', position: 'relative' },
  inactiveCardOpacity: { opacity: 0.55 },
  topCardFloatingActionBar: { position: 'absolute', top: 8, right: 8, zIndex: 10, flexDirection: 'row', alignItems: 'center' },
  productVisibilityBadge: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  eyeActiveBg: { backgroundColor: 'rgba(43, 30, 26, 0.85)' },
  eyeInactiveBg: { backgroundColor: 'rgba(43, 30, 26, 0.45)' },
  productPencilBadge: { backgroundColor: 'rgba(43, 30, 26, 0.85)', width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  productTrashBadge: { backgroundColor: 'rgba(210, 105, 30, 0.9)', width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  trashText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  blankImageSectionPlaceholder: { height: 115, backgroundColor: '#F7EFE5', alignItems: 'center', justifyContent: 'center' },
  catalogRenderedImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  zeptoCoreAssetCircle: { width: 65, height: 65, borderRadius: 32, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  assetFrameChar: { fontSize: 24, fontWeight: '800', color: '#D2691E' },
  productDetailMetaFrame: { padding: 8 },
  brandMetaLabel: { fontSize: 9, fontWeight: '700', color: '#A89685', textTransform: 'uppercase' },
  productNameLabel: { fontSize: 12.5, fontWeight: '700', color: '#2B1E1A', marginVertical: 2, height: 34 },
  unitScaleTag: { fontSize: 10.5, color: '#5C4033', fontWeight: '600', marginBottom: 4 },
  pricingRowStack: { flexDirection: 'row', alignItems: 'center' },
  sellingPriceVal: { fontSize: 13, fontWeight: '800', color: '#2B1E1A', marginRight: 6 },
  mrpCrossedVal: { fontSize: 10, color: '#A89685', textDecorationLine: 'line-through' },
  centerModalBackgroundOverlay: { flex: 1, backgroundColor: 'rgba(43, 30, 26, 0.4)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  productDialogBoxFrame: { width: '100%', maxHeight: '88%', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, elevation: 12 },
  drawerHeaderFrame: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F0E2D3' },
  drawerTitleText: { fontSize: 15, fontWeight: '800', color: '#2B1E1A' },
  closeDrawerIconText: { fontSize: 18, color: '#5C4033', padding: 4 },
  inputLabelField: { fontSize: 11, fontWeight: '700', color: '#5C4033', marginTop: 10, marginBottom: 4 },
  imageSelectorPreviewContainer: { height: 90, borderWidth: 1, borderColor: '#E6D4BF', borderRadius: 8, backgroundColor: '#FFFBF7', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginVertical: 4 },
  variantImagePreviewContainer: { height: 70, borderWidth: 1, borderColor: '#E6D4BF', borderRadius: 8, backgroundColor: '#FFFFFF', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginVertical: 4 },
  fullPreviewTargetImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  photoTriggerBtnLabel: { fontSize: 11, color: '#D2691E', fontWeight: '700', textAlign: 'center', paddingHorizontal: 6 },
  customTextInputRow: { height: 44, borderWidth: 1, borderColor: '#E6D4BF', borderRadius: 8, paddingHorizontal: 12, color: '#2B1E1A', backgroundColor: '#FFFBF7', fontSize: 13 },
  submitNewProductBtn: { backgroundColor: '#D2691E', height: 46, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 10, marginBottom: 10 },
  submitCategoryLabel: { color: '#FFFBF7', fontSize: 13, fontWeight: '700' },
  variantSelectorToggle: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, borderStyle: 'dashed', borderWidth: 1.5, borderColor: '#D2691E', marginVertical: 14 },
  variantToggleInnerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  plusVariantIconButton: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#D2691E', alignItems: 'center', justifyContent: 'center' },
  variantContainerBox: { backgroundColor: '#FFFBF7', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E6D4BF', marginBottom: 10 },
  variantSectionHeaderTitle: { fontSize: 12, fontWeight: '700', color: '#5C4033', marginBottom: 6 },
  pushVariantBtn: { backgroundColor: '#5C4033', height: 36, borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  pushVariantBtnText: { color: '#FFFBF7', fontSize: 11, fontWeight: '700' },
  miniVariantStripRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 8, borderRadius: 6, borderWidth: 0.5, borderColor: '#E6D4BF', marginVertical: 3 },
  miniVariantImageThumb: { width: 24, height: 24, borderRadius: 4, marginRight: 8, resizeMode: 'cover' },
  miniVariantText: { fontSize: 11, color: '#5C4033', flex: 1, fontWeight: '600' },
  miniVariantDeleteCross: { fontSize: 12, color: '#D2691E', fontWeight: '800', paddingHorizontal: 4 },
});