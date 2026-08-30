import {
  extractProductsFromCategoryPayload,
  getProductVariantOptions,
  getVariantAttributeLabel,
  getVariantPackLabel,
  getVariantTitle,
  parseMyProductsTree,
  mergeUniqueProducts,
  resolveAttributeTypes,
  buildAddVariantsBody,
  buildAddUnlistedBody,
  buildUpdateProductBody,
  buildVariantRequest,
  productsForSubCategory,
  firstSubCategoryId,
  parseAttributeTypesInput,
  asIsoDate,
  flattenSubCategories,
  productsAcrossTree,
  filterProductsBySearch,
  adminCatalogUrls,
  pickPersistableImageUrl,
  previewImageUri,
} from './adminCatalog';

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

/** Exact GET /v1/admin/catalog/my-products shape: List<CategoryProductsResponse> */
const liveTreePayload = [
  {
    categoryId: 4,
    categoryName: 'Dairy',
    subCategories: [
      {
        subCategoryId: 18,
        subCategoryName: 'Ice Cream',
        products: [
          {
            shopProductId: 101,
            masterProductId: 55,
            productName: 'Amul Vanilla Ice Cream Tub',
            brand: 'Amul',
            unit: 'ml',
            unitValue: '700',
            mrp: 180,
            sellingPrice: 145,
            stockQuantity: 24,
            thresholdQuantity: 5,
            imageUrl: 'https://cdn.example.com/amul-vanilla.png',
            shortDescription: 'Rich & creamy milk ice cream',
            expiryDate: '2026-12-01',
            hasVariants: true,
            active: true,
            unlisted: false,
            attributeTypes: ['Flavour'],
            variants: [
              {
                id: 11,
                variantName: 'Vanilla',
                brand: 'Amul',
                mrp: 180,
                sellingPrice: 145,
                stockQuantity: 12,
                thresholdQuantity: 2,
                imageUrl: 'https://cdn.example.com/vanilla.png',
                expiryDate: '2026-12-01',
                active: true,
                attributes: { Flavour: 'Vanilla' },
              },
              {
                id: 12,
                variantName: 'Chocolate',
                brand: 'Amul',
                mrp: 190,
                sellingPrice: 155,
                stockQuantity: 12,
                imageUrl: 'https://cdn.example.com/choco.png',
                active: true,
                attributes: { Flavour: 'Chocolate' },
              },
            ],
          },
        ],
      },
    ],
  },
];

const tree = parseMyProductsTree(liveTreePayload);
assert(tree.length === 1, 'tree should have 1 category');
assert(tree[0].categoryName === 'Dairy', 'categoryName mapping failed');
assert(tree[0].subCategories?.[0].subCategoryId === 18, 'subCategoryId mapping failed');
assert(tree[0].products.length === 1, 'tree products should come from subCategories[].products');

const amul = tree[0].products[0];
assert(amul.shopProductId === 101, 'shopProductId mapping failed');
assert(amul.productName === 'Amul Vanilla Ice Cream Tub', 'productName mapping failed');
assert(amul.variants.length === 2, 'variants from ShopProductResponse failed');
assert(amul.variants[0].id === 11, 'variant id mapping failed');
assert(amul.active === true, 'active flag mapping failed');

const fromSubCategory = extractProductsFromCategoryPayload(liveTreePayload[0]);
assert(fromSubCategory.length === 1, 'sub-category endpoint products failed');
assert(fromSubCategory[0].shopProductId === 101, 'sub-category shopProductId failed');

const options = getProductVariantOptions(amul);
assert(options.length === 2, 'popup should show API variants');
assert(getVariantTitle(options[0], amul) === amul.productName, 'title must stay the API productName');
assert(getVariantAttributeLabel(options[0], amul) === 'Flavour: Vanilla', 'Flavour attribute from API failed');
assert(getVariantPackLabel(options[0], amul) === '700 ml', 'pack should use parent unitValue+unit');
assert(getVariantPackLabel(options[1], amul) === '700 ml', 'variant without unit should inherit parent pack');

const hiddenProduct = extractProductsFromCategoryPayload({
  categoryId: 1,
  categoryName: 'Snacks',
  subCategories: [{
    subCategoryId: 2,
    subCategoryName: 'Chips',
    products: [{ shopProductId: 9, productName: 'Lays', isActive: false, sellingPrice: 20 }],
  }],
});
assert(hiddenProduct[0]?.active === false, 'isActive:false from API should hide the card');

const ignoredCategory = extractProductsFromCategoryPayload({
  categoryId: 1,
  categoryName: 'Dairy',
  id: 1,
  products: [],
});
assert(ignoredCategory.length === 0, 'empty category groups should not become products');

const unnamedDropped = parseMyProductsTree([{ categoryId: 9, subCategories: [], products: [] }]);
assert(unnamedDropped.length === 0, 'categories without API categoryName must not be invented');

