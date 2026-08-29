import React from 'react';
import { CategoryView, type CategoryViewProps } from './CategoryView';

export type ProductViewProps = Omit<CategoryViewProps, 'mode'>;

export const ProductView: React.FC<ProductViewProps> = (props) => (
  <CategoryView {...props} mode="products" />
);
