import React from 'react';
import { ProductView, type ProductViewProps } from './ProductView';

/** Coverage tab is now the Product page. */
export const CoverageView: React.FC<ProductViewProps> = (props) => (
  <ProductView {...props} />
);
