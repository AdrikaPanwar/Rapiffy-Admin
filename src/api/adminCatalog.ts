/** Shopkeeper catalog APIs from GET /v3/api-docs — Admin Catalog Controller. */
export const ADMIN_API_BASE = 'https://rapiffy-backend-1.onrender.com';

export const catalogAuthHeaders = (token: string, json = false): Record<string, string> => {
  const headers: Record<string, string> = {
    accept: '*/*',
    Authorization: `Bearer ${token}`,
  };
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
};

export const adminCatalogUrls = {
  tree: (): string => `${ADMIN_API_BASE}/v1/admin/catalog/my-products`,
  bySubCategory: (subCategoryId: number): string =>
    `${ADMIN_API_BASE}/v1/admin/catalog/my-products/sub-category/${subCategoryId}`,
  addUnlisted: (): string => `${ADMIN_API_BASE}/v1/admin/catalog/add-unlisted`,
  updateProduct: (shopProductId: number): string =>
    `${ADMIN_API_BASE}/v1/admin/catalog/update/${shopProductId}`,
  visibility: (shopProductId: number, active: boolean): string =>
    `${ADMIN_API_BASE}/v1/admin/catalog/visibility/${shopProductId}?active=${active ? 'true' : 'false'}`,
  addVariants: (): string => `${ADMIN_API_BASE}/v1/admin/catalog/variants`,
  updateVariant: (variantId: number): string =>
    `${ADMIN_API_BASE}/v1/admin/catalog/variants/${variantId}`,
  deleteVariant: (variantId: number): string =>
    `${ADMIN_API_BASE}/v1/admin/catalog/variants/${variantId}`,
};

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

export type ProductExtras = {
  categoryId?: number;
  categoryName?: string;
  subCategoryId?: number;
  subCategoryName?: string;
};

const UNIT_ATTR_KEYS = new Set(['unit', 'unitvalue', 'unit_value', 'uom', 'pack', 'packsize', 'size']);
const ATTR_LABEL_ORDER = ['flavour', 'flavor', 'colour', 'color', 'size', 'type', 'variant', 'weight'];

export class CatalogApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'CatalogApiError';
    this.status = status;
  }
}

export const catalogErrorMessage = (payload: any, status: number): string =>
  asText(payload?.message) || asText(payload?.error) || `Catalog API failed (${status})`;

export const readCatalogJson = async (response: Response): Promise<any> => {
  const text = await response.text();
  const json = parseJsonSafe(text);
  if (!response.ok) {
    throw new CatalogApiError(response.status, catalogErrorMessage(json, response.status));
  }
  return json;
};

const readActiveFlag = (raw: any): boolean => {
  if (typeof raw?.active === 'boolean') return raw.active;
  if (typeof raw?.isActive === 'boolean') return raw.isActive;
  return true;
};

export const asText = (value: any): string => {
  const text = String(value ?? '').trim();
  if (!text || text === 'string' || text === 'null' || text === 'undefined') return '';
  return text;
};

export const asHttpUrl = (value: any): string | null => {
  const text = asText(value);
  return text.startsWith('http') ? text : null;
};

export const asNumber = (value: any, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const asAttributeMap = (raw: any): Record<string, string> => {
  if (!raw) return {};
  if (Array.isArray(raw)) {
    const mapped: Record<string, string> = {};
    raw.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const key = asText(entry.key ?? entry.name ?? entry.attributeName ?? entry.type);
      const val = asText(entry.value ?? entry.attributeValue ?? entry.val);
      if (key && val) mapped[key] = val;
    });
    return mapped;
  }
  if (typeof raw !== 'object') return {};
  const mapped: Record<string, string> = {};
  Object.keys(raw).forEach((key) => {
    const val = asText(raw[key]);
    if (val) mapped[key] = val;
  });
  return mapped;
};

export const parseJsonSafe = (text: string): any => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const unwrapPayload = (payload: any): any => {
  if (payload == null) return payload;
  if (typeof payload !== 'object') return payload;
  if (Array.isArray(payload)) return payload;
  if (payload.data !== undefined && payload.shopProductId == null && payload.products == null && payload.subCategories == null) {
    return unwrapPayload(payload.data);
  }
  if (payload.content !== undefined && payload.shopProductId == null && payload.products == null) {
    return unwrapPayload(payload.content);
  }
  if (payload.result !== undefined && payload.shopProductId == null && payload.products == null) {
    return unwrapPayload(payload.result);
  }
  return payload;
};

