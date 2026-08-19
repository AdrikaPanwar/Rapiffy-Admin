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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BottomNavBar } from '../components/BottomNavBar';
import { adminCatalogUrls, catalogAuthHeaders } from '../api/adminCatalog';

const { width: windowWidth } = Dimensions.get('window');

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
  shortDescription?: string;
  longDescription?: string;
  gstSlab?: string;
  attributes?: Record<string, string>;
  active?: boolean;
}

export interface CatalogProductItem {
  shopProductId: number;
  masterProductId: number;
  categoryId?: number;
  subCategoryId?: number;
  subCategoryName?: string;
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
  attributeTypes?: string[];
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

const asText = (value: any): string => {
  const text = String(value ?? '').trim();
  if (!text || text === 'string') return '';
  return text;
};

const asHttpUrl = (value: any): string | null => {
  const text = asText(value);
  return text.startsWith('http') ? text : null;
};

const asNumber = (value: any, fallback = 0): number => {
  const n = Number(value);
  return isNaN(n) ? fallback : n;
};

const asAttributeMap = (raw: any): Record<string, string> => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const mapped: Record<string, string> = {};
  Object.keys(raw).forEach((key) => {
    const val = asText(raw[key]);
    if (val) mapped[key] = val;
  });
  return mapped;
};

const parseJsonSafe = (text: string): any => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const unwrapCategoryList = (payload: any): any[] => {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  if (payload && Array.isArray(payload.content)) return payload.content;
  return [];
};

const unwrapCategoryObject = (payload: any): any => {
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    return payload.data;
  }
  return payload;
};

const normalizeVariant = (raw: any): ProductVariantItem | null => {
  if (!raw || typeof raw !== 'object') return null;
  const attributes = asAttributeMap(raw.attributes);
  return {
    id: asNumber(raw.id ?? raw.variantId),
    variantName: asText(raw.variantName) || 'Variant',
    brand: asText(raw.brand),
    unit: asText(raw.unit) || asText(attributes.unit) || asText(attributes.Unit),
    unitValue: asText(raw.unitValue) || asText(attributes.unitValue) || asText(attributes.UnitValue),
    mrp: asNumber(raw.mrp),
    sellingPrice: asNumber(raw.sellingPrice),
    stockQuantity: asNumber(raw.stockQuantity),
    thresholdQuantity: asNumber(raw.thresholdQuantity),
    imageUrl: asHttpUrl(raw.imageUrl),
    expiryDate: asText(raw.expiryDate),
    shortDescription: asText(raw.shortDescription),
    longDescription: asText(raw.longDescription),
    gstSlab: asText(raw.gstSlab),
    attributes,
    active: raw.active !== false,
  };
};

const normalizeProduct = (raw: any, extras?: { categoryId?: number; categoryName?: string; subCategoryId?: number; subCategoryName?: string }): CatalogProductItem | null => {
  if (!raw || typeof raw !== 'object') return null;
  const shopProductId = asNumber(raw.shopProductId, NaN);
  if (isNaN(shopProductId)) return null;
  const variantsSource = Array.isArray(raw.variants) ? raw.variants : [];
  const attributeTypes = Array.isArray(raw.attributeTypes)
    ? raw.attributeTypes.map((item: any) => asText(item)).filter(Boolean)
    : [];
  return {
    shopProductId,
    masterProductId: asNumber(raw.masterProductId),
    categoryId: extras?.categoryId ?? (asNumber(raw.categoryId) || undefined),
    subCategoryId: extras?.subCategoryId ?? (asNumber(raw.subCategoryId) || undefined),
    subCategoryName: extras?.subCategoryName || asText(raw.subCategoryName),
    productName: asText(raw.productName) || 'Product',
    shortDescription: asText(raw.shortDescription),
    longDescription: asText(raw.longDescription),
    brand: asText(raw.brand),
    imageUrl: asHttpUrl(raw.imageUrl),
    mrp: asNumber(raw.mrp),
    sellingPrice: asNumber(raw.sellingPrice),
    stockQuantity: asNumber(raw.stockQuantity),
    thresholdQuantity: asNumber(raw.thresholdQuantity),
    unit: asText(raw.unit),
    unitValue: asText(raw.unitValue),
    expiryDate: asText(raw.expiryDate) || null,
    categoryName: extras?.categoryName || asText(raw.categoryName),
    hasVariants: !!raw.hasVariants || variantsSource.length > 0,
    variants: variantsSource.map(normalizeVariant).filter((item: ProductVariantItem | null): item is ProductVariantItem => item !== null),
    attributeTypes,
    unlisted: !!raw.unlisted,
    active: raw.active !== false,
  };
};

