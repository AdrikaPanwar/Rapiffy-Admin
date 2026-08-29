import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
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
  ActivityIndicator,
  Share,
  NativeScrollEvent,
  NativeSyntheticEvent,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BottomNavBar, type AppScreen } from '../components/BottomNavBar';
import {
  adminCatalogUrls,
  catalogAuthHeaders,
  asHttpUrl,
  asNumber,
  asText,
  extractProductsFromCategoryPayload,
  buildVariantRequest,
  buildAttributeTypes,
  getVariantPackLabel,
  getVariantTitle,
  getVariantHeroImage,
  getVariantAttributeLabel,
  getProductVariantOptions,
  findProductById,
  parseMyProductsTree,
  mergeUniqueProducts,
  readCatalogJson,
  CatalogApiError,
  resolveAttributeTypes,
  buildAddVariantsBody,
  asIsoDate,
  parseAttributeTypesInput,
  buildAddUnlistedBody,
  buildUpdateProductBody,
  flattenSubCategories,
  allProductsFromTree,
  productsAcrossTree,
  filterProductsBySearch,
  catalogSendJson,
  type CatalogProductItem,
  type ProductVariantItem,
  type ServerCategoryGroup,
  type CatalogSubCategoryTile,
} from '../api/adminCatalog';

export type { CatalogProductItem, ProductVariantItem, ServerCategoryGroup };

const { width: windowWidth, height: windowHeight } = Dimensions.get('window');
const VARIANT_THUMB_SIZE = 62;
const VARIANT_THUMB_GAP = 10;
const VARIANT_THUMB_STEP = VARIANT_THUMB_SIZE + VARIANT_THUMB_GAP;
const STORY_RAIL_HEIGHT = 84;
const HERO_HEIGHT = Math.min(360, Math.max(240, Math.round((windowHeight - STORY_RAIL_HEIGHT) * 0.42)));
const INSTAMART_BLUE = '#1E6BFF';
const SQUARE_GALLERY_PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.6,
};

export interface CategoryViewProps {
  onNavigate?: (screen: AppScreen) => void;
  authToken?: string;
  mode?: 'categories' | 'products';
  selectedSubCategoryId?: number | null;
  onOpenSubCategory?: (subCategoryId: number | null) => void;
}

interface ProductDetailPopupProps {
  product: CatalogProductItem;
  products: CatalogProductItem[];
  selectedVariantIndex: number;
  savedIds: Set<number>;
  isSavingVariant: boolean;
  onClose: () => void;
  onSelectVariant: (index: number) => void;
  onSwitchProduct: (item: CatalogProductItem) => void;
  onToggleSave: (id: number) => void;
  onAddVariant: (product: CatalogProductItem, variant: ProductVariantItem) => Promise<boolean>;
  onDeleteVariant: (product: CatalogProductItem, variant: ProductVariantItem) => Promise<void>;
}