export const unwrapCategoryList = (payload: any): any[] => {
  const source = unwrapPayload(payload);
  if (Array.isArray(source)) return source;
  if (source && Array.isArray(source.data)) return source.data;
  if (source && Array.isArray(source.content)) return source.content;
  if (source && Array.isArray(source.categories)) return source.categories;
  if (source && typeof source === 'object') return [source];
  return [];
};

const collectVariantRows = (raw: any): any[] => {
  if (!raw || typeof raw !== 'object') return [];
  const candidates = [
    raw.variants,
    raw.productVariants,
    raw.shopProductVariants,
    raw.variantList,
    raw.variantResponses,
    raw.catalogVariants,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0) return candidate;
  }
  return Array.isArray(raw.variants) ? raw.variants : [];
};

export const normalizeVariant = (raw: any): ProductVariantItem | null => {
  if (!raw || typeof raw !== 'object') return null;
  const attributes = asAttributeMap(raw.attributes ?? raw.attributeMap ?? raw.variantAttributes);
  const unit = asText(raw.unit) || asText(attributes.unit) || asText(attributes.Unit) || asText(attributes.uom);
  const unitValue =
    asText(raw.unitValue) ||
    asText(raw.quantity) ||
    asText(attributes.unitValue) ||
    asText(attributes.UnitValue) ||
    asText(attributes.pack) ||
    asText(attributes.size);
  return {
    id: asNumber(raw.id ?? raw.variantId ?? raw.shopProductVariantId),
    variantName: asText(raw.variantName) || asText(raw.name) || 'Variant',
    brand: asText(raw.brand),
    unit,
    unitValue,
    mrp: asNumber(raw.mrp),
    sellingPrice: asNumber(raw.sellingPrice ?? raw.price),
    stockQuantity: asNumber(raw.stockQuantity ?? raw.stock),
    thresholdQuantity: asNumber(raw.thresholdQuantity ?? raw.threshold),
    imageUrl: asHttpUrl(raw.imageUrl ?? raw.image ?? raw.thumbnailUrl),
    expiryDate: asText(raw.expiryDate),
    shortDescription: asText(raw.shortDescription ?? raw.description),
    longDescription: asText(raw.longDescription),
    gstSlab: asText(raw.gstSlab),
    attributes,
    active: readActiveFlag(raw),
  };
};

export const normalizeProduct = (raw: any, extras?: ProductExtras): CatalogProductItem | null => {
  if (!raw || typeof raw !== 'object') return null;
  let shopProductId = asNumber(raw.shopProductId, NaN);
  if (!Number.isFinite(shopProductId) || shopProductId <= 0) {
    const looksLikeProduct = !!(raw.productName || raw.masterProductId || raw.hasVariants || collectVariantRows(raw).length);
    shopProductId = looksLikeProduct ? asNumber(raw.id, NaN) : NaN;
  }
  if (!Number.isFinite(shopProductId) || shopProductId <= 0) return null;
  const variants = collectVariantRows(raw)
    .map(normalizeVariant)
    .filter((item: ProductVariantItem | null): item is ProductVariantItem => item !== null);
  const attributeTypes = Array.isArray(raw.attributeTypes)
    ? raw.attributeTypes.map((item: any) => asText(item)).filter(Boolean)
    : [];
  const firstVariant = variants[0];
  return {
    shopProductId,
    masterProductId: asNumber(raw.masterProductId),
    categoryId: extras?.categoryId ?? (asNumber(raw.categoryId) || undefined),
    subCategoryId: extras?.subCategoryId ?? (asNumber(raw.subCategoryId) || undefined),
    subCategoryName: extras?.subCategoryName || asText(raw.subCategoryName),
    productName: asText(raw.productName) || asText(raw.name) || 'Product',
    shortDescription: asText(raw.shortDescription) || asText(firstVariant?.shortDescription),
    longDescription: asText(raw.longDescription),
    brand: asText(raw.brand) || asText(firstVariant?.brand),
    imageUrl: asHttpUrl(raw.imageUrl ?? raw.image) || asHttpUrl(firstVariant?.imageUrl),
    mrp: asNumber(raw.mrp, asNumber(firstVariant?.mrp)),
    sellingPrice: asNumber(raw.sellingPrice ?? raw.price, asNumber(firstVariant?.sellingPrice)),
    stockQuantity: asNumber(raw.stockQuantity ?? raw.stock, asNumber(firstVariant?.stockQuantity)),
    thresholdQuantity: asNumber(raw.thresholdQuantity, asNumber(firstVariant?.thresholdQuantity)),
    unit: asText(raw.unit) || asText(firstVariant?.unit),
    unitValue: asText(raw.unitValue) || asText(firstVariant?.unitValue),
    expiryDate: asText(raw.expiryDate) || null,
    categoryName: extras?.categoryName || asText(raw.categoryName),
    hasVariants: !!raw.hasVariants || variants.length > 0,
    variants,
    attributeTypes,
    unlisted: !!raw.unlisted,
    active: readActiveFlag(raw),
  };
};