const extractProductsFromCategoryPayload = (payload: any): CatalogProductItem[] => {
  const source = unwrapCategoryObject(payload);
  if (!source) return [];
  const groups = Array.isArray(source) ? source : [source];
  const products: CatalogProductItem[] = [];
  groups.forEach((group: any) => {
    if (!group) return;
    const categoryId = asNumber(group.categoryId) || undefined;
    const categoryName = asText(group.categoryName);
    if (Array.isArray(group.subCategories)) {
      group.subCategories.forEach((sub: any) => {
        if (!sub || !Array.isArray(sub.products)) return;
        const subCategoryId = asNumber(sub.subCategoryId) || undefined;
        const subCategoryName = asText(sub.subCategoryName);
        sub.products.forEach((prod: any) => {
          const item = normalizeProduct(prod, { categoryId, categoryName, subCategoryId, subCategoryName });
          if (item) products.push(item);
        });
      });
    } else if (Array.isArray(group.products)) {
      group.products.forEach((prod: any) => {
        const item = normalizeProduct(prod, { categoryId, categoryName });
        if (item) products.push(item);
      });
    }
  });
  return products;
};

const collectSubCategories = (group: any): SubCategoryItem[] => {
  if (!group || !Array.isArray(group.subCategories)) return [];
  return group.subCategories.map((sub: any) => ({
    subCategoryId: asNumber(sub?.subCategoryId),
    subCategoryName: asText(sub?.subCategoryName) || 'General',
    products: Array.isArray(sub?.products)
      ? sub.products
          .map((prod: any) => normalizeProduct(prod, {
            categoryId: asNumber(group.categoryId) || undefined,
            categoryName: asText(group.categoryName),
            subCategoryId: asNumber(sub?.subCategoryId) || undefined,
            subCategoryName: asText(sub?.subCategoryName),
          }))
          .filter((item: CatalogProductItem | null): item is CatalogProductItem => item !== null)
      : [],
  })).filter((sub: SubCategoryItem) => sub.subCategoryId > 0);
};

const buildVariantRequest = (variant: ProductVariantItem, fallbackBrand = '', fallbackExpiry = '') => {
  const attributes = { ...(variant.attributes || {}) };
  if (variant.unit && !attributes.unit) attributes.unit = variant.unit;
  if (variant.unitValue && !attributes.unitValue) attributes.unitValue = variant.unitValue;
  const payload: Record<string, any> = {
    variantName: asText(variant.variantName) || 'Variant',
    brand: asText(variant.brand) || asText(fallbackBrand),
    mrp: asNumber(variant.mrp, asNumber(variant.sellingPrice)),
    sellingPrice: asNumber(variant.sellingPrice),
    stockQuantity: asNumber(variant.stockQuantity),
    thresholdQuantity: asNumber(variant.thresholdQuantity),
    expiryDate: asText(variant.expiryDate) || asText(fallbackExpiry),
  };
  if (variant.id) payload.id = variant.id;
  if (asText(variant.shortDescription)) payload.shortDescription = asText(variant.shortDescription);
  if (asText(variant.longDescription)) payload.longDescription = asText(variant.longDescription);
  if (asText(variant.gstSlab)) payload.gstSlab = asText(variant.gstSlab);
  if (asHttpUrl(variant.imageUrl)) payload.imageUrl = asHttpUrl(variant.imageUrl);
  if (Object.keys(attributes).length > 0) payload.attributes = attributes;
  return payload;
};

const buildAttributeTypes = (productTypes?: string[], variants: ProductVariantItem[] = []): string[] => {
  const fromProduct = (Array.isArray(productTypes) ? productTypes : []).map(asText).filter(Boolean);
  if (fromProduct.length > 0) return fromProduct;
  const keys = new Set<string>();
  variants.forEach((variant) => {
    Object.keys(variant.attributes || {}).forEach((key) => keys.add(key));
    if (variant.unit) keys.add('unit');
    if (variant.unitValue) keys.add('unitValue');
  });
  return Array.from(keys);
};

