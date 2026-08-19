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