const extractFromGroup = (group: any, products: CatalogProductItem[]) => {
  if (!group || typeof group !== 'object') return;
  const categoryId = asNumber(group.categoryId) || undefined;
  const categoryName = asText(group.categoryName);
  if (Array.isArray(group.subCategories)) {
    group.subCategories.forEach((sub: any) => {
      if (!sub) return;
      const extras: ProductExtras = {
        categoryId,
        categoryName,
        subCategoryId: asNumber(sub.subCategoryId) || undefined,
        subCategoryName: asText(sub.subCategoryName),
      };
      const rows = Array.isArray(sub.products) ? sub.products : [];
      rows.forEach((prod: any) => {
        const item = normalizeProduct(prod, extras);
        if (item) products.push(item);
      });
    });
  }
  if (Array.isArray(group.products)) {
    group.products.forEach((prod: any) => {
      const item = normalizeProduct(prod, {
        categoryId,
        categoryName,
        subCategoryId: asNumber(group.subCategoryId) || undefined,
        subCategoryName: asText(group.subCategoryName),
      });
      if (item) products.push(item);
    });
  }
};

export const extractProductsFromCategoryPayload = (payload: any): CatalogProductItem[] => {
  const source = unwrapPayload(payload);
  if (!source) return [];
  const products: CatalogProductItem[] = [];
  const seen = new Set<number>();
  const pushUnique = (item: CatalogProductItem | null) => {
    if (!item || seen.has(item.shopProductId)) return;
    seen.add(item.shopProductId);
    products.push(item);
  };

  const visit = (node: any) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== 'object') return;
    const looksLikeGroup = Array.isArray(node.subCategories) || Array.isArray(node.products) || Array.isArray(node.categories);
    if (looksLikeGroup) {
      const nested: CatalogProductItem[] = [];
      extractFromGroup(node, nested);
      nested.forEach(pushUnique);
      if (Array.isArray(node.categories)) node.categories.forEach(visit);
      return;
    }
    const asProduct = normalizeProduct(node);
    if (asProduct) pushUnique(asProduct);
  };

  visit(source);
  return products;
};

export const mergeUniqueProducts = (
  ...lists: Array<CatalogProductItem[] | null | undefined>
): CatalogProductItem[] => {
  const merged: CatalogProductItem[] = [];
  const seen = new Set<number>();
  lists.forEach((list) => {
    (Array.isArray(list) ? list : []).forEach((item) => {
      if (!item || !item.shopProductId || seen.has(item.shopProductId)) return;
      seen.add(item.shopProductId);
      merged.push(item);
    });
  });
  return merged;
};

export const parseMyProductsTree = (payload: any): ServerCategoryGroup[] => {
  const rows = unwrapCategoryList(payload);
  return rows
    .map((group: any) => {
      if (!group || typeof group !== 'object') return null;
      const subCategories = collectSubCategories(group);
      const products = extractProductsFromCategoryPayload(group);
      const categoryName = asText(group.categoryName);
      if (!categoryName) {
        return null;
      }
      return {
        categoryId: asNumber(group.categoryId) || undefined,
        categoryName,
        subCategories,
        products,
      } as ServerCategoryGroup;
    })
    .filter((group: ServerCategoryGroup | null): group is ServerCategoryGroup => group !== null);
};