const getVariantPackLabel = (variant: ProductVariantItem, product?: CatalogProductItem): string => {
  const pack = [asText(variant.unitValue), asText(variant.unit)].filter(Boolean).join(' ');
  if (pack) return pack;
  if (product) {
    const fallback = [asText(product.unitValue), asText(product.unit)].filter(Boolean).join(' ');
    if (fallback) return fallback;
  }
  const attrValues = Object.values(variant.attributes || {}).filter(Boolean);
  if (attrValues.length > 0) return attrValues.join(' · ');
  return asText(variant.variantName) || 'Pack';
};

const getVariantTitle = (variant: ProductVariantItem, product: CatalogProductItem): string =>
  asText(variant.variantName) || asText(product.productName) || 'Product';

const getVariantHeroImage = (variant: ProductVariantItem | undefined, product: CatalogProductItem): string | null =>
  asHttpUrl(variant?.imageUrl) || asHttpUrl(product.imageUrl);

const getVariantAttributeLabel = (variant: ProductVariantItem, product: CatalogProductItem): string => {
  const attributes = variant.attributes || {};
  const keys = Object.keys(attributes).filter((key) => !['unit', 'unitValue', 'Unit', 'UnitValue'].includes(key));
  if (keys.length > 0) {
    return `${keys[0]}: ${attributes[keys[0]]}`;
  }
  const pack = getVariantPackLabel(variant, product);
  return pack ? `Pack: ${pack}` : '';
};

const getProductVariantOptions = (product: CatalogProductItem): ProductVariantItem[] => {
  if (product && Array.isArray(product.variants) && product.variants.length > 0) {
    return product.variants;
  }
  return [{
    id: 0,
    variantName: product.productName || 'Pack',
    brand: product.brand || '',
    unit: product.unit || '',
    unitValue: product.unitValue || '',
    mrp: product.mrp,
    sellingPrice: product.sellingPrice,
    stockQuantity: product.stockQuantity,
    thresholdQuantity: product.thresholdQuantity,
    imageUrl: product.imageUrl,
    expiryDate: product.expiryDate || '',
    shortDescription: product.shortDescription,
    attributes: {},
    active: product.active !== false,
  }];
};

const VARIANT_THUMB_SIZE = 62;
const VARIANT_THUMB_GAP = 10;
const VARIANT_THUMB_STEP = VARIANT_THUMB_SIZE + VARIANT_THUMB_GAP;

interface ProductDetailPopupProps {
  product: CatalogProductItem;
  products: CatalogProductItem[];
  selectedVariantIndex: number;
  savedIds: Set<number>;
  onClose: () => void;
  onSelectVariant: (index: number) => void;
  onSwitchProduct: (item: CatalogProductItem) => void;
  onEdit: (item: CatalogProductItem) => void;
  onToggleSave: (id: number) => void;
}