const ProductDetailPopup = ({
  product,
  products,
  selectedVariantIndex,
  savedIds,
  isSavingVariant,
  onClose,
  onSelectVariant,
  onSwitchProduct,
  onToggleSave,
  onAddVariant,
  onDeleteVariant,
}: ProductDetailPopupProps) => {
  const options = getProductVariantOptions(product);
  const safeIndex = selectedVariantIndex >= 0 && selectedVariantIndex < options.length ? selectedVariantIndex : 0;
  const selected = options[safeIndex] || options[0];
  const attributeLabel = selected ? getVariantAttributeLabel(selected, product) : '';
  const packLabel = selected ? getVariantPackLabel(selected, product) : '';
  const title = selected ? getVariantTitle(selected, product) : product.productName;
  const description = asText(selected?.shortDescription) || asText(product.shortDescription);
  const isSaved = savedIds.has(product.shopProductId);
  const storyProducts = Array.isArray(products) ? products : [];
  const stockLeft = asNumber(selected?.stockQuantity);
  const attributeTypes = resolveAttributeTypes(product);
  const thumbScrollRef = useRef<ScrollView>(null);
  const storyScrollRef = useRef<ScrollView>(null);
  const heroRef = useRef<FlatList<ProductVariantItem>>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newVariantName, setNewVariantName] = useState('');
  const [newVariantPrice, setNewVariantPrice] = useState('');
  const [newVariantMrp, setNewVariantMrp] = useState('');
  const [newVariantStock, setNewVariantStock] = useState('0');
  const [newVariantImage, setNewVariantImage] = useState<string | null>(null);
  const [newAttributeValues, setNewAttributeValues] = useState<Record<string, string>>({});

  useEffect(() => {
    thumbScrollRef.current?.scrollTo({ x: Math.max(0, safeIndex) * VARIANT_THUMB_STEP, animated: true });
    heroRef.current?.scrollToOffset({ offset: Math.max(0, safeIndex) * windowWidth, animated: true });
  }, [safeIndex, product.shopProductId]);

  useEffect(() => {
    const storyIndex = storyProducts.findIndex((item) => item.shopProductId === product.shopProductId);
    if (storyIndex >= 0) {
      storyScrollRef.current?.scrollTo({ x: Math.max(0, storyIndex * 68 - 24), animated: true });
    }
  }, [product.shopProductId, storyProducts]);

  const shareProduct = async () => {
    try {
      await Share.share({
        message: `${title}${packLabel ? `\n${packLabel}` : ''}\n₹${selected?.sellingPrice ?? product.sellingPrice ?? 0}`,
      });
    } catch {
      // user cancelled share
    }
  };

  const exploreBrand = () => {
    const brand = asText(product.brand).toLowerCase();
    if (!brand) return;
    const next = storyProducts.find((item) => item.shopProductId !== product.shopProductId && asText(item.brand).toLowerCase() === brand);
    if (next) onSwitchProduct(next);
  };

  const onHeroScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / windowWidth);
    if (nextIndex !== safeIndex && nextIndex >= 0 && nextIndex < options.length) {
      onSelectVariant(nextIndex);
    }
  };

  useEffect(() => {
    setShowAddForm(false);
    setNewVariantName('');
    setNewVariantPrice('');
    setNewVariantMrp('');
    setNewVariantStock('0');
    setNewVariantImage(null);
    setNewAttributeValues({});
  }, [product.shopProductId]);

  const openAddVariantForm = () => {
    setShowAddForm(true);
    setNewVariantName('');
    setNewVariantPrice(selected?.sellingPrice ? String(selected.sellingPrice) : '');
    setNewVariantMrp(selected?.mrp ? String(selected.mrp) : '');
    setNewVariantStock('0');
    setNewVariantImage(asHttpUrl(product.imageUrl));
    const seed: Record<string, string> = {};
    attributeTypes.forEach((key) => { seed[key] = ''; });
    setNewAttributeValues(seed);
  };

  const pickNewVariantImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync(SQUARE_GALLERY_PICKER_OPTIONS);
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setNewVariantImage(result.assets[0].uri);
    }
  };

  const submitNewVariant = async () => {
    if (!newVariantName.trim() || !newVariantPrice.trim()) {
      Alert.alert('Fields missing', 'Enter variant name and selling price.');
      return;
    }
    const attributes: Record<string, string> = {};
    attributeTypes.forEach((key) => {
      const value = asText(newAttributeValues[key]);
      if (value) attributes[key] = value;
    });
    const primaryAttr = asText(newAttributeValues[attributeTypes[0]]);
    const created: ProductVariantItem = {
      id: 0,
      variantName: newVariantName.trim(),
      brand: product.brand || '',
      unit: product.unit || '',
      unitValue: product.unitValue || '',
      mrp: parseFloat(newVariantMrp) || parseFloat(newVariantPrice) || 0,
      sellingPrice: parseFloat(newVariantPrice) || 0,
      stockQuantity: parseInt(newVariantStock, 10) || 0,
      thresholdQuantity: 0,
      imageUrl: asHttpUrl(newVariantImage) || product.imageUrl,
      expiryDate: asIsoDate(product.expiryDate),
      shortDescription: product.shortDescription,
      attributes: primaryAttr || Object.keys(attributes).length ? attributes : { [attributeTypes[0]]: newVariantName.trim() },
    };
    const ok = await onAddVariant(product, created);
    if (ok) setShowAddForm(false);
  };

  const renderHeroItem = ({ item }: { item: ProductVariantItem }) => {
    const image = getVariantHeroImage(item, product);
    return (
      <View style={styles.pdpHeroPage}>
        {image ? (
          <Image source={{ uri: image }} style={styles.pdpHeroImage} />
        ) : (
          <View style={styles.pdpHeroFallback}>
            <Text style={styles.pdpHeroFallbackText}>{(title || 'P').charAt(0).toUpperCase()}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <SafeAreaView style={styles.pdpOverlay} edges={['top', 'bottom']}>
      <View style={styles.pdpCard}>
        <View style={styles.pdpHero}>
          <FlatList
            ref={heroRef}
            data={options}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item, index) => `hero_${product.shopProductId}_${item.id || index}`}
            renderItem={renderHeroItem}
            getItemLayout={(_, index) => ({ length: windowWidth, offset: windowWidth * index, index })}
            onMomentumScrollEnd={onHeroScrollEnd}
            extraData={safeIndex}
          />
          <TouchableOpacity style={styles.pdpHeroBtnLeft} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2B1E1A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <Path d="m6 9 6 6 6-6" />
            </Svg>
          </TouchableOpacity>
          <View style={styles.pdpHeroBtnRow}>
            <TouchableOpacity style={styles.pdpIconBtn} onPress={() => onToggleSave(product.shopProductId)}>
              <Svg width="18" height="18" viewBox="0 0 24 24" fill={isSaved ? INSTAMART_BLUE : 'none'} stroke={isSaved ? INSTAMART_BLUE : '#2B1E1A'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <Path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </Svg>
            </TouchableOpacity>
            <TouchableOpacity style={styles.pdpIconBtn} onPress={shareProduct}>
              <Svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2B1E1A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <Path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <Path d="m16 6-4-4-4 4" />
                <Path d="M12 2v13" />
              </Svg>
            </TouchableOpacity>
          </View>
          <View style={styles.pdpHeroMeta} pointerEvents="box-none">
            <View style={styles.pdpDots}>
              {options.length > 1 ? options.map((variant, index) => (
                <TouchableOpacity
                  key={`dot_${product.shopProductId}_${variant.id || index}`}
                  style={[styles.pdpDot, index === safeIndex && styles.pdpDotActive]}
                  onPress={() => onSelectVariant(index)}
                />
              )) : null}
            </View>
            {stockLeft > 0 ? (
              <View style={styles.pdpHeroBadge}>
                <Text style={styles.pdpHeroBadgeText}>{stockLeft} LEFT</Text>
              </View>
            ) : null}
          </View>
        </View>

        <ScrollView style={styles.pdpBody} showsVerticalScrollIndicator={false}>
          {!!product.brand && (
            <TouchableOpacity onPress={exploreBrand} activeOpacity={0.8}>
              <Text style={styles.pdpBrandLink}>Explore all {product.brand} items ›</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.pdpTitle}>{title}</Text>
          {!!description && <Text style={styles.pdpSubtitle}>{description}</Text>}
          {!!attributeLabel && <Text style={styles.pdpAttr}>{attributeLabel}</Text>}

          <ScrollView
            ref={thumbScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pdpThumbRow}
          >
            {options.map((variant, index) => {
              const thumb = getVariantHeroImage(variant, product);
              const isActive = index === safeIndex;
              const canDelete = asNumber(variant.id) > 0;
              return (
                <View key={`thumb_${product.shopProductId}_${variant.id || index}`} style={styles.pdpThumbWrap}>
                  <TouchableOpacity
                    style={[styles.pdpThumb, isActive && styles.pdpThumbActive]}
                    onPress={() => onSelectVariant(index)}
                    activeOpacity={0.85}
                  >
                    {thumb ? (
                      <Image source={{ uri: thumb }} style={styles.pdpThumbImage} />
                    ) : (
                      <View style={styles.pdpThumbFallback}>
                        <Text style={styles.pdpThumbFallbackText}>{(variant.variantName || 'V').charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  {canDelete ? (
                    <TouchableOpacity
                      style={styles.pdpThumbDelete}
                      onPress={() => onDeleteVariant(product, variant)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Text style={styles.pdpThumbDeleteText}>×</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}
            <TouchableOpacity style={styles.pdpThumbAdd} onPress={openAddVariantForm} activeOpacity={0.85}>
              <Text style={styles.pdpThumbAddText}>+</Text>
            </TouchableOpacity>
          </ScrollView>

          {showAddForm ? (
            <View style={styles.pdpAddForm}>
              <Text style={styles.pdpAddFormTitle}>Add a variant</Text>
              <Text style={styles.inputLabelField}>Variant name *</Text>
              <TextInput
                style={styles.customTextInputRow}
                placeholder="e.g. Chocolate"
                value={newVariantName}
                onChangeText={setNewVariantName}
              />
              {attributeTypes.map((attrKey) => (
                <View key={`attr_${attrKey}`}>
                  <Text style={styles.inputLabelField}>{attrKey}</Text>
                  <TextInput
                    style={styles.customTextInputRow}
                    placeholder={attrKey}
                    value={newAttributeValues[attrKey] || ''}
                    onChangeText={(text) => setNewAttributeValues((prev) => ({ ...prev, [attrKey]: text }))}
                  />
                </View>
              ))}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 0.48 }}>
                  <Text style={styles.inputLabelField}>Selling price *</Text>
                  <TextInput style={styles.customTextInputRow} placeholder="145" keyboardType="numeric" value={newVariantPrice} onChangeText={setNewVariantPrice} />
                </View>
                <View style={{ flex: 0.48 }}>
                  <Text style={styles.inputLabelField}>MRP</Text>
                  <TextInput style={styles.customTextInputRow} placeholder="180" keyboardType="numeric" value={newVariantMrp} onChangeText={setNewVariantMrp} />
                </View>
              </View>
              <Text style={styles.inputLabelField}>Stock qty</Text>
              <TextInput style={styles.customTextInputRow} placeholder="0" keyboardType="numeric" value={newVariantStock} onChangeText={setNewVariantStock} />
              <TouchableOpacity style={styles.variantImagePreviewContainer} onPress={pickNewVariantImage}>
                {asHttpUrl(newVariantImage) ? (
                  <Image source={{ uri: asHttpUrl(newVariantImage) || '' }} style={styles.fullPreviewTargetImage} />
                ) : (
                  <Text style={styles.photoTriggerBtnLabel}>Tap to add variant image</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.pdpFooter}>
          <View>
            <Text style={styles.pdpFooterPack}>{packLabel}</Text>
            <View style={styles.pricingRowStack}>
              <Text style={styles.pdpFooterPrice}>₹{selected?.sellingPrice ?? 0}</Text>
              {selected?.mrp && selected.mrp > (selected.sellingPrice || 0) ? (
                <Text style={styles.mrpCrossedVal}>₹{selected.mrp}</Text>
              ) : null}
            </View>
          </View>
          {showAddForm ? (
            <View style={styles.pdpFooterActions}>
              <TouchableOpacity style={styles.pdpCancelBtn} onPress={() => setShowAddForm(false)} disabled={isSavingVariant}>
                <Text style={styles.pdpCancelBtnText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pdpAddBtn} onPress={submitNewVariant} disabled={isSavingVariant} activeOpacity={0.85}>
                {isSavingVariant ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.pdpAddBtnText}>SAVE</Text>}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.pdpAddBtn} onPress={openAddVariantForm} activeOpacity={0.85}>
              <Text style={styles.pdpAddBtnText}>ADD VARIANT</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.pdpStoryBar}>
        <ScrollView ref={storyScrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pdpStoryRow}>
          {storyProducts.map((item) => {
            const active = item.shopProductId === product.shopProductId;
            const storyImage = asHttpUrl(item.imageUrl) || asHttpUrl(item.variants?.[0]?.imageUrl);
            return (
              <TouchableOpacity
                key={`story_${item.shopProductId}`}
                style={styles.pdpStoryItem}
                onPress={() => onSwitchProduct(item)}
                activeOpacity={0.85}
              >
                <View style={[styles.pdpStoryRing, active && styles.pdpStoryRingActive]}>
                  {storyImage ? (
                    <Image source={{ uri: storyImage }} style={styles.pdpStoryImage} />
                  ) : (
                    <View style={styles.pdpStoryFallback}>
                      <Text style={styles.pdpStoryFallbackText}>{(item.productName || 'P').charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </SafeAreaView>
    </KeyboardAvoidingView>
  );
};

const ProductGridItem = React.memo(({ item, onOpenVariants, onEdit, onDelete, onToggleVisibility, gridWidth }: { 
  item: CatalogProductItem;
  onOpenVariants: (item: CatalogProductItem) => void;
  onEdit: (item: CatalogProductItem) => void; 
  onDelete: (id: number) => void;
  onToggleVisibility: (id: number, currentActiveState: boolean) => void;
  gridWidth: number;
}) => {
  if (!item) return null;

  const isVisible = item.active !== false;
  const safeName = String(item.productName || 'Product');
  const safeBrand = String(item.brand || '');
  const safeUnitVal = String(item.unitValue || '');
  const safeUnitType = String(item.unit || '');

  return (
    <TouchableOpacity 
      style={[styles.productBlockContainer, { maxWidth: (gridWidth / 2) - 10 }, !isVisible && styles.inactiveCardOpacity]}
      onPress={() => onOpenVariants(item)}
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
            <Text style={styles.trashText}>Del</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.blankImageSectionPlaceholder}>
        {asHttpUrl(item.imageUrl) || asHttpUrl(item.variants?.[0]?.imageUrl) ? (
          <Image source={{ uri: asHttpUrl(item.imageUrl) || asHttpUrl(item.variants?.[0]?.imageUrl) || '' }} style={styles.catalogRenderedImage} />
        ) : (
          <View style={styles.zeptoCoreAssetCircle}>
            <Text style={styles.assetFrameChar}>{safeName.charAt(0).toUpperCase()}</Text>
          </View>
        )}
      </View>

      <View style={styles.productDetailMetaFrame}>
        {safeBrand ? <Text style={styles.brandMetaLabel} numberOfLines={1}>{safeBrand}</Text> : null}
        <Text style={styles.productNameLabel} numberOfLines={2}>{safeName}</Text>
        <Text style={styles.unitScaleTag}>{[safeUnitVal, safeUnitType].filter(Boolean).join(' ')}</Text>
        {item.hasVariants && Array.isArray(item.variants) && item.variants.length > 0 ? (
          <Text style={styles.optionCountTag}>{item.variants.length} packs · tap to slide</Text>
        ) : null}
        <View style={styles.pricingRowStack}>
          <Text style={styles.sellingPriceVal}>₹{item.sellingPrice ?? 0}</Text>
          <Text style={styles.mrpCrossedVal}>₹{item.mrp ?? 0}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

export const CategoryView: React.FC<CategoryViewProps> = ({
  onNavigate,
  authToken,
  mode = 'categories',
  selectedSubCategoryId: incomingSubCategoryId = null,
  onOpenSubCategory,
}) => {
  const [serverGroups, setServerGroups] = useState<ServerCategoryGroup[]>([]);
  const [backendCategoryFilteredProducts, setBackendCategoryFilteredProducts] = useState<CatalogProductItem[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [catalogLoadError, setCatalogLoadError] = useState<string>('');

  const [selectedSubCategoryId, setSelectedSubCategoryId] = useState<number | null>(incomingSubCategoryId);
  const [productSearchQuery, setProductSearchQuery] = useState<string>('');
  const [isSubFilterOpen, setIsSubFilterOpen] = useState(false);
  const [formSubCategoryId, setFormSubCategoryId] = useState<number | null>(null);
  const [removedVariantIds, setRemovedVariantIds] = useState<number[]>([]);
  const [prodAttributeTypesInput, setProdAttributeTypesInput] = useState<string>('');

  const [isProductModalOpen, setIsProductModalOpen] = useState<boolean>(false);
  const [variantSheetProduct, setVariantSheetProduct] = useState<CatalogProductItem | null>(null);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState<number>(0);
  const [savedProductIds, setSavedProductIds] = useState<Set<number>>(new Set());
  const [isSavingVariant, setIsSavingVariant] = useState(false);
  
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
  const [prodExpiryDate, setProdExpiryDate] = useState<string>('');
  const [prodHasVariants, setProdHasVariants] = useState<boolean>(false);
  const [productImageTarget, setProductImageTarget] = useState<string | null>(null);

  // FULL VARIANT INPUT STATES
  const [vNameInput, setVNameInput] = useState<string>('');
  const [vBrandInput, setVBrandInput] = useState<string>('');
  const [vExpiryDate, setVExpiryDate] = useState<string>('');
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
        } else if (isMounted) {
          setCatalogLoadError(
            mode === 'products'
              ? 'Log in to load products from GET /v1/admin/catalog/my-products.'
              : 'Log in to load subcategories from GET /v1/admin/catalog/my-products.'
          );
          setServerGroups([]);
          setBackendCategoryFilteredProducts([]);
          setIsLoading(false);
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
    setCatalogLoadError('');
    try {
      const response = await fetch(adminCatalogUrls.tree(), {
        method: 'GET',
        headers: catalogAuthHeaders(resolvedToken)
      });

      const itemsData = await readCatalogJson(response);
      const normalizedGroups = parseMyProductsTree(itemsData);

      setServerGroups(normalizedGroups);

      if (mode === 'products') {
        const requestedSubId = incomingSubCategoryId && flattenSubCategories(normalizedGroups).some((sub) => sub.subCategoryId === incomingSubCategoryId)
          ? incomingSubCategoryId
          : selectedSubCategoryId && flattenSubCategories(normalizedGroups).some((sub) => sub.subCategoryId === selectedSubCategoryId)
            ? selectedSubCategoryId
            : null;
        setSelectedSubCategoryId(requestedSubId);
        await loadProductsForFilter(normalizedGroups, requestedSubId, resolvedToken);
      } else {
        setBackendCategoryFilteredProducts([]);
      }
    } catch (err) {
      const message = err instanceof CatalogApiError ? err.message : 'Could not load catalog products from the API.';
      setCatalogLoadError(message);
      console.log("Sync error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProductsBySubCategory = useCallback(async (subCategoryId: number, overrideToken?: string): Promise<CatalogProductItem[]> => {
    try {
      const token = overrideToken || authToken || (await AsyncStorage.getItem('user_auth_token'));
      if (!token) return [];

      const response = await fetch(adminCatalogUrls.bySubCategory(subCategoryId), {
        method: 'GET',
        headers: catalogAuthHeaders(token.trim())
      });

      const payload = await readCatalogJson(response);
      return extractProductsFromCategoryPayload(payload);
    } catch (error) {
      console.log('Subcategory catalog fetch failed:', error);
      return [];
    }
  }, [authToken]);

  const loadProductsForFilter = async (
    groups: ServerCategoryGroup[],
    subCategoryId: number | null,
    overrideToken?: string,
  ) => {
    const treeProducts = productsAcrossTree(groups, subCategoryId);
    setBackendCategoryFilteredProducts(treeProducts);
    if (subCategoryId) {
      const fetched = await fetchProductsBySubCategory(subCategoryId, overrideToken);
      setBackendCategoryFilteredProducts(mergeUniqueProducts(treeProducts, fetched));
      return;
    }
    const allSubs = flattenSubCategories(groups);
    if (allSubs.length === 0) return;
    try {
      const lists = await Promise.all(
        allSubs.map((sub) => fetchProductsBySubCategory(sub.subCategoryId, overrideToken))
      );
      setBackendCategoryFilteredProducts(mergeUniqueProducts(treeProducts, ...lists));
    } catch {
      setBackendCategoryFilteredProducts(treeProducts);
    }
  };

  const applySubCategoryFilter = useCallback(async (subCategoryId: number | null) => {
    setSelectedSubCategoryId(subCategoryId);
    onOpenSubCategory?.(subCategoryId);
    await loadProductsForFilter(serverGroups, subCategoryId);
  }, [serverGroups, onOpenSubCategory, fetchProductsBySubCategory]);

  const openSubCategoryProducts = (subCategoryId: number) => {
    onOpenSubCategory?.(subCategoryId);
  };

  useEffect(() => {
    if (mode !== 'products') return;
    if (!serverGroups.length) return;
    const nextId = incomingSubCategoryId ?? null;
    if (nextId === selectedSubCategoryId) return;
    setSelectedSubCategoryId(nextId);
    loadProductsForFilter(serverGroups, nextId);
  }, [mode, incomingSubCategoryId, serverGroups]);

  const toggleProductVisibility = useCallback(async (shopProductId: number, currentActiveState: boolean) => {
    const nextActiveState = !currentActiveState;
    const fastToken = authToken || (await AsyncStorage.getItem('user_auth_token'));
    
    if (!fastToken) return;

    setServerGroups(prevGroups => (Array.isArray(prevGroups) ? prevGroups : []).map(group => ({
      ...group,
      products: Array.isArray(group.products) 
        ? group.products.map(prod => prod.shopProductId === shopProductId ? { ...prod, active: nextActiveState } : prod)
        : []
    })));

    setBackendCategoryFilteredProducts(prev => 
      prev !== null ? prev.map(p => p.shopProductId === shopProductId ? { ...p, active: nextActiveState } : p) : null
    );

    try {
      await catalogSendJson(adminCatalogUrls.visibility(shopProductId, nextActiveState), fastToken.trim(), 'PATCH');
    } catch (error) {
      const revertActiveState = currentActiveState;
      setServerGroups(prevGroups => (Array.isArray(prevGroups) ? prevGroups : []).map(group => ({
        ...group,
        products: Array.isArray(group.products)
          ? group.products.map(prod => prod.shopProductId === shopProductId ? { ...prod, active: revertActiveState } : prod)
          : []
      })));
      setBackendCategoryFilteredProducts(prev =>
        prev !== null ? prev.map(p => p.shopProductId === shopProductId ? { ...p, active: revertActiveState } : p) : null
      );
      const message = error instanceof CatalogApiError ? error.message : 'Could not update visibility.';
      Alert.alert('Visibility failed', message);
    }
  }, [authToken]);

  const closeVariantSheet = useCallback(() => {
    setVariantSheetProduct(null);
    setSelectedVariantIndex(0);
  }, []);

  const mergeFreshProducts = useCallback((incoming: CatalogProductItem[]) => {
    if (!incoming.length) return;
    setBackendCategoryFilteredProducts((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) return incoming;
      const byId = new Map(incoming.map((item) => [item.shopProductId, item]));
      return prev.map((item) => byId.get(item.shopProductId) || item);
    });
  }, []);

  const openVariantSheet = useCallback((item: CatalogProductItem) => {
    if (!item) return;
    setSelectedVariantIndex(0);
    setVariantSheetProduct(item);
    const subId = item.subCategoryId || selectedSubCategoryId;
    if (!subId) return;
    fetchProductsBySubCategory(subId).then((list) => {
      if (!list.length) return;
      mergeFreshProducts(list);
      const fresh = findProductById(list, item.shopProductId);
      if (!fresh) return;
      setVariantSheetProduct((current) => (
        current && current.shopProductId === fresh.shopProductId ? fresh : current
      ));
    });
  }, [fetchProductsBySubCategory, mergeFreshProducts, selectedSubCategoryId]);

  const refreshOpenedProduct = useCallback(async (shopProductId: number, subCategoryId?: number) => {
    const subId = subCategoryId || selectedSubCategoryId;
    if (!subId) return null;
    const list = await fetchProductsBySubCategory(subId);
    if (!list.length) return null;
    mergeFreshProducts(list);
    const fresh = findProductById(list, shopProductId);
    if (fresh) {
      setVariantSheetProduct((current) => (
        current && current.shopProductId === fresh.shopProductId ? fresh : current
      ));
    }
    return fresh;
  }, [fetchProductsBySubCategory, mergeFreshProducts, selectedSubCategoryId]);

  const addVariantFromPopup = useCallback(async (product: CatalogProductItem, variant: ProductVariantItem): Promise<boolean> => {
    const fastToken = authToken || (await AsyncStorage.getItem('user_auth_token'));
    if (!fastToken) {
      Alert.alert('Login required', 'Sign in again to add a variant.');
      return false;
    }
    setIsSavingVariant(true);
    try {
      const headers = catalogAuthHeaders(fastToken.trim(), true);
      if (!product.hasVariants) {
        const enableResponse = await fetch(adminCatalogUrls.updateProduct(product.shopProductId), {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            hasVariants: true,
            attributeTypes: resolveAttributeTypes(product),
          }),
        });
        await readCatalogJson(enableResponse);
      }

      const addResponse = await fetch(adminCatalogUrls.addVariants(), {
        method: 'POST',
        headers,
        body: JSON.stringify(buildAddVariantsBody(product, variant)),
      });
      await readCatalogJson(addResponse);
      const fresh = await refreshOpenedProduct(product.shopProductId, product.subCategoryId);
      if (fresh && Array.isArray(fresh.variants) && fresh.variants.length > 0) {
        setSelectedVariantIndex(fresh.variants.length - 1);
      }
      return true;
    } catch (error) {
      const message = error instanceof CatalogApiError ? error.message : 'Could not add this variant.';
      Alert.alert('Variant not saved', message);
      return false;
    } finally {
      setIsSavingVariant(false);
    }
  }, [authToken, refreshOpenedProduct]);

  const deleteVariantFromPopup = useCallback(async (product: CatalogProductItem, variant: ProductVariantItem) => {
    const variantId = asNumber(variant.id);
    if (variantId <= 0) return;
    const fastToken = authToken || (await AsyncStorage.getItem('user_auth_token'));
    if (!fastToken) return;
    Alert.alert('Delete variant', `Remove ${variant.variantName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const response = await fetch(adminCatalogUrls.deleteVariant(variantId), {
              method: 'DELETE',
              headers: catalogAuthHeaders(fastToken.trim()),
            });
            await readCatalogJson(response);
            setSelectedVariantIndex(0);
            await refreshOpenedProduct(product.shopProductId, product.subCategoryId);
          } catch (error) {
            const message = error instanceof CatalogApiError ? error.message : 'Could not delete this variant.';
            Alert.alert('Delete failed', message);
          }
        },
      },
    ]);
  }, [authToken, refreshOpenedProduct]);

  const selectVariantInSheet = useCallback((index: number) => {
    setSelectedVariantIndex(index);
  }, []);

  const switchProductInSheet = useCallback((item: CatalogProductItem) => {
    openVariantSheet(item);
  }, [openVariantSheet]);

  const toggleSavedProduct = useCallback((shopProductId: number) => {
    setSavedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(shopProductId)) next.delete(shopProductId);
      else next.add(shopProductId);
      return next;
    });
  }, []);

  const pickImageFromDeviceGallery = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync(SQUARE_GALLERY_PICKER_OPTIONS);
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setProductImageTarget(result.assets[0].uri);
    }
  };

  const pickVariantImageFromDeviceGallery = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync(SQUARE_GALLERY_PICKER_OPTIONS);
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
    setProdExpiryDate(asIsoDate(item.expiryDate));
    setProdHasVariants(!!item.hasVariants || (Array.isArray(item.variants) && item.variants.length > 0));
    setProductImageTarget(asHttpUrl(item.imageUrl));
    setProdAttributeTypesInput(Array.isArray(item.attributeTypes) ? item.attributeTypes.filter(Boolean).join(', ') : '');
    setFormSubCategoryId(item.subCategoryId || selectedSubCategoryId || flattenSubCategories(serverGroups)[0]?.subCategoryId || null);
    
    setTempVariantsList(Array.isArray(item.variants) ? item.variants : []);
    setRemovedVariantIds([]);
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
    setProdExpiryDate('');
    setProdHasVariants(false);
    setProductImageTarget(null);
    setVariantImageTarget(null);
    
    setVNameInput('');
    setVBrandInput('');
    setVExpiryDate('');
    setVUnitVal('');
    setVUnitType('Kg');
    setVPriceInput('');
    setVMrpInput('');
    setVStockQty('0');
    setVThresholdQty('0');

    setTempVariantsList([]);
    setRemovedVariantIds([]);
    setProdAttributeTypesInput('');
    setFormSubCategoryId(null);
    setIsEditingMode(false);
    setTargetEditProductId(null);
    setIsProductModalOpen(false);
  }, []);

  const openAddProductModal = useCallback(() => {
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
    setProdExpiryDate('');
    setProdHasVariants(false);
    setProductImageTarget(null);
    setVariantImageTarget(null);
    setVNameInput('');
    setVBrandInput('');
    setVExpiryDate('');
    setVUnitVal('');
    setVUnitType('Kg');
    setVPriceInput('');
    setVMrpInput('');
    setVStockQty('0');
    setVThresholdQty('0');
    setTempVariantsList([]);
    setRemovedVariantIds([]);
    setProdAttributeTypesInput('');
    setIsEditingMode(false);
    setTargetEditProductId(null);
    setFormSubCategoryId(selectedSubCategoryId || flattenSubCategories(serverGroups)[0]?.subCategoryId || null);
    setIsProductModalOpen(true);
  }, [serverGroups, selectedSubCategoryId]);

  const saveOrUpdateProductWorkflow = async () => {
    if (!prodNameInput.trim() || !prodPriceInput.trim()) {
      Alert.alert("Fields Missing", "Please complete name and price parameters first.");
      return;
    }

    const fastToken = authToken || (await AsyncStorage.getItem('user_auth_token'));
    if (!fastToken) return;

    const resolvedSubCategoryId = formSubCategoryId || selectedSubCategoryId || flattenSubCategories(serverGroups)[0]?.subCategoryId || null;

    if (!isEditingMode && !resolvedSubCategoryId) {
      Alert.alert("Subcategory required", "Pick a subcategory from GET /v1/admin/catalog/my-products before adding a product.");
      return;
    }

    const safeVariants = Array.isArray(tempVariantsList) ? tempVariantsList : [];
    const existingVariants = safeVariants.filter((variant) => asNumber(variant.id) > 0);
    const newVariants = safeVariants.filter((variant) => !variant.id || asNumber(variant.id) <= 0);
    const attributeTypes = buildAttributeTypes(parseAttributeTypesInput(prodAttributeTypesInput), safeVariants);
    const hasVariants = prodHasVariants || safeVariants.length > 0;
    const writeFields = {
      productName: prodNameInput.trim(),
      sellingPrice: parseFloat(prodPriceInput) || 0,
      stockQuantity: parseInt(prodStockQty, 10) || 0,
      shortDescription: prodShortDesc.trim(),
      longDescription: prodLongDesc.trim(),
      brand: prodBrandInput.trim(),
      imageUrl: asHttpUrl(productImageTarget),
      mrp: parseFloat(prodMrpInput) || parseFloat(prodPriceInput) || 0,
      thresholdQuantity: parseInt(prodThresholdQty, 10) || 0,
      unit: prodUnitType.trim(),
      unitValue: prodUnitVal.trim(),
      expiryDate: asIsoDate(prodExpiryDate),
      hasVariants,
      attributeTypes,
    };

    setIsLoading(true);
    try {
      const token = fastToken.trim();

      if (isEditingMode && targetEditProductId !== null) {
        for (const variantId of removedVariantIds) {
          await catalogSendJson(adminCatalogUrls.deleteVariant(variantId), token, 'DELETE');
        }

        await catalogSendJson(
          adminCatalogUrls.updateProduct(targetEditProductId),
          token,
          'PUT',
          buildUpdateProductBody(writeFields),
        );

        for (const variant of existingVariants) {
          await catalogSendJson(
            adminCatalogUrls.updateVariant(variant.id),
            token,
            'PUT',
            buildVariantRequest(variant, prodBrandInput, prodExpiryDate),
          );
        }

        if (newVariants.length > 0) {
          await catalogSendJson(adminCatalogUrls.addVariants(), token, 'POST', {
            parentShopProductId: targetEditProductId,
            attributeTypes: attributeTypes.length > 0 ? attributeTypes : ['Flavour'],
            variants: newVariants.map((variant) => buildVariantRequest(variant, prodBrandInput, prodExpiryDate)),
          });
        }

        await syncInventoryFromServer(token);
        if (selectedSubCategoryId) {
          await applySubCategoryFilter(selectedSubCategoryId);
        }
        closeFormAndWipeDataBuffers();
        Alert.alert("Success", "Product updated successfully!");
        return;
      }

      await catalogSendJson(
        adminCatalogUrls.addUnlisted(),
        token,
        'POST',
        buildAddUnlistedBody(resolvedSubCategoryId as number, {
          ...writeFields,
          variants: safeVariants,
        }),
      );

      await syncInventoryFromServer(token);
      if (selectedSubCategoryId) {
        await applySubCategoryFilter(selectedSubCategoryId);
      }
      closeFormAndWipeDataBuffers();
      Alert.alert("Success", "Product added successfully!");
    } catch (err) {
      const message = err instanceof CatalogApiError ? err.message : 'Failed synchronization loop.';
      Alert.alert(err instanceof CatalogApiError ? 'Server Rejected' : 'Network Issue', message);
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
      
      await catalogSendJson(adminCatalogUrls.visibility(idToDelete, false), fastToken.trim(), 'PATCH');
    } catch (err) {
      const message = err instanceof CatalogApiError ? err.message : 'Could not hide this product.';
      Alert.alert('Delete failed', message);
    }
  }, [authToken]);

  const addVariantToTempList = useCallback(() => {
    if (!vNameInput.trim() || !vPriceInput.trim()) return;
    const attributes: Record<string, string> = {};
    const unitType = vUnitType.trim() || prodUnitType.trim();
    const unitValue = vUnitVal.trim() || prodUnitVal.trim();
    if (unitType) attributes.unit = unitType;
    if (unitValue) attributes.unitValue = unitValue;
    
    setTempVariantsList(prev => [...(Array.isArray(prev) ? prev : []), {
      id: 0, 
      variantName: vNameInput.trim(),
      brand: vBrandInput.trim() || prodBrandInput.trim(),
      unit: unitType,
      unitValue: unitValue,
      mrp: parseFloat(vMrpInput) || parseFloat(prodMrpInput) || parseFloat(vPriceInput) || 0,
      sellingPrice: parseFloat(vPriceInput) || 0,
      stockQuantity: parseInt(vStockQty, 10) || 0,
      thresholdQuantity: parseInt(vThresholdQty, 10) || 0,
      imageUrl: asHttpUrl(variantImageTarget) || asHttpUrl(productImageTarget),
      expiryDate: asIsoDate(vExpiryDate) || asIsoDate(prodExpiryDate),
      attributes,
    }]);

    setVNameInput('');
    setVBrandInput('');
    setVExpiryDate('');
    setVUnitVal('');
    setVUnitType('Kg');
    setVPriceInput('');
    setVMrpInput('');
    setVStockQty('0');
    setVThresholdQty('0');
    setVariantImageTarget(null);
  }, [vNameInput, vBrandInput, prodBrandInput, vUnitType, prodUnitType, vUnitVal, prodUnitVal, vMrpInput, prodMrpInput, vPriceInput, vStockQty, vThresholdQty, variantImageTarget, productImageTarget, vExpiryDate, prodExpiryDate]);

  const deleteVariantFromTempList = useCallback((indexToRemove: number) => {
    setTempVariantsList(prev => {
      const list = Array.isArray(prev) ? prev : [];
      const target = list[indexToRemove];
      if (target && asNumber(target.id) > 0) {
        setRemovedVariantIds((ids) => (ids.includes(target.id) ? ids : [...ids, target.id]));
      }
      return list.filter((_, idx) => idx !== indexToRemove);
    });
  }, []);

  const catalogSubCategories = useMemo(() => flattenSubCategories(serverGroups), [serverGroups]);
  const selectedSubFilterLabel = useMemo(() => {
    if (selectedSubCategoryId == null) return 'All';
    const match = catalogSubCategories.find((sub) => sub.subCategoryId === selectedSubCategoryId);
    return asText(match?.subCategoryName) || `#${selectedSubCategoryId}`;
  }, [catalogSubCategories, selectedSubCategoryId]);

  useEffect(() => {
    if (isProductModalOpen) setIsSubFilterOpen(false);
  }, [isProductModalOpen]);

  const filteredGridProducts = useMemo(() => {
    const source = Array.isArray(backendCategoryFilteredProducts)
      ? backendCategoryFilteredProducts
      : allProductsFromTree(serverGroups);
    return filterProductsBySearch(source, productSearchQuery);
  }, [backendCategoryFilteredProducts, serverGroups, productSearchQuery]);

  const gridAvailableWidth = useMemo(() => {
    return windowWidth;
  }, []);

  const renderGridItem = useCallback(({ item }: { item: CatalogProductItem }) => (
    <ProductGridItem 
      item={item}
      onOpenVariants={openVariantSheet}
      onEdit={openProductForEditingAction} 
      onDelete={deleteProductItem} 
      onToggleVisibility={toggleProductVisibility}
      gridWidth={gridAvailableWidth}
    />
  ), [openVariantSheet, openProductForEditingAction, deleteProductItem, toggleProductVisibility, gridAvailableWidth]);

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
        {mode === 'products' ? (
          <TouchableOpacity
            style={styles.leftPlusActionBtn}
            onPress={() => onNavigate?.('category')}
            activeOpacity={0.7}
          >
            <Text style={styles.headerToggleText}>‹</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSideSlot} />
        )}
        <Text style={styles.mainHeaderTitle} numberOfLines={1}>
          {mode === 'products' ? 'Products' : 'Categories'}
        </Text>
        {mode === 'products' ? (
          <TouchableOpacity
            style={[styles.rightPlusActionBtn, isProductModalOpen && { backgroundColor: '#2B1E1A' }]}
            onPress={openAddProductModal}
            activeOpacity={0.7}
          >
            <Text style={[styles.headerPlusText, isProductModalOpen && { color: '#FFFFFF' }]}>＋</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSideSlot} />
        )}
      </View>

      {mode === 'categories' ? (
        <View style={styles.rightProductGridPanel}>
          {isLoading && catalogSubCategories.length === 0 ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#D2691E" />
              <Text style={{ fontSize: 12, color: '#A89685', fontWeight: '700', marginTop: 10 }}>Loading subcategories...</Text>
            </View>
          ) : catalogSubCategories.length === 0 ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
              <Text style={{ fontSize: 13, color: '#5C4033', fontWeight: '700', textAlign: 'center' }}>
                {catalogLoadError || 'No subcategories returned from GET /v1/admin/catalog/my-products.'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={catalogSubCategories}
              keyExtractor={(item) => `sub_${item.subCategoryId}`}
              numColumns={2}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.categoryGridPadding}
              renderItem={({ item }: { item: CatalogSubCategoryTile }) => {
                const label = asText(item.subCategoryName) || `#${item.subCategoryId}`;
                return (
                  <TouchableOpacity
                    style={styles.categoryTile}
                    onPress={() => openSubCategoryProducts(item.subCategoryId)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.categoryTileIcon}>
                      <Text style={styles.categoryTileIconText}>{label.charAt(0).toUpperCase()}</Text>
                    </View>
                    <Text style={styles.categoryTileLabel} numberOfLines={2}>{label}</Text>
                    <Text style={styles.categoryTileMeta} numberOfLines={1}>
                      {item.products.length === 1 ? '1 product' : `${item.products.length} products`}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      ) : (
        <View style={styles.rightProductGridPanel}>
          <View style={styles.searchBox}>
            <Svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5C4033" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <Path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
              <Path d="m21 21-4.3-4.3" />
            </Svg>
            <TextInput
              style={styles.searchInput}
              placeholder="Search products"
              placeholderTextColor="#A89685"
              value={productSearchQuery}
              onChangeText={setProductSearchQuery}
            />
          </View>
          <View style={styles.subFilterBlock}>
            <TouchableOpacity
              style={styles.subFilterTrigger}
              onPress={() => setIsSubFilterOpen((open) => !open)}
              activeOpacity={0.85}
            >
              <Text style={styles.subFilterTriggerLabel} numberOfLines={1}>{selectedSubFilterLabel}</Text>
              <Text style={styles.subFilterChevron}>{isSubFilterOpen ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {isSubFilterOpen ? (
              <View style={styles.subFilterDropdown}>
                <ScrollView
                  style={styles.subFilterScroll}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                >
                  <TouchableOpacity
                    style={[styles.subFilterOption, selectedSubCategoryId == null && styles.subFilterOptionActive]}
                    onPress={() => {
                      setIsSubFilterOpen(false);
                      applySubCategoryFilter(null);
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.subFilterOptionText, selectedSubCategoryId == null && styles.subFilterOptionTextActive]}>All</Text>
                  </TouchableOpacity>
                  {catalogSubCategories.map((sub) => {
                    const isActive = selectedSubCategoryId === sub.subCategoryId;
                    return (
                      <TouchableOpacity
                        key={`sub_opt_${sub.subCategoryId}`}
                        style={[styles.subFilterOption, isActive && styles.subFilterOptionActive]}
                        onPress={() => {
                          setIsSubFilterOpen(false);
                          applySubCategoryFilter(sub.subCategoryId);
                        }}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.subFilterOptionText, isActive && styles.subFilterOptionTextActive]} numberOfLines={1}>
                          {asText(sub.subCategoryName) || `#${sub.subCategoryId}`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}
          </View>
          {isLoading && (!filteredGridProducts || filteredGridProducts.length === 0) ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#D2691E" />
              <Text style={{ fontSize: 12, color: '#A89685', fontWeight: '700', marginTop: 10 }}>Loading products...</Text>
            </View>
          ) : (!filteredGridProducts || filteredGridProducts.length === 0) ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
              <Text style={{ fontSize: 13, color: '#5C4033', fontWeight: '700', textAlign: 'center' }}>
                {catalogLoadError
                  ? catalogLoadError
                  : productSearchQuery.trim()
                    ? 'No products match your search.'
                    : 'No products returned from GET /v1/admin/catalog/my-products'}
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
      )}

      {/* MODAL: ADD & EDIT */}
      <Modal transparent visible={isProductModalOpen} animationType="slide" onRequestClose={closeFormAndWipeDataBuffers}>
        <View style={styles.centerModalBackgroundOverlay}>
          <View style={styles.productDialogBoxFrame}>
            <View style={styles.drawerHeaderFrame}>
              <Text style={styles.drawerTitleText}>{isEditingMode ? 'Edit / Update Product Detail' : 'Add New Product'}</Text>
              <TouchableOpacity onPress={closeFormAndWipeDataBuffers}><Text style={styles.closeDrawerIconText}>X</Text></TouchableOpacity>
            </View>

            <ScrollView style={{ marginTop: 10 }} showsVerticalScrollIndicator={false}>
              {!isEditingMode && catalogSubCategories.length > 0 ? (
                <View>
                  <Text style={styles.inputLabelField}>Subcategory *</Text>
                  <View style={styles.formChipWrap}>
                    {catalogSubCategories.map((sub) => {
                      const isActive = formSubCategoryId === sub.subCategoryId;
                      return (
                        <TouchableOpacity
                          key={`form_sub_${sub.subCategoryId}`}
                          style={[styles.subCategoryChip, isActive && styles.subCategoryChipActive]}
                          onPress={() => setFormSubCategoryId(sub.subCategoryId)}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.subCategoryChipText, isActive && styles.subCategoryChipTextActive]} numberOfLines={1}>
                            {asText(sub.subCategoryName) || `#${sub.subCategoryId}`}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ) : null}

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
                  <TextInput style={styles.customTextInputRow} placeholder="YYYY-MM-DD" value={prodExpiryDate} onChangeText={setProdExpiryDate} />
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
                    <Text style={styles.plusVariantIconSymbol}>＋</Text>
                  </View>
                </View>
              </TouchableOpacity>

              {prodHasVariants && (
                <View style={styles.variantContainerBox}>
                  <Text style={styles.variantSectionHeaderTitle}>Add Variant Details</Text>
                  <Text style={styles.inputLabelField}>Attribute types</Text>
                  <TextInput
                    style={styles.customTextInputRow}
                    placeholder="Flavour, Size"
                    value={prodAttributeTypesInput}
                    onChangeText={setProdAttributeTypesInput}
                  />
                  
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
                      <TextInput style={styles.customTextInputRow} placeholder="YYYY-MM-DD" value={vExpiryDate} onChangeText={setVExpiryDate} />
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

      <Modal
        transparent
        visible={!!variantSheetProduct}
        animationType="slide"
        onRequestClose={closeVariantSheet}
      >
        {variantSheetProduct ? (
          <ProductDetailPopup
            product={variantSheetProduct}
            products={filteredGridProducts}
            selectedVariantIndex={selectedVariantIndex}
            savedIds={savedProductIds}
            onClose={closeVariantSheet}
            onSelectVariant={selectVariantInSheet}
            onSwitchProduct={switchProductInSheet}
            onToggleSave={toggleSavedProduct}
            isSavingVariant={isSavingVariant}
            onAddVariant={addVariantFromPopup}
            onDeleteVariant={deleteVariantFromPopup}
          />
        ) : null}
      </Modal>

      <BottomNavBar onNavigate={onNavigate} currentActive={mode === 'products' ? 'product' : 'category'} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  viewMainWrapper: { flex: 1, backgroundColor: '#FFFBF7' },
  topControlHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F0E2D3', backgroundColor: '#FFFFFF' },
  headerSideSlot: { width: 36, height: 28 },
  leftPlusActionBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: '#FFF5EA' },
  rightPlusActionBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: '#F5ECE2' },
  headerToggleText: { fontSize: 22, fontWeight: '800', color: '#D2691E', lineHeight: 24 },
  headerPlusText: { fontSize: 16, fontWeight: '800', color: '#2B1E1A' },
  mainHeaderTitle: { fontSize: 19, fontWeight: '800', color: '#2B1E1A', flex: 1, textAlign: 'center' },
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
  categoryGridPadding: { paddingHorizontal: 10, paddingTop: 12, paddingBottom: 110 },
  categoryTile: {
    flex: 1,
    margin: 6,
    minHeight: 130,
    backgroundColor: '#FFFBF7',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F0E2D3',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 18,
  },
  categoryTileIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#D2691E',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  categoryTileIconText: { fontSize: 20, fontWeight: '800', color: '#FFFBF7' },
  categoryTileLabel: { fontSize: 13, fontWeight: '800', color: '#2B1E1A', textAlign: 'center' },
  categoryTileMeta: { fontSize: 10, fontWeight: '700', color: '#A89685', textAlign: 'center', marginTop: 4 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFFBF7',
    borderWidth: 1,
    borderColor: '#F0E2D3',
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#2B1E1A',
    paddingVertical: 0,
  },
  subFilterBlock: { marginHorizontal: 12, marginTop: 8, marginBottom: 4, zIndex: 20 },
  subFilterTrigger: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F0E2D3',
    backgroundColor: '#FFFBF7',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subFilterTriggerLabel: { flex: 1, fontSize: 13, fontWeight: '700', color: '#2B1E1A', marginRight: 8 },
  subFilterChevron: { fontSize: 10, fontWeight: '800', color: '#D2691E' },
  subFilterDropdown: {
    marginTop: 6,
    maxHeight: 220,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F0E2D3',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#2B1E1A',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  subFilterScroll: { maxHeight: 220 },
  subFilterOption: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F7EFE5' },
  subFilterOptionActive: { backgroundColor: '#FFF5EA' },
  subFilterOptionText: { fontSize: 13, fontWeight: '700', color: '#5C4033' },
  subFilterOptionTextActive: { color: '#D2691E' },
  subCategoryChipRow: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4, alignItems: 'center' },
  formChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  subCategoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#FFF5EA',
    borderWidth: 1,
    borderColor: '#F0E2D3',
    marginRight: 8,
    marginBottom: 6,
  },
  subCategoryChipActive: { backgroundColor: '#D2691E', borderColor: '#D2691E' },
  subCategoryChipText: { fontSize: 12, fontWeight: '700', color: '#5C4033' },
  subCategoryChipTextActive: { color: '#FFFBF7' },
  gridContainerVerticalPadding: { paddingHorizontal: 6, paddingTop: 8, paddingBottom: 110 },
  productBlockContainer: { flex: 1, backgroundColor: '#FFFBF7', margin: 5, borderRadius: 14, borderWidth: 1, borderColor: '#F0E2D3', overflow: 'hidden', position: 'relative' },
  inactiveCardOpacity: { opacity: 0.55 },
  topCardFloatingActionBar: { position: 'absolute', top: 8, right: 8, zIndex: 10, flexDirection: 'row', alignItems: 'center' },
  productVisibilityBadge: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  eyeActiveBg: { backgroundColor: 'rgba(43, 30, 26, 0.85)' },
  eyeInactiveBg: { backgroundColor: 'rgba(43, 30, 26, 0.45)' },
  productPencilBadge: { backgroundColor: 'rgba(43, 30, 26, 0.85)', width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  productTrashBadge: { backgroundColor: 'rgba(210, 105, 30, 0.9)', paddingHorizontal: 6, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  trashText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
  blankImageSectionPlaceholder: { height: 115, backgroundColor: '#F7EFE5', alignItems: 'center', justifyContent: 'center' },
  catalogRenderedImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  zeptoCoreAssetCircle: { width: 65, height: 65, borderRadius: 32, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  assetFrameChar: { fontSize: 24, fontWeight: '800', color: '#D2691E' },
  productDetailMetaFrame: { padding: 8 },
  brandMetaLabel: { fontSize: 9, fontWeight: '700', color: '#A89685', textTransform: 'uppercase' },
  productNameLabel: { fontSize: 12.5, fontWeight: '700', color: '#2B1E1A', marginVertical: 2, height: 34 },
  unitScaleTag: { fontSize: 10.5, color: '#5C4033', fontWeight: '600', marginBottom: 4 },
  optionCountTag: { fontSize: 10, color: '#D2691E', fontWeight: '800', marginBottom: 4 },
  pricingRowStack: { flexDirection: 'row', alignItems: 'center' },
  sellingPriceVal: { fontSize: 13, fontWeight: '800', color: '#2B1E1A', marginRight: 6 },
  mrpCrossedVal: { fontSize: 10, color: '#A89685', textDecorationLine: 'line-through' },
  centerModalBackgroundOverlay: { flex: 1, backgroundColor: 'rgba(43, 30, 26, 0.4)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  productDialogBoxFrame: { width: '100%', maxHeight: '88%', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, elevation: 12 },
  drawerHeaderFrame: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F0E2D3' },
  drawerTitleText: { fontSize: 15, fontWeight: '800', color: '#2B1E1A' },
  closeDrawerIconText: { fontSize: 18, color: '#5C4033', padding: 4 },
  inputLabelField: { fontSize: 11, fontWeight: '700', color: '#5C4033', marginTop: 10, marginBottom: 4 },
  imageSelectorPreviewContainer: {
    width: 180,
    height: 180,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: '#E6D4BF',
    borderRadius: 12,
    backgroundColor: '#FFFBF7',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginVertical: 8,
  },
  variantImagePreviewContainer: {
    width: 140,
    height: 140,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: '#E6D4BF',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginVertical: 8,
  },
  fullPreviewTargetImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  photoTriggerBtnLabel: { fontSize: 11, color: '#D2691E', fontWeight: '700', textAlign: 'center', paddingHorizontal: 6 },
  customTextInputRow: { height: 44, borderWidth: 1, borderColor: '#E6D4BF', borderRadius: 8, paddingHorizontal: 12, color: '#2B1E1A', backgroundColor: '#FFFBF7', fontSize: 13 },
  submitNewProductBtn: { backgroundColor: '#D2691E', height: 46, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 10, marginBottom: 10 },
  submitCategoryLabel: { color: '#FFFBF7', fontSize: 13, fontWeight: '700' },
  variantSelectorToggle: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, borderStyle: 'dashed', borderWidth: 1.5, borderColor: '#D2691E', marginVertical: 14 },
  variantToggleInnerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  plusVariantIconButton: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#D2691E', alignItems: 'center', justifyContent: 'center' },
  plusVariantIconSymbol: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  variantContainerBox: { backgroundColor: '#FFFBF7', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E6D4BF', marginBottom: 10 },
  variantSectionHeaderTitle: { fontSize: 12, fontWeight: '700', color: '#5C4033', marginBottom: 6 },
  pushVariantBtn: { backgroundColor: '#5C4033', height: 36, borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  pushVariantBtnText: { color: '#FFFBF7', fontSize: 11, fontWeight: '700' },
  miniVariantStripRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 8, borderRadius: 6, borderWidth: 0.5, borderColor: '#E6D4BF', marginVertical: 3 },
  miniVariantImageThumb: { width: 24, height: 24, borderRadius: 4, marginRight: 8, resizeMode: 'cover' },
  miniVariantText: { fontSize: 11, color: '#5C4033', flex: 1, fontWeight: '600' },
  miniVariantDeleteCross: { fontSize: 12, color: '#D2691E', fontWeight: '800', paddingHorizontal: 4 },
  pdpOverlay: { flex: 1, backgroundColor: 'rgba(20, 16, 14, 0.72)', justifyContent: 'flex-end' },
  pdpCard: {
    flex: 1,
    marginTop: 18,
    marginHorizontal: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    overflow: 'hidden',
  },
  pdpHero: { height: HERO_HEIGHT, backgroundColor: '#FFFFFF', position: 'relative' },
  pdpHeroPage: { width: windowWidth, height: HERO_HEIGHT, backgroundColor: '#FFFFFF' },
  pdpHeroImage: { width: '100%', height: '100%', resizeMode: 'contain' },
  pdpHeroFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF8F1' },
  pdpHeroFallbackText: { fontSize: 64, fontWeight: '800', color: '#D2691E' },
  pdpHeroBtnLeft: {
    position: 'absolute',
    top: 14,
    left: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdpHeroBtnRow: { position: 'absolute', top: 14, right: 14, flexDirection: 'row' },
  pdpIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  pdpHeroMeta: {
    position: 'absolute',
    bottom: 10,
    left: 12,
    right: 12,
    height: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdpDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pdpDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(43,30,26,0.25)', marginHorizontal: 3 },
  pdpDotActive: { backgroundColor: '#2B1E1A', width: 8, height: 8, borderRadius: 4 },
  pdpHeroBadge: {
    position: 'absolute',
    right: 0,
    backgroundColor: 'rgba(43,30,26,0.78)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pdpHeroBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  pdpBody: { flex: 1, paddingHorizontal: 16, paddingTop: 14 },
  pdpBrandLink: { fontSize: 13, fontWeight: '700', color: INSTAMART_BLUE, marginBottom: 8 },
  pdpTitle: { fontSize: 22, fontWeight: '800', color: '#1A1A1A', lineHeight: 28 },
  pdpSubtitle: { fontSize: 13, color: '#8A7A6A', fontWeight: '600', marginTop: 6 },
  pdpAttr: { fontSize: 13, color: '#5C4033', fontWeight: '700', marginTop: 10, marginBottom: 12 },
  pdpThumbRow: { paddingBottom: 16, paddingRight: 8, alignItems: 'flex-start' },
  pdpThumbWrap: { marginRight: VARIANT_THUMB_GAP, position: 'relative' },
  pdpThumb: {
    width: VARIANT_THUMB_SIZE,
    height: VARIANT_THUMB_SIZE,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E8E8E8',
    overflow: 'hidden',
    backgroundColor: '#F7F7F7',
  },
  pdpThumbActive: { borderColor: INSTAMART_BLUE, borderWidth: 2.5 },
  pdpThumbImage: { width: '100%', height: '100%', resizeMode: 'contain' },
  pdpThumbFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pdpThumbFallbackText: { fontSize: 16, fontWeight: '800', color: '#D2691E' },
  pdpThumbDelete: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#2B1E1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdpThumbDeleteText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', marginTop: -1 },
  pdpThumbAdd: {
    width: VARIANT_THUMB_SIZE,
    height: VARIANT_THUMB_SIZE,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: INSTAMART_BLUE,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F8FF',
  },
  pdpThumbAddText: { color: INSTAMART_BLUE, fontSize: 28, fontWeight: '700', marginTop: -2 },
  pdpAddForm: { paddingBottom: 12 },
  pdpAddFormTitle: { fontSize: 14, fontWeight: '800', color: '#2B1E1A', marginBottom: 4 },
  pdpFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    backgroundColor: '#FFFFFF',
  },
  pdpFooterPack: { fontSize: 12, fontWeight: '700', color: '#8A7A6A', marginBottom: 2 },
  pdpFooterPrice: { fontSize: 22, fontWeight: '800', color: '#1A1A1A', marginRight: 8 },
  pdpFooterActions: { flexDirection: 'row', alignItems: 'center' },
  pdpCancelBtn: {
    height: 46,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#D9C8B6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    marginRight: 8,
  },
  pdpCancelBtnText: { color: '#5C4033', fontSize: 12, fontWeight: '800' },
  pdpAddBtn: {
    minWidth: 132,
    height: 46,
    borderRadius: 10,
    backgroundColor: INSTAMART_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  pdpAddBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  pdpStoryBar: { height: STORY_RAIL_HEIGHT, paddingTop: 10, paddingBottom: 14, backgroundColor: 'transparent' },
  pdpStoryRow: { paddingHorizontal: 12, alignItems: 'center' },
  pdpStoryItem: { marginRight: 10 },
  pdpStoryRing: {
    width: 58,
    height: 58,
    borderRadius: 29,
    padding: 3,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  pdpStoryRingActive: { borderColor: '#FFFFFF' },
  pdpStoryImage: { width: '100%', height: '100%', borderRadius: 26, resizeMode: 'cover' },
  pdpStoryFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 26,
    backgroundColor: '#FFF5EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdpStoryFallbackText: { fontSize: 16, fontWeight: '800', color: '#D2691E' },
});