export const collectSubCategories = (group: any): SubCategoryItem[] => {
  if (!group || !Array.isArray(group.subCategories)) return [];
  return group.subCategories
    .map((sub: any) => ({
      subCategoryId: asNumber(sub?.subCategoryId),
      subCategoryName: asText(sub?.subCategoryName),
      products: Array.isArray(sub?.products)
        ? sub.products
            .map((prod: any) =>
              normalizeProduct(prod, {
                categoryId: asNumber(group.categoryId) || undefined,
                categoryName: asText(group.categoryName),
                subCategoryId: asNumber(sub?.subCategoryId) || undefined,
                subCategoryName: asText(sub?.subCategoryName),
              })
            )
            .filter((item: CatalogProductItem | null): item is CatalogProductItem => item !== null)
        : [],
    }))
    .filter((sub: SubCategoryItem) => sub.subCategoryId > 0);
};

export const asIsoDate = (value: any): string => {
  const text = asText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
};

export const buildVariantRequest = (variant: ProductVariantItem, fallbackBrand = '', fallbackExpiry = '') => {
  const attributes = { ...(variant.attributes || {}) };
  if (variant.unit && !attributes.unit) attributes.unit = variant.unit;
  if (variant.unitValue && !attributes.unitValue) attributes.unitValue = variant.unitValue;
  const payload: Record<string, any> = {
    variantName: asText(variant.variantName) || 'Variant',
    mrp: asNumber(variant.mrp, asNumber(variant.sellingPrice)),
    sellingPrice: asNumber(variant.sellingPrice),
    stockQuantity: asNumber(variant.stockQuantity),
    thresholdQuantity: asNumber(variant.thresholdQuantity),
  };
  const brand = asText(variant.brand) || asText(fallbackBrand);
  if (brand) payload.brand = brand;
  const expiry = asIsoDate(variant.expiryDate) || asIsoDate(fallbackExpiry);
  if (expiry) payload.expiryDate = expiry;
  if (variant.id) payload.id = variant.id;
  if (asText(variant.shortDescription)) payload.shortDescription = asText(variant.shortDescription);
  if (asText(variant.longDescription)) payload.longDescription = asText(variant.longDescription);
  if (asText(variant.gstSlab)) payload.gstSlab = asText(variant.gstSlab);
  if (asHttpUrl(variant.imageUrl)) payload.imageUrl = asHttpUrl(variant.imageUrl);
  if (Object.keys(attributes).length > 0) payload.attributes = attributes;
  return payload;
};

export type ShopProductWriteFields = {
  productName?: string;
  shortDescription?: string;
  longDescription?: string;
  brand?: string;
  imageUrl?: string | null;
  mrp?: number;
  sellingPrice?: number;
  stockQuantity?: number;
  thresholdQuantity?: number;
  unit?: string;
  unitValue?: string;
  expiryDate?: string | null;
  hasVariants?: boolean;
  attributeTypes?: string[];
  variants?: ProductVariantItem[];
};

export const parseAttributeTypesInput = (value: string): string[] =>
  String(value || '')
    .split(',')
    .map((item) => asText(item))
    .filter(Boolean);

export const buildShopProductWriteBody = (
  fields: ShopProductWriteFields,
  fallbackBrand = '',
): Record<string, any> => {
  const body: Record<string, any> = {};
  if (asText(fields.productName)) body.productName = asText(fields.productName);
  if (asText(fields.shortDescription)) body.shortDescription = asText(fields.shortDescription);
  if (asText(fields.longDescription)) body.longDescription = asText(fields.longDescription);
  if (asText(fields.brand)) body.brand = asText(fields.brand);
  if (asHttpUrl(fields.imageUrl)) body.imageUrl = asHttpUrl(fields.imageUrl);
  if (fields.mrp != null) body.mrp = asNumber(fields.mrp);
  if (fields.sellingPrice != null) body.sellingPrice = asNumber(fields.sellingPrice);
  if (fields.stockQuantity != null) body.stockQuantity = asNumber(fields.stockQuantity);
  if (fields.thresholdQuantity != null) body.thresholdQuantity = asNumber(fields.thresholdQuantity);
  if (asText(fields.unit)) body.unit = asText(fields.unit);
  if (asText(fields.unitValue)) body.unitValue = asText(fields.unitValue);
  const expiry = asIsoDate(fields.expiryDate);
  if (expiry) body.expiryDate = expiry;
  if (typeof fields.hasVariants === 'boolean') body.hasVariants = fields.hasVariants;
  const types = (fields.attributeTypes || []).map(asText).filter(Boolean);
  if (types.length > 0) body.attributeTypes = types;
  if (Array.isArray(fields.variants) && fields.variants.length > 0) {
    body.variants = fields.variants.map((variant) =>
      buildVariantRequest(variant, asText(fields.brand) || fallbackBrand, expiry)
    );
  }
  return body;
};