const ProductDetailPopup = ({
  product,
  products,
  selectedVariantIndex,
  savedIds,
  onClose,
  onSelectVariant,
  onSwitchProduct,
  onEdit,
  onToggleSave,
}: ProductDetailPopupProps) => {
  const options = getProductVariantOptions(product);
  const safeIndex = selectedVariantIndex >= 0 && selectedVariantIndex < options.length ? selectedVariantIndex : 0;
  const selected = options[safeIndex] || options[0];
  const heroImage = getVariantHeroImage(selected, product);
  const attributeLabel = selected ? getVariantAttributeLabel(selected, product) : '';
  const packLabel = selected ? getVariantPackLabel(selected, product) : '';
  const title = selected ? getVariantTitle(selected, product) : product.productName;
  const description = asText(selected?.shortDescription) || asText(product.shortDescription);
  const isSaved = savedIds.has(product.shopProductId);
  const storyProducts = Array.isArray(products) ? products : [];
  const thumbScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    thumbScrollRef.current?.scrollTo({ x: Math.max(0, safeIndex) * VARIANT_THUMB_STEP, animated: true });
  }, [safeIndex, product.shopProductId]);

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

  return (
    <View style={styles.pdpOverlay}>
      <View style={styles.pdpCard}>
        <View style={styles.pdpHero}>
          {heroImage ? (
            <Image source={{ uri: heroImage }} style={styles.pdpHeroImage} />
          ) : (
            <View style={styles.pdpHeroFallback}>
              <Text style={styles.pdpHeroFallbackText}>{(title || 'P').charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <TouchableOpacity style={styles.pdpHeroBtnLeft} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2B1E1A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <Path d="m6 9 6 6 6-6" />
            </Svg>
          </TouchableOpacity>
          <View style={styles.pdpHeroBtnRow}>
            <TouchableOpacity style={styles.pdpIconBtn} onPress={() => onToggleSave(product.shopProductId)}>
              <Svg width="18" height="18" viewBox="0 0 24 24" fill={isSaved ? '#D2691E' : 'none'} stroke={isSaved ? '#D2691E' : '#2B1E1A'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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
          {options.length > 1 ? (
            <View style={styles.pdpDots}>
              {options.map((variant, index) => (
                <TouchableOpacity
                  key={`dot_${product.shopProductId}_${variant.id || index}`}
                  style={[styles.pdpDot, index === safeIndex && styles.pdpDotActive]}
                  onPress={() => onSelectVariant(index)}
                />
              ))}
            </View>
          ) : null}
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
              return (
                <TouchableOpacity
                  key={`thumb_${product.shopProductId}_${variant.id || index}`}
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
              );
            })}
          </ScrollView>
        </ScrollView>

        <View style={styles.pdpFooter}>
          <View>
            <Text style={styles.pdpFooterPack}>{packLabel || getVariantPackLabel(selected, product)}</Text>
            <View style={styles.pricingRowStack}>
              <Text style={styles.pdpFooterPrice}>₹{selected?.sellingPrice ?? 0}</Text>
              {selected?.mrp ? <Text style={styles.mrpCrossedVal}>₹{selected.mrp}</Text> : null}
            </View>
          </View>
          <TouchableOpacity style={styles.pdpAddBtn} onPress={() => onEdit(product)} activeOpacity={0.85}>
            <Text style={styles.pdpAddBtnText}>ADD</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.pdpStoryBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pdpStoryRow}>
          {storyProducts.map((item) => {
            const active = item.shopProductId === product.shopProductId;
            const storyImage = asHttpUrl(item.imageUrl);
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
    </View>
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
  const safeBrand = String(item.brand || 'General');
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

export const CategoryView: React.FC<CategoryViewProps> = ({ onNavigate, authToken }) => {
  const [serverGroups, setServerGroups] = useState<ServerCategoryGroup[]>([]);
  const [backendCategoryFilteredProducts, setBackendCategoryFilteredProducts] = useState<CatalogProductItem[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [categoriesList, setCategoriesList] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [categoryMetadataMap, setCategoryMetadataMap] = useState<Record<string, number>>({});
  const [selectedSubCategoryId, setSelectedSubCategoryId] = useState<number | null>(null);
  const [removedVariantIds, setRemovedVariantIds] = useState<number[]>([]);
  const [prodAttributeTypes, setProdAttributeTypes] = useState<string[]>([]);

  const [showSidebar, setShowSidebar] = useState<boolean>(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState<boolean>(false);
  const [variantSheetProduct, setVariantSheetProduct] = useState<CatalogProductItem | null>(null);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState<number>(0);
  const [savedProductIds, setSavedProductIds] = useState<Set<number>>(new Set());
  
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
      const response = await fetch(adminCatalogUrls.tree(), {
        method: 'GET',
        headers: catalogAuthHeaders(resolvedToken)
      });

      if (!response.ok) {
        setIsLoading(false);
        return;
      }

      const responseText = await response.text();
      const itemsData = parseJsonSafe(responseText);
      if (itemsData == null) {
        setIsLoading(false);
        return;
      }

      const safeItems = unwrapCategoryList(itemsData);
      const normalizedGroups: ServerCategoryGroup[] = safeItems.map((group: any) => {
        const subCategories = collectSubCategories(group);
        const extractedProducts = extractProductsFromCategoryPayload(group);

        return {
          categoryId: group?.categoryId,
          categoryName: group?.categoryName ? String(group.categoryName) : 'General',
          subCategories,
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
        const firstGroup = normalizedGroups.find((group) => group.categoryName === firstCatName) || normalizedGroups[0];
        const firstSubId = firstGroup?.subCategories && firstGroup.subCategories.length > 0
          ? firstGroup.subCategories[0].subCategoryId
          : null;
        setSelectedSubCategoryId(firstSubId);
        if (firstGroup && Array.isArray(firstGroup.subCategories) && firstGroup.subCategories.length > 0) {
          fetchProductsForCategoryGroup(firstGroup, resolvedToken);
        } else {
          setBackendCategoryFilteredProducts(firstGroup?.products || []);
        }
      }
    } catch (err) {
      console.log("Sync error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProductsBySubCategory = async (subCategoryId: number, overrideToken?: string): Promise<CatalogProductItem[]> => {
    try {
      const token = overrideToken || authToken || (await AsyncStorage.getItem('user_auth_token'));
      if (!token) return [];

      const response = await fetch(adminCatalogUrls.bySubCategory(subCategoryId), {
        method: 'GET',
        headers: catalogAuthHeaders(token.trim())
      });

      if (!response.ok) return [];
      const resText = await response.text();
      return extractProductsFromCategoryPayload(parseJsonSafe(resText));
    } catch (error) {
      return [];
    }
  };

  const fetchProductsForCategoryGroup = async (group: ServerCategoryGroup, overrideToken?: string) => {
    const subCategories = Array.isArray(group.subCategories) ? group.subCategories : [];
    if (subCategories.length === 0) {
      setBackendCategoryFilteredProducts(Array.isArray(group.products) ? group.products : []);
      return;
    }

    try {
      const lists = await Promise.all(
        subCategories.map((sub) => fetchProductsBySubCategory(sub.subCategoryId, overrideToken))
      );
      const merged: CatalogProductItem[] = [];
      const seen = new Set<number>();
      lists.forEach((list) => {
        list.forEach((item) => {
          if (!seen.has(item.shopProductId)) {
            seen.add(item.shopProductId);
            merged.push(item);
          }
        });
      });
      setBackendCategoryFilteredProducts(merged);
    } catch (error) {
      setBackendCategoryFilteredProducts(Array.isArray(group.products) ? group.products : []);
    }
  };

  const handleCategoryClick = (categoryName: string) => {
    setSelectedCategory(categoryName);
    const matchedGroup = (Array.isArray(serverGroups) ? serverGroups : []).find(
      (group) => group && group.categoryName === categoryName
    );
    const subCategories = matchedGroup && Array.isArray(matchedGroup.subCategories) ? matchedGroup.subCategories : [];
    const firstSubId = subCategories.length > 0 ? subCategories[0].subCategoryId : null;
    setSelectedSubCategoryId(firstSubId);
    if (matchedGroup) {
      setBackendCategoryFilteredProducts(Array.isArray(matchedGroup.products) ? matchedGroup.products : []);
      fetchProductsForCategoryGroup(matchedGroup);
    } else {
      setBackendCategoryFilteredProducts([]);
    }
  };

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
      const response = await fetch(adminCatalogUrls.visibility(shopProductId, nextActiveState), {
        method: 'PATCH',
        headers: catalogAuthHeaders(fastToken.trim())
      });
      if (!response.ok) {
        console.log("Visibility sync error:", response.status);
      }
    } catch (error) {
      console.log("Visibility sync error:", error);
    }
  }, [authToken]);

  const closeVariantSheet = useCallback(() => {
    setVariantSheetProduct(null);
    setSelectedVariantIndex(0);
  }, []);

  const openVariantSheet = useCallback((item: CatalogProductItem) => {
    if (!item) return;
    setSelectedVariantIndex(0);
    setVariantSheetProduct(item);
  }, []);

  const selectVariantInSheet = useCallback((index: number) => {
    setSelectedVariantIndex(index);
  }, []);

  const switchProductInSheet = useCallback((item: CatalogProductItem) => {
    if (!item) return;
    setSelectedVariantIndex(0);
    setVariantSheetProduct(item);
  }, []);

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
    setProdAttributeTypes(Array.isArray(item.attributeTypes) ? item.attributeTypes : []);
    if (item.subCategoryId) {
      setSelectedSubCategoryId(item.subCategoryId);
    }
    
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
    setRemovedVariantIds([]);
    setProdAttributeTypes([]);
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

    const matchedGroup = (Array.isArray(serverGroups) ? serverGroups : []).find(
      (group) => group && group.categoryName === selectedCategory
    );
    const groupSubId = matchedGroup && Array.isArray(matchedGroup.subCategories) && matchedGroup.subCategories.length > 0
      ? matchedGroup.subCategories[0].subCategoryId
      : null;
    const resolvedSubCategoryId = selectedSubCategoryId || groupSubId;

    if (!isEditingMode && !resolvedSubCategoryId) {
      Alert.alert("Subcategory required", "Select a category that has a subcategory before adding a product.");
      return;
    }

    const safeVariants = Array.isArray(tempVariantsList) ? tempVariantsList : [];
    const existingVariants = safeVariants.filter((variant) => asNumber(variant.id) > 0);
    const newVariants = safeVariants.filter((variant) => !variant.id || asNumber(variant.id) <= 0);
    const attributeTypes = buildAttributeTypes(prodAttributeTypes, safeVariants);
    const productImage = asHttpUrl(productImageTarget);

    const productPayload: Record<string, any> = {
      productName: prodNameInput.trim(),
      sellingPrice: parseFloat(prodPriceInput) || 0,
      stockQuantity: parseInt(prodStockQty, 10) || 0,
      shortDescription: prodShortDesc.trim(),
      longDescription: prodLongDesc.trim(),
      brand: prodBrandInput.trim(),
      mrp: parseFloat(prodMrpInput) || parseFloat(prodPriceInput) || 0,
      thresholdQuantity: parseInt(prodThresholdQty, 10) || 0,
      unit: prodUnitType.trim(),
      unitValue: prodUnitVal.trim(),
      expiryDate: prodExpiryDate || '2026-07-26',
      hasVariants: prodHasVariants || safeVariants.length > 0,
    };
    if (productImage) productPayload.imageUrl = productImage;
    if (attributeTypes.length > 0) productPayload.attributeTypes = attributeTypes;

    setIsLoading(true);
    try {
      const headers = catalogAuthHeaders(fastToken.trim(), true);

      if (isEditingMode && targetEditProductId !== null) {
        for (const variantId of removedVariantIds) {
          const deleteResponse = await fetch(adminCatalogUrls.deleteVariant(variantId), {
            method: 'DELETE',
            headers: catalogAuthHeaders(fastToken.trim()),
          });
          if (!deleteResponse.ok) {
            const errBody = parseJsonSafe(await deleteResponse.text()) || {};
            Alert.alert("Server Rejected", errBody.message || "Could not delete a variant.");
            return;
          }
        }

        const updatePayload = {
          ...productPayload,
          variants: existingVariants.map((variant) => buildVariantRequest(variant, prodBrandInput, prodExpiryDate)),
        };
        const updateResponse = await fetch(adminCatalogUrls.updateProduct(targetEditProductId), {
          method: 'PUT',
          headers,
          body: JSON.stringify(updatePayload),
        });
        if (!updateResponse.ok) {
          const errBody = parseJsonSafe(await updateResponse.text()) || {};
          Alert.alert("Server Rejected", errBody.message || "Failed to update product.");
          return;
        }

        for (const variant of existingVariants) {
          await fetch(adminCatalogUrls.updateVariant(variant.id), {
            method: 'PUT',
            headers,
            body: JSON.stringify(buildVariantRequest(variant, prodBrandInput, prodExpiryDate)),
          });
        }

        if (newVariants.length > 0) {
          const addVariantResponse = await fetch(adminCatalogUrls.addVariants(), {
            method: 'POST',
            headers,
            body: JSON.stringify({
              parentShopProductId: targetEditProductId,
              attributeTypes: attributeTypes.length > 0 ? attributeTypes : ['Unit'],
              variants: newVariants.map((variant) => buildVariantRequest(variant, prodBrandInput, prodExpiryDate)),
            }),
          });
          if (!addVariantResponse.ok) {
            const errBody = parseJsonSafe(await addVariantResponse.text()) || {};
            Alert.alert("Server Rejected", errBody.message || "Product updated, but new variants were not added.");
          }
        }

        syncInventoryFromServer(fastToken.trim());
        closeFormAndWipeDataBuffers();
        Alert.alert("Success", "Product updated successfully!");
        return;
      }

      const createPayload = {
        ...productPayload,
        subCategoryId: resolvedSubCategoryId,
        variants: safeVariants.map((variant) => buildVariantRequest(variant, prodBrandInput, prodExpiryDate)),
      };
      const response = await fetch(adminCatalogUrls.addUnlisted(), {
        method: 'POST',
        headers,
        body: JSON.stringify(createPayload),
      });

      if (response.status === 200 || response.status === 201) {
        syncInventoryFromServer(fastToken.trim());
        closeFormAndWipeDataBuffers();
        Alert.alert("Success", "Product added successfully!");
      } else {
        const errBody = parseJsonSafe(await response.text()) || {};
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
      
      await fetch(adminCatalogUrls.visibility(idToDelete, false), {
        method: 'PATCH',
        headers: catalogAuthHeaders(fastToken.trim())
      });
    } catch (err) {}
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
      expiryDate: vExpiryDate || prodExpiryDate || '2026-07-26',
      attributes,
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
    setTempVariantsList(prev => {
      const list = Array.isArray(prev) ? prev : [];
      const target = list[indexToRemove];
      if (target && asNumber(target.id) > 0) {
        setRemovedVariantIds((ids) => (ids.includes(target.id) ? ids : [...ids, target.id]));
      }
      return list.filter((_, idx) => idx !== indexToRemove);
    });
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
        <TouchableOpacity 
          style={[styles.leftPlusActionBtn, showSidebar && { backgroundColor: '#D2691E' }]} 
          onPress={() => setShowSidebar(!showSidebar)} 
          activeOpacity={0.7}
        >
          <Text style={[styles.headerToggleText, showSidebar && { color: '#FFFFFF' }]}>☰</Text>
        </TouchableOpacity>
        
        <Text style={styles.mainHeaderTitle}>Products & Categories</Text>

        <TouchableOpacity 
          style={[styles.rightPlusActionBtn, isProductModalOpen && { backgroundColor: '#2B1E1A' }]} 
          onPress={() => setIsProductModalOpen(true)} 
          activeOpacity={0.7}
        >
          <Text style={[styles.headerPlusText, isProductModalOpen && { color: '#FFFFFF' }]}>＋</Text>
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
                    <Text style={styles.plusVariantIconSymbol}>＋</Text>
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
            onEdit={(item) => {
              closeVariantSheet();
              openProductForEditingAction(item);
            }}
            onToggleSave={toggleSavedProduct}
          />
        ) : null}
      </Modal>

      <BottomNavBar onNavigate={onNavigate} currentActive="category" />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  viewMainWrapper: { flex: 1, backgroundColor: '#FFFBF7' },
  topControlHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F0E2D3', backgroundColor: '#FFFFFF' },
  leftPlusActionBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: '#FFF5EA' },
  rightPlusActionBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: '#F5ECE2' },
  headerToggleText: { fontSize: 16, fontWeight: '800', color: '#D2691E' },
  headerPlusText: { fontSize: 16, fontWeight: '800', color: '#2B1E1A' },
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
    marginTop: 28,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  pdpHero: { height: 280, backgroundColor: '#FFF8F1', position: 'relative' },
  pdpHeroImage: { width: '100%', height: '100%', resizeMode: 'cover' },
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
  pdpDots: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pdpDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.55)', marginHorizontal: 3 },
  pdpDotActive: { backgroundColor: '#FFFFFF', width: 8, height: 8, borderRadius: 4 },
  pdpBody: { flex: 1, paddingHorizontal: 16, paddingTop: 14 },
  pdpBrandLink: { fontSize: 13, fontWeight: '700', color: '#1E6BFF', marginBottom: 8 },
  pdpTitle: { fontSize: 22, fontWeight: '800', color: '#2B1E1A', lineHeight: 28 },
  pdpSubtitle: { fontSize: 13, color: '#8A7A6A', fontWeight: '600', marginTop: 6 },
  pdpAttr: { fontSize: 13, color: '#5C4033', fontWeight: '700', marginTop: 10, marginBottom: 12 },
  pdpThumbRow: { paddingBottom: 16, paddingRight: 8 },
  pdpThumb: {
    width: VARIANT_THUMB_SIZE,
    height: VARIANT_THUMB_SIZE,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#F0E2D3',
    overflow: 'hidden',
    marginRight: VARIANT_THUMB_GAP,
    backgroundColor: '#FFF8F1',
  },
  pdpThumbActive: { borderColor: '#1E6BFF', borderWidth: 2.5 },
  pdpThumbImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  pdpThumbFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pdpThumbFallbackText: { fontSize: 16, fontWeight: '800', color: '#D2691E' },
  pdpFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0E2D3',
    backgroundColor: '#FFFFFF',
  },
  pdpFooterPack: { fontSize: 12, fontWeight: '700', color: '#8A7A6A', marginBottom: 2 },
  pdpFooterPrice: { fontSize: 22, fontWeight: '800', color: '#2B1E1A', marginRight: 8 },
  pdpAddBtn: {
    minWidth: 148,
    height: 46,
    borderRadius: 10,
    backgroundColor: '#1E6BFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  pdpAddBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.4 },
  pdpStoryBar: { paddingVertical: 10, paddingBottom: 16, backgroundColor: 'transparent' },
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