const jeans = { shopProductId: 1, productName: 'Jeans' } as any;
const shirt = { shopProductId: 2, productName: 'women shirt pr 1' } as any;
const shrunk = mergeUniqueProducts([jeans, shirt], [shirt]);
assert(shrunk.length === 2, 'subcategory refresh must not drop tree products');
assert(shrunk[0].shopProductId === 1 && shrunk[1].shopProductId === 2, 'tree product order should stay');
const emptyRefresh = mergeUniqueProducts([jeans, shirt], []);
assert(emptyRefresh.length === 2, 'empty subcategory fetch must keep tree products');
const extra = mergeUniqueProducts([jeans], [{ shopProductId: 3, productName: 'New' } as any]);
assert(extra.length === 2 && extra[1].shopProductId === 3, 'subcategory fetch can add extra API products');

assert(resolveAttributeTypes(amul).join(',') === 'Flavour', 'attribute types should come from the API product');
const addBody = buildAddVariantsBody(amul, {
  id: 0,
  variantName: 'Butterscotch',
  brand: 'Amul',
  unit: 'ml',
  unitValue: '700',
  mrp: 160,
  sellingPrice: 150,
  stockQuantity: 8,
  thresholdQuantity: 0,
  imageUrl: 'https://cdn.example.com/butter.png',
  expiryDate: '2026-12-01',
  attributes: { Flavour: 'Butterscotch' },
});
assert(addBody.parentShopProductId === 101, 'parentShopProductId must be the API shopProductId');
assert(addBody.attributeTypes[0] === 'Flavour', 'POST variants requires attributeTypes');
assert(addBody.variants[0].variantName === 'Butterscotch', 'new variant payload mapping failed');
assert(addBody.variants[0].id == null, 'new variants must not send an id');

assert(asIsoDate('2026-08-29') === '2026-08-29', 'valid expiry date should pass through');
assert(asIsoDate('string') === '', 'swagger placeholder dates must be dropped');
assert(asIsoDate('2026-07-26T00:00:00') === '', 'non-date expiry must be dropped');
assert(parseAttributeTypesInput('Flavour, Size').join(',') === 'Flavour,Size', 'attribute type CSV parse failed');

const unnamedSub = parseMyProductsTree([{
  categoryId: 4,
  categoryName: 'Dairy',
  subCategories: [{ subCategoryId: 18, products: [] }],
}]);
assert(unnamedSub[0].subCategories?.[0].subCategoryName === '', 'unnamed subcategories must not become General');

assert(firstSubCategoryId(tree[0]) === 18, 'first subcategory id should come from the tree');
assert(productsForSubCategory(tree[0], null).length === 1, 'All should keep tree products');
assert(productsForSubCategory(tree[0], 18)[0].shopProductId === 101, 'subcategory filter should keep matching products');
assert(productsForSubCategory(tree[0], 99).length === 0, 'unknown subcategory must not invent products');

const addUnlisted = buildAddUnlistedBody(18, {
  productName: 'Farm Milk',
  sellingPrice: 42,
  stockQuantity: 6,
  brand: 'Amul',
  expiryDate: 'not-a-date',
  imageUrl: 'file://local-photo.jpg',
});
assert(addUnlisted.subCategoryId === 18, 'POST add-unlisted requires subCategoryId');
assert(addUnlisted.productName === 'Farm Milk', 'add-unlisted productName mapping failed');
assert(addUnlisted.expiryDate == null, 'invalid expiryDate must not be sent');
assert(addUnlisted.imageUrl == null, 'non-http imageUrl must not be sent');

assert(
  pickPersistableImageUrl('https://cdn.example.com/milk.png', 'file://local-photo.jpg') === 'https://cdn.example.com/milk.png',
  'typed https image URL must win over a gallery file',
);
assert(
  pickPersistableImageUrl('  https://cdn.example.com/milk.png  ', null) === 'https://cdn.example.com/milk.png',
  'typed https image URL must trim and persist',
);
assert(
  pickPersistableImageUrl('', 'file://local-photo.jpg') == null,
  'gallery file:// must not persist',
);
assert(
  pickPersistableImageUrl('content://media/1', 'ph://asset') == null,
  'device gallery URIs must not persist',
);
assert(
  pickPersistableImageUrl('', 'https://cdn.example.com/from-web.png') === 'https://cdn.example.com/from-web.png',
  'http gallery uri may persist',
);
assert(
  previewImageUri('', 'file://local-photo.jpg') === 'file://local-photo.jpg',
  'gallery file may preview locally',
);
assert(
  previewImageUri('https://cdn.example.com/milk.png', 'file://local-photo.jpg') === 'https://cdn.example.com/milk.png',
  'typed https URL must preview over gallery file',
);

const addWithUrl = buildAddUnlistedBody(18, {
  productName: 'Farm Milk',
  sellingPrice: 42,
  imageUrl: pickPersistableImageUrl('https://cdn.example.com/milk.png', 'file://local-photo.jpg'),
});
assert(addWithUrl.imageUrl === 'https://cdn.example.com/milk.png', 'typed https imageUrl must be sent on add-unlisted');