export const buildAddUnlistedBody = (
  subCategoryId: number,
  fields: ShopProductWriteFields,
): Record<string, any> => ({
  subCategoryId,
  ...buildShopProductWriteBody(fields),
});

export const buildUpdateProductBody = (fields: ShopProductWriteFields): Record<string, any> =>
  buildShopProductWriteBody(fields);

export const findCategoryGroup = (
  groups: ServerCategoryGroup[] | null | undefined,
  categoryName: string,
): ServerCategoryGroup | null => {
  const name = asText(categoryName);
  if (!name || !Array.isArray(groups)) return null;
  return groups.find((group) => group && group.categoryName === name) || null;
};

export const firstSubCategoryId = (group: ServerCategoryGroup | null | undefined): number | null => {
  const first = (group?.subCategories || []).find((sub) => asNumber(sub.subCategoryId) > 0);
  return first ? first.subCategoryId : null;
};

export const productsForSubCategory = (
  group: ServerCategoryGroup | null | undefined,
  subCategoryId: number | null,
): CatalogProductItem[] => {
  if (!group) return [];
  const nested = (group.subCategories || []).flatMap((sub) => (Array.isArray(sub.products) ? sub.products : []));
  if (subCategoryId == null || subCategoryId <= 0) {
    return mergeUniqueProducts(group.products, nested);
  }
  const matchedNested = (group.subCategories || [])
    .filter((sub) => sub.subCategoryId === subCategoryId)
    .flatMap((sub) => (Array.isArray(sub.products) ? sub.products : []));
  const matchedTop = (Array.isArray(group.products) ? group.products : []).filter(
    (item) => item.subCategoryId === subCategoryId
  );
  return mergeUniqueProducts(matchedTop, matchedNested);
};

export interface CatalogSubCategoryTile {
  subCategoryId: number;
  subCategoryName: string;
  categoryId?: number;
  categoryName: string;
  products: CatalogProductItem[];
}

export const flattenSubCategories = (
  groups: ServerCategoryGroup[] | null | undefined,
): CatalogSubCategoryTile[] => {
  const tiles: CatalogSubCategoryTile[] = [];
  const seen = new Set<number>();
  (Array.isArray(groups) ? groups : []).forEach((group) => {
    (group.subCategories || []).forEach((sub) => {
      if (!sub || !sub.subCategoryId || seen.has(sub.subCategoryId)) return;
      seen.add(sub.subCategoryId);
      tiles.push({
        subCategoryId: sub.subCategoryId,
        subCategoryName: asText(sub.subCategoryName),
        categoryId: group.categoryId,
        categoryName: asText(group.categoryName),
        products: Array.isArray(sub.products) ? sub.products : [],
      });
    });
  });
  return tiles;
};

export const allProductsFromTree = (groups: ServerCategoryGroup[] | null | undefined): CatalogProductItem[] =>
  mergeUniqueProducts(
    ...(Array.isArray(groups) ? groups : []).map((group) => productsForSubCategory(group, null))
  );

export const productsAcrossTree = (
  groups: ServerCategoryGroup[] | null | undefined,
  subCategoryId: number | null,
): CatalogProductItem[] => {
  if (subCategoryId == null || subCategoryId <= 0) return allProductsFromTree(groups);
  return mergeUniqueProducts(
    ...(Array.isArray(groups) ? groups : []).map((group) => productsForSubCategory(group, subCategoryId))
  );
};

