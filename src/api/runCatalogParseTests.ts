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

console.log('catalog parse tests passed');
