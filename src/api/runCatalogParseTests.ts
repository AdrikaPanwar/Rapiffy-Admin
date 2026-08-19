import {
  extractProductsFromCategoryPayload,
  getProductVariantOptions,
  getVariantAttributeLabel,
  getVariantPackLabel,
  getVariantTitle,
  normalizeProduct,
} from './adminCatalog';

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const iceCreamPayload = {
  data: {
    categoryId: 4,
    categoryName: 'Ice Cream',
    subCategoryId: 18,
    products: [
      {
        shopProductId: 101,
        productName: "Kwality Wall's Vanilla Ice Cream Tub",
        shortDescription: 'Rich & creamy milk ice cream',
        brand: "Kwality Wall's",
        imageUrl: 'https://cdn.example.com/vanilla.png',
        sellingPrice: 145,
        mrp: 180,
        unit: 'ml',
        unitValue: '700',
        stockQuantity: 24,
        attributeTypes: ['Flavour'],
        hasVariants: true,
        variants: [
          {
            id: 11,
            variantName: 'Vanilla',
            imageUrl: 'https://cdn.example.com/vanilla.png',
            sellingPrice: 145,
            mrp: 180,
            unit: 'ml',
            unitValue: '700',
            stockQuantity: 24,
            attributes: { Flavour: 'Vanilla' },
            shortDescription: 'Rich & creamy milk ice cream',
          },
          {
            variantId: 12,
            variantName: 'Chocolate',
            imageUrl: 'https://cdn.example.com/choco.png',
            sellingPrice: 155,
            unit: 'ml',
            unitValue: '700',
            attributes: { Flavour: 'Chocolate' },
          },
        ],
      },
    ],
  },
};

const flatProductList = [
  {
    shopProductId: 202,
    productName: 'Amul Butter',
    brand: 'Amul',
    sellingPrice: 58,
    variants: [],
  },
];

const variantKeyPayload = {
  shopProductId: 303,
  productName: 'Maggi',
  productVariants: [
    { shopProductVariantId: 9, name: 'Masala', price: 14, quantity: '70', uom: 'g', image: 'https://cdn.example.com/maggi.png' },
  ],
};

const productsFromGroup = extractProductsFromCategoryPayload(iceCreamPayload);
assert(productsFromGroup.length === 1, 'expected 1 product from category group payload');
const iceCream = productsFromGroup[0];
assert(iceCream.productName === "Kwality Wall's Vanilla Ice Cream Tub", 'productName mapping failed');
assert(iceCream.variants.length === 2, 'variants were not parsed from group payload');
assert(iceCream.variants[1].id === 12, 'variantId fallback failed');

const options = getProductVariantOptions(iceCream);
assert(options.length === 2, 'popup should show both variant thumbnails');
assert(getVariantTitle(options[0], iceCream) === iceCream.productName, 'title must stay the product name');
assert(getVariantAttributeLabel(options[0], iceCream) === 'Flavour: Vanilla', 'flavour label mapping failed');
assert(getVariantPackLabel(options[0], iceCream) === '700 ml', 'pack label mapping failed');

const fromFlat = extractProductsFromCategoryPayload(flatProductList);
assert(fromFlat.length === 1 && fromFlat[0].shopProductId === 202, 'flat product array payload failed');

const maggi = normalizeProduct(variantKeyPayload);
assert(maggi && maggi.variants.length === 1, 'productVariants alias failed');
assert(maggi && maggi.variants[0].id === 9, 'shopProductVariantId failed');
assert(maggi && maggi.variants[0].unitValue === '70', 'unitValue alias failed');

const ignoredCategory = extractProductsFromCategoryPayload({
  categoryId: 1,
  categoryName: 'Dairy',
  id: 1,
  products: [],
});
assert(ignoredCategory.length === 0, 'category groups should not be treated as products');

console.log('catalog parse tests passed');