export const filterProductsBySearch = (
  products: CatalogProductItem[] | null | undefined,
  query: string,
): CatalogProductItem[] => {
  const list = Array.isArray(products) ? products : [];
  const needle = asText(query).toLowerCase();
  if (!needle) return list;
  return list.filter((item) => {
    const haystack = [
      item.productName,
      item.brand,
      item.subCategoryName,
      item.unit,
      item.unitValue,
      ...(Array.isArray(item.variants) ? item.variants.map((variant) => variant.variantName) : []),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  });
};

export const catalogSendJson = async (
  url: string,
  token: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: Record<string, any>,
): Promise<any> => {
  const response = await fetch(url, {
    method,
    headers: catalogAuthHeaders(token, body != null && method !== 'GET'),
    body: body != null && method !== 'GET' ? JSON.stringify(body) : undefined,
  });
  return readCatalogJson(response);
};

export const buildAttributeTypes = (productTypes?: string[], variants: ProductVariantItem[] = []): string[] => {
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

const UNIT_TYPE_KEYS = new Set(['unit', 'unitvalue', 'Unit', 'UnitValue']);

export const resolveAttributeTypes = (product: CatalogProductItem): string[] => {
  const built = buildAttributeTypes(product.attributeTypes, product.variants || []).filter(
    (key) => !UNIT_TYPE_KEYS.has(key)
  );
  if (built.length > 0) return built;
  return ['Flavour'];
};

export const buildAddVariantsBody = (product: CatalogProductItem, variant: ProductVariantItem) => {
  const attributeTypes = resolveAttributeTypes(product);
  return {
    parentShopProductId: product.shopProductId,
    attributeTypes,
    variants: [buildVariantRequest(variant, product.brand, product.expiryDate || '')],
  };
};

export const getVariantPackLabel = (variant: ProductVariantItem, product?: CatalogProductItem): string => {
  const pack = [asText(variant.unitValue), asText(variant.unit)].filter(Boolean).join(' ');
  if (pack) return pack;
  if (product) {
    const fallback = [asText(product.unitValue), asText(product.unit)].filter(Boolean).join(' ');
    if (fallback) return fallback;
  }
  const attrValues = Object.entries(variant.attributes || {})
    .filter(([key]) => UNIT_ATTR_KEYS.has(key.toLowerCase().replace(/\s+/g, '')))
    .map(([, value]) => value);
  if (attrValues.length > 0) return attrValues.join(' ');
  return asText(variant.variantName) || 'Pack';
};

export const getVariantTitle = (_variant: ProductVariantItem, product: CatalogProductItem): string =>
  asText(product.productName) || asText(_variant.variantName) || 'Product';

export const getVariantHeroImage = (variant: ProductVariantItem | undefined, product: CatalogProductItem): string | null =>
  asHttpUrl(variant?.imageUrl) || asHttpUrl(product.imageUrl);

const prettyAttrKey = (key: string): string => {
  const text = asText(key);
  if (!text) return 'Variant';
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export const getVariantAttributeLabel = (variant: ProductVariantItem, product: CatalogProductItem): string => {
  const attributes = variant.attributes || {};
  const entries = Object.entries(attributes).filter(([key, value]) => {
    if (!value) return false;
    return !UNIT_ATTR_KEYS.has(key.toLowerCase().replace(/\s+/g, ''));
  });
  const preferredFromTypes = (product.attributeTypes || [])
    .map((type) => entries.find(([key]) => key.toLowerCase() === type.toLowerCase()))
    .find(Boolean);
  if (preferredFromTypes) return `${prettyAttrKey(preferredFromTypes[0])}: ${preferredFromTypes[1]}`;

  const preferred = ATTR_LABEL_ORDER
    .map((name) => entries.find(([key]) => key.toLowerCase() === name))
    .find(Boolean);
  if (preferred) return `${prettyAttrKey(preferred[0])}: ${preferred[1]}`;
  if (entries.length > 0) return `${prettyAttrKey(entries[0][0])}: ${entries[0][1]}`;

  const variantName = asText(variant.variantName);
  const productName = asText(product.productName);
  const typeName = prettyAttrKey(product.attributeTypes?.[0] || 'Flavour');
  if (variantName && variantName !== productName && variantName.length <= 28) {
    return `${typeName}: ${variantName}`;
  }
  const pack = getVariantPackLabel(variant, product);
  return pack ? `Pack: ${pack}` : '';
};

export const getProductVariantOptions = (product: CatalogProductItem): ProductVariantItem[] => {
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

export const findProductById = (products: CatalogProductItem[], shopProductId: number): CatalogProductItem | null =>
  products.find((item) => item.shopProductId === shopProductId) || null;