const updateBody = buildUpdateProductBody({
  productName: 'Farm Milk',
  sellingPrice: 45,
  hasVariants: true,
  attributeTypes: ['Flavour'],
});
assert(updateBody.productName === 'Farm Milk', 'PUT update productName mapping failed');
assert(updateBody.hasVariants === true, 'PUT update must send hasVariants');
assert(!('subCategoryId' in updateBody), 'PUT update must not send subCategoryId');

const variantPut = buildVariantRequest({
  id: 11,
  variantName: 'Vanilla',
  brand: 'Amul',
  unit: '',
  unitValue: '',
  mrp: 180,
  sellingPrice: 145,
  stockQuantity: 12,
  thresholdQuantity: 2,
  imageUrl: null,
  expiryDate: '',
  attributes: { Flavour: 'Vanilla' },
});
assert(variantPut.id === 11, 'PUT variant should include saved id');
assert(variantPut.expiryDate == null, 'PUT variant must omit empty expiryDate');
assert(variantPut.attributes.Flavour === 'Vanilla', 'PUT variant attributes mapping failed');

const shopTree = parseMyProductsTree([
  liveTreePayload[0],
  {
    categoryId: 8,
    categoryName: 'Cloth',
    subCategories: [{
      subCategoryId: 21,
      subCategoryName: 'Jeans',
      products: [{ shopProductId: 1, productName: 'Jeans', brand: 'TATA', sellingPrice: 10 }],
    }],
  },
]);
const subTiles = flattenSubCategories(shopTree);
assert(subTiles.length === 2, 'category page should list subcategories, not Cloth/Dairy');
assert(subTiles.every((tile) => tile.subCategoryId > 0), 'subcategory tiles need API ids');
assert(subTiles.map((tile) => tile.subCategoryName).join(',') === 'Ice Cream,Jeans', 'subcategory names should come from the tree');
assert(productsAcrossTree(shopTree, null).length === 2, 'product page default should show all products');
assert(productsAcrossTree(shopTree, 21).every((item) => item.shopProductId === 1), 'tapping Jeans should show only that subcategory');
assert(filterProductsBySearch(productsAcrossTree(shopTree, null), 'amul').length === 1, 'search should match product or brand');
assert(filterProductsBySearch(productsAcrossTree(shopTree, null), 'cloth').length === 0, 'search must not treat category names like Cloth as products');

const namedFromApi = flattenSubCategories(parseMyProductsTree([{
  categoryId: 8,
  categoryName: 'Cloth',
  subCategories: [
    { subCategoryId: 31, subCategoryName: 'shirt for men', products: [{ shopProductId: 4, productName: 'Formal Shirt' }] },
    { subCategoryId: 32, subCategoryName: 'shirt for women', products: [{ shopProductId: 5, productName: 'women shirt pr 1' }] },
  ],
}]));
assert(namedFromApi.map((tile) => tile.subCategoryName).join('|') === 'shirt for men|shirt for women', 'category tiles must use API subCategoryName only');
assert(namedFromApi.every((tile) => tile.subCategoryName !== 'Cloth'), 'parent categoryName must not become a subcategory tile');

assert(adminCatalogUrls.tree().endsWith('/v1/admin/catalog/my-products'), 'GET tree URL mismatch');
assert(adminCatalogUrls.bySubCategory(18).endsWith('/v1/admin/catalog/my-products/sub-category/18'), 'GET by subcategory URL mismatch');
assert(adminCatalogUrls.addUnlisted().endsWith('/v1/admin/catalog/add-unlisted'), 'POST add-unlisted URL mismatch');
assert(adminCatalogUrls.updateProduct(7).endsWith('/v1/admin/catalog/update/7'), 'PUT update product URL mismatch');
assert(adminCatalogUrls.visibility(7, false).endsWith('/v1/admin/catalog/visibility/7?active=false'), 'PATCH visibility URL mismatch');
assert(adminCatalogUrls.addVariants().endsWith('/v1/admin/catalog/variants'), 'POST variants URL mismatch');
assert(adminCatalogUrls.updateVariant(11).endsWith('/v1/admin/catalog/variants/11'), 'PUT variant URL mismatch');
assert(adminCatalogUrls.deleteVariant(11).endsWith('/v1/admin/catalog/variants/11'), 'DELETE variant URL mismatch');

const editUpdate = buildUpdateProductBody({
  productName: 'Farm Milk',
  sellingPrice: 45,
  hasVariants: true,
  attributeTypes: ['Flavour'],
  variants: [{
    id: 11,
    variantName: 'Vanilla',
    brand: 'Amul',
    unit: '',
    unitValue: '',
    mrp: 180,
    sellingPrice: 145,
    stockQuantity: 12,
    thresholdQuantity: 2,
    imageUrl: null,
    expiryDate: '2026-12-01',
    attributes: { Flavour: 'Vanilla' },
  }],
});
assert(editUpdate.variants[0].id === 11, 'PUT update must include saved variant id');
assert(!('subCategoryId' in editUpdate), 'PUT update must not send subCategoryId');

console.log('catalog parse tests passed');
