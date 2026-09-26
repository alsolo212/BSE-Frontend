import { ListingCategory, ListingSummary } from '../listings/listing.models';

export type CatalogCategory = ListingCategory;
export type CatalogProduct = ListingSummary;

export interface CatalogHomeResponse {
  categories: CatalogCategory[];
  featuredListings: CatalogProduct[];
}

export interface CatalogProductsQuery {
  searchTerm?: string;
  categoryId?: string;
  city?: string;
  condition?: 'New' | 'Used';
  sortBy?: 'newest' | 'cheapest' | 'expensive';
}
